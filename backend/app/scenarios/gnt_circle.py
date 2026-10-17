"""GNT Circle: unsignalised clockwise roundabout with stem, TL free left at the circle and median U-turn.

See `sumo_config/scenarios/gnt_circle/SPEC.md`. Demand is defined per O-D pair in
`scenario.xml` and compiled into `gnt_circle.rou.xml` (one SUMO <flow> per non-zero
OD key) on every reset / scenario switch, so no TraCI auto-spawning is used.
"""
import logging
import os
import random
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional
from xml.sax.saxutils import quoteattr

import traci

from .base import BaseScenario
from .net_geometry import NetGeometry, load_net_geometry
from .settings_loader import ScenarioSettingsError
from ..schemas import (
    ScenarioMetadata,
    SpawnOriginInfo,
    NetworkInfo,
    NetworkGeometry,
    CentreLine,
    ArmLabel,
    MapCallout,
    RoundaboutInfo,
    RoadArmInfo,
    SpawnRequest,
    TrafficLightState,
    JunctionMetrics,
    ArmFlowMetrics,
    ODMetrics,
    EntryQueue,
)

logger = logging.getLogger("scenario_gnt_circle")

ARM_NAMES = {"NG": "Nallagandla", "TL": "Tellapur", "FL": "Flyover"}

# In-scope O-D keys (SPEC.md §5.1) -> route id
OD_ROUTES = {
    "NG_TL": "r_NG_TL",
    "NG_FL": "r_NG_FL",
    "TL_FL": "r_TL_FL",
    "TL_NG": "r_TL_NG",
    "FL_NG": "r_FL_NG",
    "FL_TL": "r_FL_TL",
}

# All routes (SPEC.md §5). Same-arm U-turns are defined for completeness but never get a flow.
ROUTES = {
    "r_NG_TL": "NG_in rb_W_N rb_N_E TL_out",
    "r_NG_FL": "NG_in rb_W_N rb_N_E rb_E_S stem_sb_a stem_sb_b bot_wb_b FL_out",
    "r_TL_FL": "TL_in TL_free_left stem_sb_b bot_wb_b FL_out",
    "r_TL_NG": "TL_in TL_free_left stem_sb_b bot_wb_b bot_eb stem_nb rb_S_W NG_out",
    "r_FL_NG": "FL_in bot_eb stem_nb rb_S_W NG_out",
    "r_FL_TL": "FL_in bot_eb stem_nb rb_S_W rb_W_N rb_N_E TL_out",
    "r_NG_NG": "NG_in rb_W_N rb_N_E rb_E_S rb_S_W NG_out",
    "r_TL_TL": "TL_in TL_free_left stem_sb_b bot_wb_b bot_eb stem_nb rb_S_W rb_W_N rb_N_E TL_out",
    "r_FL_FL": "FL_in bot_eb stem_nb rb_S_W rb_W_N rb_N_E rb_E_S stem_sb_a stem_sb_b bot_wb_b FL_out",
}

# Built-in vType defaults (SPEC.md §5.2.3); lowest precedence after SUMO defaults. No trucks or buses.
BUILTIN_VTYPES: Dict[str, Dict[str, str]] = {
    "motorcycle": {"vClass": "motorcycle", "guiShape": "motorcycle", "color": "#f59e0b",
                   "length": "2.0", "width": "0.8", "maxSpeed": "22.0", "accel": "3.5", "decel": "6.0"},
    "auto_rickshaw": {"vClass": "passenger", "guiShape": "passenger/hatchback", "color": "#facc15",
                      "length": "2.6", "width": "1.4", "maxSpeed": "14.0", "accel": "1.8", "decel": "4.0"},
    "car": {"vClass": "passenger", "guiShape": "passenger", "color": "#38bdf8",
            "length": "4.3", "width": "1.7", "maxSpeed": "30.0", "accel": "2.6", "decel": "4.5"},
    "van": {"vClass": "delivery", "guiShape": "delivery", "color": "#a78bfa",
            "length": "5.0", "width": "1.9", "maxSpeed": "25.0", "accel": "2.0", "decel": "4.2"},
}

