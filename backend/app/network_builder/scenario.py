"""BaseScenario adapter that runs any compiled `network.json` inside Traffis."""

from __future__ import annotations

import json
import logging
import math
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import traci

from ..scenarios.base import BaseScenario
from ..scenarios.net_geometry import NetGeometry, load_net_geometry
from ..scenarios.settings_loader import ScenarioSettings
from ..schemas import (
    ArmFlowMetrics,
    ArmLabel,
    CentreLine,
    EntryQueue,
    JunctionMetrics,
    MapCallout,
    NetworkGeometry,
    NetworkInfo,
    ODMetrics,
    ScenarioMetadata,
    SignalGroupTiming,
    SignalHead,
    SpawnOriginInfo,
    SpawnRequest,
    TrafficLightState,
)
from .compiler import CompileResult, compile_network
from .schema import (
    NetworkProject,
    edge_id_for,
    road_polyline,
)

logger = logging.getLogger("user_network_scenario")

QUEUE_ZONE_M = 80.0


def _state_from_chars(chars: List[str]) -> str:
    if any(c in ("G", "g") for c in chars):
        return "green"
    if any(c in ("y", "Y") for c in chars):
        return "yellow"
    return "red"


class UserNetworkScenario(BaseScenario):
    """Scenario backed by a `network.json` project file and its compiled SUMO build."""

    type = "intersection"
    demand_from_route_file = True
    apply_default_speed_limit = False

    def __init__(self, network_json_path: Path, build_dir: Optional[Path] = None):
        self.network_json_path = Path(network_json_path).resolve()
        self.build_dir = Path(build_dir).resolve() if build_dir else self.network_json_path.parent / "build"

        self.project: NetworkProject = self._load_project()
        self.id = f"net_{self.project.id}"
        self.name = self.project.name
        self.description = self.project.description or f"User network '{self.project.name}'"
        self.tl_id = next((j.id for j in self.project.junctions if j.type == "traffic_light"), "")
        self.tl_x = 0.0
        self.tl_y = 0.0

        self._compile_result: Optional[CompileResult] = None
        self._geometry: Optional[NetGeometry] = None
        self._network_info: Optional[NetworkInfo] = None
        # tl_id -> edge_id -> list of link indices
        self._tl_edge_links: Dict[str, Dict[str, List[int]]] = {}
        self._tl_approach_names: Dict[str, str] = {}
        self._signal_heads: List[SignalHead] = []
        self._flow_map: Dict[str, Tuple[str, str]] = {}  # flow_id -> (from_j, to_j)

        self.settings = ScenarioSettings(
            default_speed_kmh=self.project.settings.default_speed_kmh,
            vehicles_per_hour=0.0,
        )
        self.current_phase_idx = 0
        self.phase_timer = 0.0
        self.sumocfg_file = str(self.build_dir / f"{self.project.id}.sumocfg")
        self.bounds = self._estimate_bounds()
        self.default_camera = self._compute_default_camera(self.bounds)
        self._reset_metrics()

    def _load_project(self) -> NetworkProject:
        raw = json.loads(self.network_json_path.read_text(encoding="utf-8"))
        return NetworkProject.model_validate(raw)

    def _estimate_bounds(self) -> Dict[str, float]:
        xs = [j.x for j in self.project.junctions] or [-100.0, 100.0]
        ys = [j.y for j in self.project.junctions] or [-100.0, 100.0]
        return {
            "min_x": round(min(xs) - 40.0, 1),
            "max_x": round(max(xs) + 40.0, 1),
            "min_y": round(min(ys) - 40.0, 1),
            "max_y": round(max(ys) + 40.0, 1),
        }

    @staticmethod
    def _compute_default_camera(bounds: Dict[str, float]) -> Dict[str, Any]:
        cx = round((bounds["min_x"] + bounds["max_x"]) / 2.0, 1)
        cy = round((bounds["min_y"] + bounds["max_y"]) / 2.0, 1)
        span = max(bounds["max_x"] - bounds["min_x"], bounds["max_y"] - bounds["min_y"], 100.0)
        zoom = round(max(0.8, min(6.0, 900.0 / span)), 2)
        return {"x": cx, "y": cy, "zoom": zoom}

    def ensure_compiled(self, force: bool = False) -> CompileResult:
        self.project = self._load_project()
        self.name = self.project.name
        self.description = self.project.description or f"User network '{self.project.name}'"
        self.tl_id = next((j.id for j in self.project.junctions if j.type == "traffic_light"), "")
        self.settings.default_speed_kmh = self.project.settings.default_speed_kmh

        result = compile_network(self.project, self.build_dir, force=force)
        if self._compile_result is None or self._compile_result.content_hash != result.content_hash or force:
            self._compile_result = result
            self.sumocfg_file = str(result.sumocfg_file)
            self._geometry = load_net_geometry(result.net_file)
            self.bounds = self._geometry.bounds(margin=30.0)
            self.default_camera = self._compute_default_camera(self.bounds)
            self._extract_signal_metadata(result.net_file, self._geometry)
            self._flow_map = {f.id: (f.from_junction, f.to_junction) for f in self.project.demand.flows}
            self._network_info = None
        return result

    def _extract_signal_metadata(self, net_file: Path, geo: NetGeometry) -> None:
        root = ET.parse(net_file).getroot()
        tl_edge_links: Dict[str, Dict[str, List[int]]] = defaultdict(lambda: defaultdict(list))
        lane_to_tl_group: Dict[str, Tuple[str, str]] = {}

        for conn in root.findall("connection"):
            tl = conn.get("tl")
            link_idx = conn.get("linkIndex")
            frm = conn.get("from", "")
            from_lane = conn.get("fromLane")
            if tl and link_idx is not None and not frm.startswith(":"):
                tl_edge_links[tl][frm].append(int(link_idx))
                if from_lane is not None:
                    lane_to_tl_group[f"{frm}_{from_lane}"] = (tl, f"{tl}:{frm}")

        road_names: Dict[str, str] = {}
        for r in self.project.roads:
            label = r.name or r.id
            road_names[edge_id_for(r.id, "forward")] = label
            if r.lanes_back > 0:
                road_names[edge_id_for(r.id, "backward")] = label

        approach_names: Dict[str, str] = {}
        for tl, edges in tl_edge_links.items():
            for edge_id in edges:
                approach_names[f"{tl}:{edge_id}"] = f"{tl} ← {road_names.get(edge_id, edge_id)}"

        heads: List[SignalHead] = []
        for ln in geo.lanes:
            info = lane_to_tl_group.get(ln.id)
            if not info or len(ln.shape) < 2:
                continue
            tl, grp = info
            p1, p2 = ln.shape[-2], ln.shape[-1]
            dx, dy = p2[0] - p1[0], p2[1] - p1[1]
            heading = math.atan2(dy, dx) if (dx or dy) else 0.0
            heads.append(
                SignalHead(
                    id=f"sig_{tl}_{ln.id}",
                    group=grp,
                    lane_id=ln.id,
                    label=approach_names.get(grp, grp),
                    x=p2[0],
                    y=p2[1],
                    heading=round(heading, 4),
                    width=ln.width,
                )
            )

        self._tl_edge_links = {tl: dict(edges) for tl, edges in tl_edge_links.items()}
        self._tl_approach_names = approach_names
        self._signal_heads = heads

    def reload_settings(self) -> None:
        """Validate & compile `network.json` (cached by hash) before SUMO starts/resets."""
        self.ensure_compiled(force=False)

    # ------------------------------------------------------------------ #
    # Metadata & Geometry
    # ------------------------------------------------------------------ #
    def get_metadata(self) -> ScenarioMetadata:
        origins = [
            SpawnOriginInfo(
                id=j.id,
                label=j.label or j.id,
                description=f"Boundary junction {j.label or j.id}",
            )
            for j in self.project.junctions
            if any(f.from_junction == j.id for f in self.project.demand.flows)
        ]
        return ScenarioMetadata(
            id=self.id,
            name=self.name,
            description=self.description,
            type=self.type,
            bounds=self.bounds,
            default_camera=self.default_camera,
            spawn_origins=origins,
            options=[],
        )

    def get_network_info(self) -> NetworkInfo:
        self.ensure_compiled(force=False)
        if self._network_info is not None:
            return self._network_info

        assert self._geometry is not None
        geo = self._geometry
        junctions_by_id = {j.id: j for j in self.project.junctions}

        centre_lines: List[CentreLine] = []
        for r in self.project.roads:
            if r.lanes >= 1 and r.lanes_back >= 1:
                centre_lines.append(
                    CentreLine(
                        id=f"centre_{r.id}",
                        edges=[edge_id_for(r.id, "forward"), edge_id_for(r.id, "backward")],
                        shape=road_polyline(r, junctions_by_id),
                    )
                )

        labels = [
            ArmLabel(
                id=j.id,
                name=j.label or j.id,
                x=j.x,
                y=j.y + 14.0,
                description=f"{j.type} junction",
            )
            for j in self.project.junctions
            if j.label
        ]

        callouts: List[MapCallout] = []
        for obs in self.project.obstacles:
            if obs.label:
                r = next((rd for rd in self.project.roads if rd.id == obs.road), None)
                if r:
                    pts = road_polyline(r, junctions_by_id)
                    mid_x = (pts[0][0] + pts[-1][0]) / 2.0
                    mid_y = (pts[0][1] + pts[-1][1]) / 2.0 + 10.0
                    callouts.append(MapCallout(text=obs.label, x=round(mid_x, 1), y=round(mid_y, 1)))

        lanes_meta = [
            {
                "id": ln.id,
                "arm": ln.edge,
                "index": ln.index,
                "name": f"{ln.edge} lane {ln.index}",
                "width": ln.width,
                "speed_limit_kmh": ln.speed_limit_kmh,
            }
            for ln in geo.lanes
        ]

        self._network_info = NetworkInfo(
            scenario=self.get_metadata(),
            road_length=round(geo.total_edge_length, 1),
            num_lanes=len(geo.lanes),
            num_lanes_per_dir=max((r.lanes for r in self.project.roads), default=2),
            lane_width=self.project.settings.lane_width_m,
            traffic_light_x=self.tl_x,
            traffic_light_y=self.tl_y,
            lanes=lanes_meta,
            geometry=NetworkGeometry(
                lanes=geo.lanes,
                connectors=geo.connectors,
                junctions=geo.junctions,
                centre_lines=centre_lines,
                labels=labels,
                callouts=callouts,
                signal_heads=self._signal_heads,
                bounds=self.bounds,
            ),
        )
        return self._network_info

    def get_spawn_route(self, req: SpawnRequest) -> str:
        if self.project.demand.flows:
            return f"r_{self.project.demand.flows[0].id}"
        return ""

    def enrich_vehicle_direction(self, lane_id: str, angle: float, x: float, y: float) -> str:
        if 45 <= angle <= 135:
            return "east"
        if 135 < angle <= 225:
            return "south"
        if 225 < angle <= 315:
            return "west"
        return "north"

    # ------------------------------------------------------------------ #
    # Traffic lights (SUMO runs compiled tlLogic natively; we report state)
    # ------------------------------------------------------------------ #
    def apply_traffic_light_state(self) -> None:
        return

    def update_traffic_light(self, dt: float) -> None:
        return

    def get_traffic_light_data(self) -> Optional[TrafficLightState]:
        if not self._tl_edge_links:
            return None

        groups: List[SignalGroupTiming] = []
        primary_tl = self.tl_id or next(iter(self._tl_edge_links))
        primary_raw = ""
        primary_state = "green"
        primary_remaining = 0.0

        for tl_id, edge_links in self._tl_edge_links.items():
            try:
                raw_state = traci.trafficlight.getRedYellowGreenState(tl_id)
                now = traci.simulation.getTime()
                next_sw = traci.trafficlight.getNextSwitch(tl_id)
                remaining = max(0.0, round(next_sw - now, 1))
            except Exception:
                continue

            if tl_id == primary_tl:
                primary_raw = raw_state
                primary_state = _state_from_chars(list(raw_state))
                primary_remaining = remaining

            for edge_id, indices in edge_links.items():
                chars = [raw_state[i] for i in indices if 0 <= i < len(raw_state)]
                st = _state_from_chars(chars)
                gid = f"{tl_id}:{edge_id}"
                groups.append(
                    SignalGroupTiming(
                        id=gid,
                        name=self._tl_approach_names.get(gid, gid),
                        green_duration=30.0,
                        amber_duration=3.0,
                        calculated_red_duration=30.0,
                        is_active_green=(st == "green"),
                        state=st,
                    )
                )

        if not groups:
            return None

        return TrafficLightState(
            id=primary_tl,
            x=self.tl_x,
            y=self.tl_y,
            state=primary_state,
            raw_state=primary_raw,
            mode="auto",
            phase_remaining=primary_remaining,
            next_state="yellow" if primary_state == "green" else "red",
            signal_groups=groups,
        )

    # ------------------------------------------------------------------ #
    # Metrics
    # ------------------------------------------------------------------ #
    def _reset_metrics(self) -> None:
        self.inflow: Dict[str, int] = defaultdict(int)
        self.outflow: Dict[str, int] = defaultdict(int)
        self.flow_arrived: Dict[str, int] = defaultdict(int)
        self.flow_travel_sum: Dict[str, float] = defaultdict(float)
        self.delay_sum: Dict[str, float] = defaultdict(float)
        self.delay_n: Dict[str, int] = defaultdict(int)
        self.depart_time: Dict[str, float] = {}
        self.free_flow_s: Dict[str, float] = {}
        self.route_length_m: Dict[str, float] = {}
        self.teleports = 0

    def reset_state(self) -> None:
        self._reset_metrics()
        if not self._compile_result:
            return
        for fid, edges in self._compile_result.flow_routes.items():
            total_s = 0.0
            total_len = 0.0
            for eid in edges:
                lane = f"{eid}_0"
                try:
                    length = traci.lane.getLength(lane)
                    vmax = max(0.1, traci.lane.getMaxSpeed(lane))
                    total_len += length
                    total_s += length / vmax
                except traci.TraCIException:
                    pass
            self.free_flow_s[fid] = total_s
            self.route_length_m[fid] = total_len

    def _flow_id_of(self, veh_id: str) -> Optional[str]:
        fid = veh_id.split(".", 1)[0]
        return fid if fid in self._flow_map else None

    def on_step(self) -> None:
        now = traci.simulation.getTime()
        for vid in traci.simulation.getDepartedIDList():
            fid = self._flow_id_of(vid)
            if fid:
                orig, _ = self._flow_map[fid]
                self.inflow[orig] += 1
                self.depart_time[vid] = now

        for vid in traci.simulation.getArrivedIDList():
            fid = self._flow_id_of(vid)
            if not fid:
                continue
            orig, dest = self._flow_map[fid]
            self.flow_arrived[fid] += 1
            self.outflow[dest] += 1
            t0 = self.depart_time.pop(vid, None)
            if t0 is not None:
                travel = now - t0
                self.flow_travel_sum[fid] += travel
                self.delay_sum[orig] += max(0.0, travel - self.free_flow_s.get(fid, 0.0))
                self.delay_n[orig] += 1

        self.teleports += traci.simulation.getStartingTeleportNumber()

    def _queue_length(self, edge_id: str) -> int:
        halting = 0
        try:
            for i in range(traci.edge.getLaneNumber(edge_id)):
                lane = f"{edge_id}_{i}"
                zone_start = max(0.0, traci.lane.getLength(lane) - QUEUE_ZONE_M)
                for vid in traci.lane.getLastStepVehicleIDs(lane):
                    if vid.startswith("obs_"):
                        continue
                    if traci.vehicle.getSpeed(vid) < 0.1 and traci.vehicle.getLanePosition(vid) >= zone_start:
                        halting += 1
        except traci.TraCIException:
            pass
        return halting

    def get_junction_metrics(self) -> Optional[JunctionMetrics]:
        if not self.project.demand.flows:
            return None
        sim_time = traci.simulation.getTime()

        arm_ids: List[str] = []
        for f in self.project.demand.flows:
            for jid in (f.from_junction, f.to_junction):
                if jid not in arm_ids:
                    arm_ids.append(jid)
        j_labels = {j.id: (j.label or j.id) for j in self.project.junctions}

        arms = [
            ArmFlowMetrics(
                id=aid,
                name=j_labels.get(aid, aid),
                inflow=self.inflow[aid],
                outflow=self.outflow[aid],
                avg_delay_s=round(self.delay_sum[aid] / self.delay_n[aid], 1) if self.delay_n[aid] else None,
            )
            for aid in arm_ids
        ]

        od = []
        for f in self.project.demand.flows:
            arrived = self.flow_arrived[f.id]
            avg_t = round(self.flow_travel_sum[f.id] / arrived, 1) if arrived else None
            rlen = self.route_length_m.get(f.id, 0.0)
            avg_spd = round((rlen / avg_t) * 3.6, 1) if (avg_t and avg_t > 0 and rlen > 0) else None
            od.append(
                ODMetrics(
                    key=f.id,
                    configured_vph=f.vehs_per_hour,
                    arrived=arrived,
                    throughput_vph=round(arrived * 3600.0 / sim_time, 0) if sim_time > 0 else 0.0,
                    avg_travel_time_s=avg_t,
                    avg_speed_kmh=avg_spd,
                )
            )

        entry_queues = []
        for tl_id, edges in self._tl_edge_links.items():
            for edge_id in edges:
                gid = f"{tl_id}:{edge_id}"
                entry_queues.append(
                    EntryQueue(
                        id=edge_id,
                        label=self._tl_approach_names.get(gid, gid),
                        halting=self._queue_length(edge_id),
                    )
                )

        return JunctionMetrics(
            arms=arms,
            od=od,
            entry_queues=entry_queues,
            roundabout_occupancy=0,
            uturn_count=0,
            teleports=self.teleports,
        )