RING_EDGES = ["rb_W_N", "rb_N_E", "rb_E_S", "rb_S_W"]
ENTRY_QUEUES = [
    ("NG_in", "NG entry (ring)"),
    ("stem_nb", "Stem entry (ring)"),
    ("TL_in", "TL approach (free left)"),
]
QUEUE_ZONE_M = 100.0

# Per-vehicle settings for aggressive traffic: TL-origin (free-left merge + U-turn)
# and NG-origin (joining GNT Circle roundabout without yielding right-of-way).
# NOTE: SUMO rejects `junctionModel.*` via traci.vehicle.setParameter, and per-OD vType ids
# would break frontend rendering, so aggression uses supported per-vehicle TraCI calls instead.
AGGRESSIVE_IMPATIENCE = 1.0
AGGRESSIVE_MIN_GAP = 0.3   # m  - tiny bumper gaps so aggressive vehicles squeeze into any opening
AGGRESSIVE_TAU = 0.3       # s  - tiny following headway
# While on these edges vehicles disregard right-of-way at the junction ahead
# (NG entry & ring continuation at rb_W, merge at stem_merge, U-turn at uturn_W). SUMO speed mode 23 = default 31 minus bit 3.
FORCE_EDGES = {"TL_free_left", "bot_wb_b", "NG_in", "rb_S_W"}
SPEED_MODE_DEFAULT = 31
SPEED_MODE_FORCE = 23

EDGE_NAMES = {
    "NG_in": "From Nallagandla", "NG_out": "To Nallagandla",
    "TL_in": "From Tellapur", "TL_out": "To Tellapur",
    "rb_W_N": "GNT Circle (W→N)", "rb_N_E": "GNT Circle (N→E)",
    "rb_E_S": "GNT Circle (E→S)", "rb_S_W": "GNT Circle (S→W)",
    "stem_sb_a": "Stem southbound (ring exit)", "stem_sb_b": "Stem southbound", "stem_nb": "Stem northbound",
    "TL_free_left": "TL free left (merges into stem SB)",
    "bot_wb_b": "Bottom road westbound", "bot_eb": "Bottom road eastbound",
    "FL_in": "From Flyover", "FL_out": "To Flyover",
}

# Undivided carriageways: double solid centre lines (as on the 3-way intersection).
# Broken for 12 m at X = -110 where the U-turn crosses.
CENTRE_LINES = [
    CentreLine(id="centre_NG", edges=["NG_in", "NG_out"], shape=[[-160.0, 0.0], [-19.2, 0.0]]),
    CentreLine(id="centre_TL", edges=["TL_in", "TL_out"], shape=[[20.4, 0.0], [160.0, 0.0]]),
    CentreLine(id="centre_stem", edges=["stem_sb_a", "stem_sb_b", "stem_nb"], shape=[[0.0, -17.1], [0.0, -80.0]]),
    CentreLine(id="centre_bottom_W", edges=["FL_in", "FL_out"], shape=[[-150.0, -110.0], [-116.0, -110.0]]),
    CentreLine(id="centre_bottom_E", edges=["bot_eb", "bot_wb_b"], shape=[
        [-104.0, -110.0], [-30.0, -110.0], [-24.79, -109.54], [-19.74, -108.19],
        [-15.0, -105.98], [-10.72, -102.98], [-7.02, -99.28], [-4.02, -95.0],
        [-1.81, -90.26], [-0.46, -85.21], [0.0, -80.0]
    ]),
]

LABELS = [
    ArmLabel(id="NG", name=ARM_NAMES["NG"], x=-135.0, y=20.0,
             description="Main road west (2 + 2 lanes): NG_in → GNT Circle, NG_out ← GNT Circle"),
    ArmLabel(id="TL", name=ARM_NAMES["TL"], x=135.0, y=28.0,
             description="Main road east (2 + 2 lanes): TL_out ← GNT Circle; TL_in → single-lane free left into the stem (no ring entry)"),
    ArmLabel(id="FL", name=ARM_NAMES["FL"], x=-130.0, y=-86.0,
             description="Bottom road west: FL_in → stem → GNT Circle; FL_out ← stem (incl. TL free left)"),
]

CALLOUTS = [
    MapCallout(text="↶ U-TURN", x=-110.0, y=-124.0),
    MapCallout(text="FREE LEFT", x=28.0, y=-34.0, align="left"),
]

# Downstream ends that give way: ring entries, free-left merge into stem SB (D-6)
YIELD_LANES = ["NG_in_0", "NG_in_1", "stem_nb_0", "stem_nb_1", "TL_free_left_0"]


def _od_key(veh_id: str) -> Optional[str]:
    """Flow vehicles are named '<flow id>.<n>' and flow ids are the OD keys."""
    key = veh_id.split(".", 1)[0]
    return key if key in OD_ROUTES else None


class GntCircleScenario(BaseScenario):
    id = "gnt_circle"
    name = "GNT Circle"
    description = ("Unsignalised clockwise roundabout on the Nallagandla ⇄ Tellapur corridor with a "
                   "stem to the Flyover road, a TL single-lane free left at the circle and a U-turn "
                   "(left-hand traffic, Indian mixed traffic)")
    type = "roundabout"
    default_camera = {"x": -30.0, "y": -45.0, "zoom": 2.7}
    demand_from_route_file = True
    apply_default_speed_limit = False

    def __init__(self, sumocfg_file: str):
        self.tl_id = ""
        cfg_dir = Path(sumocfg_file).parent
        self.net_file = cfg_dir / "gnt_circle.net.xml"
        self.route_file = cfg_dir / "gnt_circle.rou.xml"
        self._geometry: Optional[NetGeometry] = None
        self._geometry_mtime = 0.0
        self._network_info: Optional[NetworkInfo] = None
        self._reset_metrics()
        super().__init__(sumocfg_file)
        self._validate_and_write_routes()
        self.bounds = self.geometry.bounds(margin=10.0)

    # ------------------------------------------------------------------ #
    # scenario.xml -> gnt_circle.rou.xml
    # ------------------------------------------------------------------ #
    def reload_settings(self) -> None:
        super().reload_settings()
        self._validate_and_write_routes()

    def _validate_and_write_routes(self) -> None:
        s = self.settings
        unknown = sorted(set(s.od_demand) - set(OD_ROUTES))
        if unknown:
            raise ScenarioSettingsError(
                f"gnt_circle scenario.xml: unknown OD key(s) {unknown}; allowed: {sorted(OD_ROUTES)}")
        unknown_vt = sorted(set(s.vehicle_mix) - set(BUILTIN_VTYPES))
        if unknown_vt:
            raise ScenarioSettingsError(
                f"gnt_circle scenario.xml: unknown vtype(s) {unknown_vt}; allowed: {sorted(BUILTIN_VTYPES)}")
        self._write_route_file()

    def _resolved_vtypes(self) -> Dict[str, Dict[str, str]]:
        """Precedence: per-vtype override > global <behaviour> param > built-in default > SUMO default."""
        s = self.settings
        models = {k: v for k, v in s.behaviour_models.items() if k in ("carFollowModel", "laneChangeModel")}
        resolved = {}
        for vid, share in s.vehicle_mix.items():
            attrs = {**BUILTIN_VTYPES[vid], **models, **s.behaviour_params, **s.vtype_overrides.get(vid, {})}
            resolved[vid] = {"probability": f"{share:.4f}", **attrs}
        return resolved

    def _write_route_file(self) -> None:
        lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            "<!-- GENERATED by backend/app/scenarios/gnt_circle.py from scenario.xml on every reset.",
            "     Do not edit by hand: change scenario.xml instead (SPEC.md §5.2.4). -->",
            '<routes xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
            'xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/routes_file.xsd">',
            '    <vTypeDistribution id="indian_mix">',
        ]
        for vid, attrs in self._resolved_vtypes().items():
            attr_str = " ".join(f"{k}={quoteattr(v)}" for k, v in attrs.items())
            lines.append(f'        <vType id="{vid}" {attr_str}/>')
        lines.append("    </vTypeDistribution>")
        lines.append("")
        for rid, edges in ROUTES.items():
            lines.append(f'    <route id="{rid}" edges="{edges}"/>')
        lines.append("")
        for key, route in OD_ROUTES.items():
            vph = self.settings.od_demand.get(key, 0.0)
            if vph <= 0:
                continue
            lines.append(
                f'    <flow id="{key}" route="{route}" type="indian_mix" begin="0" end="100000" '
                f'vehsPerHour="{vph:g}" departLane="random" departPosLat="random" departSpeed="desired"/>')
        lines.append("</routes>")

        tmp = self.route_file.with_suffix(".xml.tmp")
        tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
        os.replace(tmp, self.route_file)

    def extra_sumo_args(self) -> List[str]:
        lat = self.settings.behaviour_models.get("lateralResolution")
        return ["--lateral-resolution", lat] if lat else []

    # ------------------------------------------------------------------ #
    # Geometry
    # ------------------------------------------------------------------ #
    @property
    def geometry(self) -> NetGeometry:
        mtime = self.net_file.stat().st_mtime
        if self._geometry is None or mtime != self._geometry_mtime:
            self._geometry = load_net_geometry(self.net_file)
            self._geometry_mtime = mtime
            self._network_info = None
        return self._geometry

    def get_metadata(self) -> ScenarioMetadata:
        origins = [
            SpawnOriginInfo(id="NG", label="Nallagandla (NG)", description="Main road west end, enters GNT Circle at rb_W"),
            SpawnOriginInfo(id="TL", label="Tellapur (TL)", description="Main road east end, single-lane free left into the stem (no ring entry)"),
            SpawnOriginInfo(id="FL", label="Flyover (FL)", description="Bottom road west end, reaches the ring via the stem"),
        ]
        return ScenarioMetadata(
            id=self.id, name=self.name, description=self.description, type=self.type,
            bounds=self.bounds, default_camera=self.default_camera, spawn_origins=origins,
        )

    def _ring_radii(self, geo: NetGeometry) -> tuple[float, float]:
        radii = []
        for ln in geo.lanes:
            if ln.edge in RING_EDGES:
                for x, y in ln.shape:
                    r = (x * x + y * y) ** 0.5
                    radii.append((r - ln.width / 2, r + ln.width / 2))
        return round(min(r[0] for r in radii), 2), round(max(r[1] for r in radii), 2)

    def get_network_info(self) -> NetworkInfo:
        geo = self.geometry
        if self._network_info is not None:
            return self._network_info

        island_r, outer_r = self._ring_radii(geo)
        lanes = [
            {"id": ln.id, "arm": ln.edge, "index": ln.index,
             "name": f"{EDGE_NAMES.get(ln.edge, ln.edge)} lane {ln.index}",
             "width": ln.width, "speed_limit_kmh": ln.speed_limit_kmh}
            for ln in geo.lanes
        ]
        arms = [
            RoadArmInfo(id="NG", name=ARM_NAMES["NG"], direction="west",
                        x_start=-160.0, y_start=0.0, x_end=-10.0, y_end=0.0,
                        num_lanes_inbound=2, num_lanes_outbound=2),
            RoadArmInfo(id="TL", name=ARM_NAMES["TL"], direction="east",
                        x_start=10.0, y_start=0.0, x_end=160.0, y_end=0.0,
                        num_lanes_inbound=2, num_lanes_outbound=2),
            RoadArmInfo(id="FL", name=ARM_NAMES["FL"], direction="west",
                        x_start=-150.0, y_start=-110.0, x_end=0.0, y_end=-110.0,
                        num_lanes_inbound=3, num_lanes_outbound=3),
        ]
        self._network_info = NetworkInfo(
            scenario=self.get_metadata(),
            road_length=round(geo.total_edge_length, 1),
            num_lanes=len(geo.lanes),
            num_lanes_per_dir=3,
            lane_width=3.2,
            traffic_light_x=0.0,
            traffic_light_y=0.0,
            lanes=lanes,
            arms=arms,
            geometry=NetworkGeometry(
                lanes=geo.lanes,
                connectors=geo.connectors,
                junctions=geo.junctions,
                centre_lines=CENTRE_LINES,
                labels=LABELS,
                callouts=CALLOUTS,
                roundabout=RoundaboutInfo(x=0.0, y=0.0, island_radius=island_r, outer_radius=outer_r),
                yield_lanes=YIELD_LANES,
                bounds=self.bounds,
            ),
        )
        return self._network_info

    # ------------------------------------------------------------------ #
    # Routing (TraCI spawning is unused; demand comes from <flow>s)
    # ------------------------------------------------------------------ #
    def get_spawn_route(self, req: SpawnRequest) -> str:
        origin = (req.origin or req.direction or "random").upper()
        keys = [k for k in OD_ROUTES if k.startswith(f"{origin}_")] or list(OD_ROUTES)
        if req.turn and f"{origin}_{req.turn.upper()}" in OD_ROUTES:
            return OD_ROUTES[f"{origin}_{req.turn.upper()}"]
        weights = [self.settings.od_demand.get(k, 0.0) for k in keys]
        key = random.choices(keys, weights=weights)[0] if sum(weights) > 0 else random.choice(keys)
        return OD_ROUTES[key]

    def enrich_vehicle_direction(self, lane_id: str, angle: float, x: float, y: float) -> str:
        if 45 <= angle <= 135:
            return "east"
        if 135 < angle <= 225:
            return "south"
        if 225 < angle <= 315:
            return "west"
        return "north"

    def get_vehicle_direction(self, veh_id: str, lane_id: str, angle: float, x: float, y: float) -> str:
        return _od_key(veh_id) or self.enrich_vehicle_direction(lane_id, angle, x, y)

    # ------------------------------------------------------------------ #
    # No traffic signals anywhere (SPEC.md §1)
    # ------------------------------------------------------------------ #
    def apply_traffic_light_state(self) -> None:
        pass

    def update_traffic_light(self, dt: float) -> None:
        pass

    def get_traffic_light_data(self) -> Optional[TrafficLightState]:
        return None

    # ------------------------------------------------------------------ #
    # Metrics (SPEC.md §9)
    # ------------------------------------------------------------------ #
    def _reset_metrics(self) -> None:
        self.inflow: Dict[str, int] = defaultdict(int)
        self.outflow: Dict[str, int] = defaultdict(int)
        self.od_arrived: Dict[str, int] = defaultdict(int)
        self.od_travel_sum: Dict[str, float] = defaultdict(float)
        self.delay_sum: Dict[str, float] = defaultdict(float)
        self.delay_n: Dict[str, int] = defaultdict(int)
        self.depart_time: Dict[str, float] = {}
        self.uturn_seen: set[str] = set()
        self.uturn_count = 0
        self.teleports = 0
        self.free_flow_s: Dict[str, float] = {}
        self.ring_edge_ids: List[str] = list(RING_EDGES)
        self.aggressive_ids: set[str] = set()
        self.forcing_ids: set[str] = set()

    def reset_state(self) -> None:
        """Called right after traci.start(): reset counters and cache free-flow route times."""
        super().reset_state()
        self._reset_metrics()
        for key, route in OD_ROUTES.items():
            total = 0.0
            for edge in ROUTES[route].split():
                lane = f"{edge}_0"
                total += traci.lane.getLength(lane) / max(0.1, traci.lane.getMaxSpeed(lane))
            self.free_flow_s[key] = total
        self.ring_edge_ids = RING_EDGES + [e for e in traci.edge.getIDList() if e.startswith(":rb_")]

    def on_step(self) -> None:
        now = traci.simulation.getTime()
        for vid in traci.simulation.getDepartedIDList():
            key = _od_key(vid)
            if key:
                self.inflow[key[:2]] += 1
                self.depart_time[vid] = now
                self._make_aggressive(vid)
        for vid in traci.simulation.getArrivedIDList():
            key = _od_key(vid)
            self.uturn_seen.discard(vid)
            self.aggressive_ids.discard(vid)
            self.forcing_ids.discard(vid)
            if not key:
                continue
            self.od_arrived[key] += 1
            self.outflow[key[3:]] += 1
            t0 = self.depart_time.pop(vid, None)
            if t0 is not None:
                self.od_travel_sum[key] += now - t0
                self.delay_sum[key[:2]] += (now - t0) - self.free_flow_s.get(key, 0.0)
                self.delay_n[key[:2]] += 1
        # The only way a TL-origin vehicle reaches bot_eb is through the median U-turn.
        for vid in traci.edge.getLastStepVehicleIDs("bot_eb"):
            if vid.startswith("TL_") and vid not in self.uturn_seen:
                self.uturn_seen.add(vid)
                self.uturn_count += 1
        self.teleports += traci.simulation.getStartingTeleportNumber()
        self._update_force_mode()

    def _make_aggressive(self, vid: str) -> None:
        """TL and NG vehicles join aggressively: accept tiny gaps, ignore foes, and never wait politely."""
        try:
            traci.vehicle.setImpatience(vid, AGGRESSIVE_IMPATIENCE)
            traci.vehicle.setMinGap(vid, AGGRESSIVE_MIN_GAP)
            traci.vehicle.setTau(vid, AGGRESSIVE_TAU)
            self.aggressive_ids.add(vid)
        except traci.TraCIException as exc:
            logger.debug("could not set aggressive params on %s: %s", vid, exc)

    def _update_force_mode(self) -> None:
        """Disable right-of-way checks only while an aggressive vehicle is on a conflict edge."""
        if not self.aggressive_ids:
            return
        active_ids = set(traci.vehicle.getIDList())
        self.aggressive_ids.intersection_update(active_ids)
        self.forcing_ids.intersection_update(active_ids)
        for vid in list(self.aggressive_ids):
            try:
                road = traci.vehicle.getRoadID(vid)
                if road in FORCE_EDGES:
                    if vid not in self.forcing_ids:
                        traci.vehicle.setSpeedMode(vid, SPEED_MODE_FORCE)
                        self.forcing_ids.add(vid)
                elif not road.startswith(":") and vid in self.forcing_ids:
                    traci.vehicle.setSpeedMode(vid, SPEED_MODE_DEFAULT)
                    self.forcing_ids.discard(vid)
            except traci.TraCIException:
                self.aggressive_ids.discard(vid)
                self.forcing_ids.discard(vid)

    def _queue_length(self, edge: str) -> int:
        halting = 0
        for i in range(traci.edge.getLaneNumber(edge)):
            lane = f"{edge}_{i}"
            zone_start = traci.lane.getLength(lane) - QUEUE_ZONE_M
            for vid in traci.lane.getLastStepVehicleIDs(lane):
                if traci.vehicle.getSpeed(vid) < 0.1 and traci.vehicle.getLanePosition(vid) >= zone_start:
                    halting += 1
        return halting

    def get_junction_metrics(self) -> JunctionMetrics:
        sim_time = traci.simulation.getTime()
        arms = [
            ArmFlowMetrics(
                id=arm, name=name, inflow=self.inflow[arm], outflow=self.outflow[arm],
                avg_delay_s=round(self.delay_sum[arm] / self.delay_n[arm], 1) if self.delay_n[arm] else None,
            )
            for arm, name in ARM_NAMES.items()
        ]
        od = [
            ODMetrics(
                key=key,
                configured_vph=self.settings.od_demand.get(key, 0.0),
                arrived=self.od_arrived[key],
                throughput_vph=round(self.od_arrived[key] * 3600.0 / sim_time, 0) if sim_time > 0 else 0.0,
                avg_travel_time_s=(round(self.od_travel_sum[key] / self.od_arrived[key], 1)
                                   if self.od_arrived[key] else None),
            )
            for key in OD_ROUTES
        ]
        return JunctionMetrics(
            arms=arms,
            od=od,
            entry_queues=[EntryQueue(id=e, label=lbl, halting=self._queue_length(e)) for e, lbl in ENTRY_QUEUES],
            roundabout_occupancy=sum(traci.edge.getLastStepVehicleNumber(e) for e in self.ring_edge_ids),
            uturn_count=self.uturn_count,
            teleports=self.teleports,
        )
