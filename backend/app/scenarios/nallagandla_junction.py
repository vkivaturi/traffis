"""Nallagandla Junction: 3-way signalised T-junction with free lefts (TL->FL and FL->NG).

East-West corridor: Nallagandla (NG) <-> Tellapur (TL).
South approach: Flyover (FL) bottom road + stem.
All directions at the central junction are signal controlled (NG, TL, and FL).
Free lefts for TL->FL and FL->NG bypass the signalized junction.
No roundabout, no U-turn.
"""
import logging
import os
import random
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Any
from xml.sax.saxutils import quoteattr

import traci

from .base import BaseScenario
from .net_geometry import NetGeometry, load_net_geometry
from .settings_loader import ScenarioSettingsError
from ..schemas import (
    ScenarioMetadata,
    ScenarioOption,
    SpawnOriginInfo,
    NetworkInfo,
    NetworkGeometry,
    CentreLine,
    ArmLabel,
    MapCallout,
    RoadArmInfo,
    SpawnRequest,
    TrafficLightState,
    SignalGroupTiming,
    SignalHead,
    JunctionMetrics,
    ArmFlowMetrics,
    ODMetrics,
    EntryQueue,
)
from dataclasses import dataclass

logger = logging.getLogger("scenario_nallagandla_junction")

ARM_NAMES = {"NG": "Nallagandla", "TL": "Tellapur", "FL": "Flyover"}

# In-scope O-D keys -> route id
OD_ROUTES = {
    "NG_TL": "r_NG_TL",
    "NG_FL": "r_NG_FL",
    "TL_FL": "r_TL_FL",
    "TL_NG": "r_TL_NG",
    "FL_NG": "r_FL_NG",
    "FL_TL": "r_FL_TL",
}

# Routes for Nallagandla Junction (no roundabout, no U-turn)
ROUTES = {
    "r_NG_TL": "NG_in TL_out",
    "r_NG_FL": "NG_in stem_sb_a stem_sb_b bot_wb",
    "r_TL_FL": "TL_in_a TL_free_left stem_sb_b bot_wb",
    "r_TL_NG": "TL_in_a TL_in_b NG_out_a NG_out_b",
    "r_FL_NG": "bot_eb stem_nb_a FL_free_left NG_out_b",
    "r_FL_TL": "bot_eb stem_nb_a stem_nb_b TL_out",
}

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

ENTRY_QUEUES = [
    ("NG_in", "NG approach (signal)"),
    ("TL_in_b", "TL approach (signal)"),
    ("stem_nb_b", "Stem approach (signal)"),
    ("TL_free_left", "TL free left"),
    ("FL_free_left", "FL free left"),
]
QUEUE_ZONE_M = 100.0

AGGRESSIVE_IMPATIENCE = 1.0
AGGRESSIVE_MIN_GAP = 0.5
AGGRESSIVE_TAU = 0.5

EDGE_NAMES = {
    "NG_in": "From Nallagandla", "NG_out_a": "To Nallagandla (junction exit)", "NG_out_b": "To Nallagandla",
    "TL_in_a": "From Tellapur (approach)", "TL_in_b": "From Tellapur (signal)", "TL_out": "To Tellapur",
    "stem_sb_a": "Stem southbound (junction exit)", "stem_sb_b": "Stem southbound",
    "stem_nb_a": "Stem northbound", "stem_nb_b": "Stem northbound (signal)",
    "TL_free_left": "TL free left (merges into stem SB)",
    "FL_free_left": "FL free left (merges into NG)",
    "bot_wb": "Bottom road westbound (to FL)", "bot_eb": "Bottom road eastbound (from FL)",
}

CENTRE_LINES = [
    CentreLine(id="centre_NG", edges=["NG_in", "NG_out_a", "NG_out_b"], shape=[[-160.0, 0.0], [-13.6, 0.0]]),
    CentreLine(id="centre_TL", edges=["TL_in_a", "TL_in_b", "TL_out"], shape=[[13.6, 0.0], [160.0, 0.0]]),
    CentreLine(id="centre_stem", edges=["stem_sb_a", "stem_sb_b", "stem_nb_a", "stem_nb_b"], shape=[[0.0, -10.4], [0.0, -80.0]]),
    CentreLine(id="centre_bottom", edges=["bot_eb", "bot_wb"], shape=[
        [-150.0, -110.0], [-30.0, -110.0], [-24.79, -109.54], [-19.74, -108.19],
        [-15.0, -105.98], [-10.72, -102.98], [-7.02, -99.28], [-4.02, -95.0],
        [-1.81, -90.26], [-0.46, -85.21], [0.0, -80.0]
    ]),
]

LABELS = [
    ArmLabel(id="NG", name=ARM_NAMES["NG"], x=-135.0, y=20.0,
             description="Main road west (2 + 2 lanes): NG_in → Junction, NG_out ← Junction & FL free left"),
    ArmLabel(id="TL", name=ARM_NAMES["TL"], x=135.0, y=28.0,
             description="Main road east (2 + 2 lanes): TL_in → Junction & free left; TL_out ← Junction"),
    ArmLabel(id="FL", name=ARM_NAMES["FL"], x=-130.0, y=-86.0,
             description="Bottom road west: FL in → stem (free left to NG or junction to TL); FL out ← stem"),
]

CALLOUTS = [
    MapCallout(text="FREE LEFT", x=28.0, y=-34.0, align="left"),
    MapCallout(text="FREE LEFT", x=-24.0, y=-30.0, align="right"),
]

YIELD_LANES = ["TL_free_left_0", "FL_free_left_0"]

NJ_SIGNAL_HEADS = [
    SignalHead(
        id="sig_NG_0",
        group="NG",
        lane_id="NG_in_0",
        label="NG Through (to TL)",
        x=-13.6,
        y=4.8,
        heading=0.0,
        width=3.2,
    ),
    SignalHead(
        id="sig_NG_1",
        group="NG",
        lane_id="NG_in_1",
        label="NG Right (to FL)",
        x=-13.6,
        y=1.6,
        heading=0.0,
        width=3.2,
    ),
    SignalHead(
        id="sig_TL_0",
        group="TL",
        lane_id="TL_in_b_0",
        label="TL Through/Left",
        x=13.6,
        y=-4.8,
        heading=3.14159,
        width=3.2,
    ),
    SignalHead(
        id="sig_TL_1",
        group="TL",
        lane_id="TL_in_b_1",
        label="TL Through (to NG)",
        x=13.6,
        y=-1.6,
        heading=3.14159,
        width=3.2,
    ),
    SignalHead(
        id="sig_FL_0",
        group="FL",
        lane_id="stem_nb_b_0",
        label="FL Left (to NG)",
        x=-8.0,
        y=-10.4,
        heading=1.5708,
        width=3.2,
    ),
    SignalHead(
        id="sig_FL_1",
        group="FL",
        lane_id="stem_nb_b_1",
        label="FL Right (to TL)",
        x=-4.8,
        y=-10.4,
        heading=1.5708,
        width=3.2,
    ),
    SignalHead(
        id="sig_FL_2",
        group="FL",
        lane_id="stem_nb_b_2",
        label="FL Right (to TL)",
        x=-1.6,
        y=-10.4,
        heading=1.5708,
        width=3.2,
    ),
]


@dataclass
class NjPhase:
    name: str
    state: str
    raw: str
    duration: float
    group: str


def _od_key(veh_id: str) -> Optional[str]:
    key = veh_id.split(".", 1)[0]
    return key if key in OD_ROUTES else None


class NallagandlaJunctionScenario(BaseScenario):
    id = "nallagandla_junction"
    name = "Nallagandla Junction"
    description = ("Signalised 3-way T-junction on the Nallagandla ⇄ Tellapur corridor with "
                   "traffic lights for all directions, dedicated free-left turns (TL→FL & FL→NG), "
                   "and direct connection to Flyover road (no roundabout, no U-turn).")
    type = "intersection"
    default_camera = {"x": 0.0, "y": -35.0, "zoom": 3.0}
    demand_from_route_file = True
    apply_default_speed_limit = False

    def __init__(self, sumocfg_file: str):
        self.tl_id = "center"
        self.tl_x = 0.0
        self.tl_y = 0.0
        self.cfg_dir = Path(sumocfg_file).parent
        self.net_file_path = self.cfg_dir / "nallagandla_junction.net.xml"
        self.route_file = self.cfg_dir / "nallagandla_junction.rou.xml"
        self.time_lapse_enabled = False
        self._phases: List[NjPhase] = []
        self._geometry: Optional[NetGeometry] = None
        self._geometry_mtime = 0.0
        self._network_info: Optional[NetworkInfo] = None
        self._reset_metrics()
        super().__init__(sumocfg_file)
        self._build_phases()
        self._validate_and_write_routes()
        self.bounds = self.geometry.bounds(margin=10.0)

    @property
    def net_file(self) -> Path:
        return self.net_file_path

    def get_options(self) -> List[ScenarioOption]:
        return [
            ScenarioOption(
                id="time_lapse",
                label="Time Lapse Simulation",
                description="Fast-forward backend simulation in 50s jumps, streaming 10s interactive intervals to the UI with live metrics.",
                type="boolean",
                value=self.time_lapse_enabled,
                requires_restart=False,
            )
        ]

    def set_options(self, values: Dict[str, Any]) -> bool:
        if "time_lapse" in values:
            self.time_lapse_enabled = bool(values["time_lapse"])
            self._network_info = None
        return False

    def reload_settings(self) -> None:
        super().reload_settings()
        self._build_phases()
        self._validate_and_write_routes()

    def _build_phases(self) -> None:
        plan = self.settings.signal_plan
        amber = plan.amber if plan else 3.0
        all_red = plan.all_red if plan else 2.0
        ng_green = 25.0
        tl_green = 25.0
        fl_green = 25.0

        if plan and plan.groups:
            for g in plan.groups:
                if g.id == "NG":
                    ng_green = g.green
                elif g.id == "TL":
                    tl_green = g.green
                elif g.id == "FL":
                    fl_green = g.green

        self.ng_green = ng_green
        self.tl_green = tl_green
        self.fl_green = fl_green
        self.amber_duration = amber
        self.all_red_duration = all_red

        # Link indexes at junction 'center' (10 links):
        # 0..2: stem_nb_b (FL -> NG left [0], FL -> TL right [1, 2])
        # 3..5: TL_in_b (TL -> FL left [3], TL -> NG straight [4, 5])
        # 6..9: NG_in (NG -> TL straight [6, 7], NG -> FL right [8, 9])
        phases = [
            # 1. NG Phase
            NjPhase(name="NG Approach Green", state="green", raw="rrrrrrGGGG", duration=ng_green, group="NG"),
            NjPhase(name="NG Approach Amber", state="yellow", raw="rrrrrryyyy", duration=amber, group="NG"),
        ]
        if all_red > 0:
            phases.append(NjPhase(name="All-Red Clearance", state="red", raw="rrrrrrrrrr", duration=all_red, group=""))

        # 2. TL Phase
        phases.extend([
            NjPhase(name="TL Approach Green", state="green", raw="rrrGGGrrrr", duration=tl_green, group="TL"),
            NjPhase(name="TL Approach Amber", state="yellow", raw="rrryyyrrrr", duration=amber, group="TL"),
        ])
        if all_red > 0:
            phases.append(NjPhase(name="All-Red Clearance", state="red", raw="rrrrrrrrrr", duration=all_red, group=""))

        # 3. FL Phase
        phases.extend([
            NjPhase(name="FL Approach Green", state="green", raw="GGGrrrrrrr", duration=fl_green, group="FL"),
            NjPhase(name="FL Approach Amber", state="yellow", raw="yyyrrrrrrr", duration=amber, group="FL"),
        ])
        if all_red > 0:
            phases.append(NjPhase(name="All-Red Clearance", state="red", raw="rrrrrrrrrr", duration=all_red, group=""))

        self._phases = phases

    def _validate_and_write_routes(self) -> None:
        s = self.settings
        unknown = sorted(set(s.od_demand) - set(OD_ROUTES))
        if unknown:
            raise ScenarioSettingsError(
                f"nallagandla_junction scenario.xml: unknown OD key(s) {unknown}; allowed: {sorted(OD_ROUTES)}")
        unknown_vt = sorted(set(s.vehicle_mix) - set(BUILTIN_VTYPES))
        if unknown_vt:
            raise ScenarioSettingsError(
                f"nallagandla_junction scenario.xml: unknown vtype(s) {unknown_vt}; allowed: {sorted(BUILTIN_VTYPES)}")
        self._write_route_file()

    def _resolved_vtypes(self) -> Dict[str, Dict[str, str]]:
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
            "<!-- GENERATED by backend/app/scenarios/nallagandla_junction.py from scenario.xml on every reset. -->",
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
            # Free-left flows use lane 0
            depart_lane = "0" if key in ("FL_NG", "TL_FL") else "random"
            depart_pos_lat = "center" if key in ("FL_NG", "TL_FL") else "random"
            lines.append(
                f'    <flow id="{key}" route="{route}" type="indian_mix" begin="0" end="100000" '
                f'vehsPerHour="{vph:g}" departLane="{depart_lane}" departPosLat="{depart_pos_lat}" departSpeed="desired"/>')
        lines.append("</routes>")

        tmp = self.route_file.with_suffix(".xml.tmp")
        tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
        os.replace(tmp, self.route_file)

    def extra_sumo_args(self) -> List[str]:
        args = ["-n", str(self.net_file)]
        lat = self.settings.behaviour_models.get("lateralResolution")
        if lat:
            args.extend(["--lateral-resolution", lat])
        return args

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
            SpawnOriginInfo(id="NG", label="Nallagandla (NG)", description="Main road west end, approaches signal from West"),
            SpawnOriginInfo(id="TL", label="Tellapur (TL)", description="Main road east end, approaches signal from East & free left to FL"),
            SpawnOriginInfo(id="FL", label="Flyover (FL)", description="Bottom road west end, approaches signal from South & free left to NG"),
        ]
        return ScenarioMetadata(
            id=self.id, name=self.name, description=self.description, type=self.type,
            bounds=self.bounds, default_camera=self.default_camera, spawn_origins=origins,
            options=self.get_options(),
        )

    def get_network_info(self) -> NetworkInfo:
        geo = self.geometry
        if self._network_info is not None:
            return self._network_info

        lanes = [
            {"id": ln.id, "arm": ln.edge, "index": ln.index,
             "name": f"{EDGE_NAMES.get(ln.edge, ln.edge)} lane {ln.index}",
             "width": ln.width, "speed_limit_kmh": ln.speed_limit_kmh}
            for ln in geo.lanes
        ]
        arms = [
            RoadArmInfo(id="NG", name=ARM_NAMES["NG"], direction="west",
                        x_start=-160.0, y_start=0.0, x_end=0.0, y_end=0.0,
                        num_lanes_inbound=2, num_lanes_outbound=2),
            RoadArmInfo(id="TL", name=ARM_NAMES["TL"], direction="east",
                        x_start=0.0, y_start=0.0, x_end=160.0, y_end=0.0,
                        num_lanes_inbound=2, num_lanes_outbound=2),
            RoadArmInfo(id="FL", name=ARM_NAMES["FL"], direction="south",
                        x_start=-150.0, y_start=-110.0, x_end=0.0, y_end=0.0,
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
                roundabout=None,
                yield_lanes=YIELD_LANES,
                signal_heads=NJ_SIGNAL_HEADS,
                bounds=self.bounds,
            ),
        )
        return self._network_info

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
    # Traffic Signals
    # ------------------------------------------------------------------ #
    def apply_traffic_light_state(self) -> None:
        if not self._phases:
            return
        raw = self._phases[self.current_phase_idx].raw
        try:
            traci.trafficlight.setRedYellowGreenState(self.tl_id, raw)
        except Exception as e:
            logger.debug("Could not set traffic light state on %s: %s", self.tl_id, e)

    def update_traffic_light(self, dt: float) -> None:
        if not self._phases:
            return
        self.phase_timer += dt
        if self.phase_timer >= self._phases[self.current_phase_idx].duration:
            self.phase_timer = 0.0
            self.current_phase_idx = (self.current_phase_idx + 1) % len(self._phases)
            self.apply_traffic_light_state()

    def get_traffic_light_data(self) -> Optional[TrafficLightState]:
        if not self._phases:
            return None

        curr = self._phases[self.current_phase_idx]
        nxt = self._phases[(self.current_phase_idx + 1) % len(self._phases)]
        cycle = sum(p.duration for p in self._phases)

        groups = [
            SignalGroupTiming(
                id="NG",
                name="Nallagandla (NG) Approach",
                green_duration=self.ng_green,
                amber_duration=self.amber_duration,
                calculated_red_duration=round(cycle - self.ng_green - self.amber_duration, 1),
                is_active_green=(curr.group == "NG" and curr.state == "green"),
                state=curr.state if curr.group == "NG" else "red",
            ),
            SignalGroupTiming(
                id="TL",
                name="Tellapur (TL) Approach",
                green_duration=self.tl_green,
                amber_duration=self.amber_duration,
                calculated_red_duration=round(cycle - self.tl_green - self.amber_duration, 1),
                is_active_green=(curr.group == "TL" and curr.state == "green"),
                state=curr.state if curr.group == "TL" else "red",
            ),
            SignalGroupTiming(
                id="FL",
                name="Flyover (FL) Approach",
                green_duration=self.fl_green,
                amber_duration=self.amber_duration,
                calculated_red_duration=round(cycle - self.fl_green - self.amber_duration, 1),
                is_active_green=(curr.group == "FL" and curr.state == "green"),
                state=curr.state if curr.group == "FL" else "red",
            ),
        ]

        return TrafficLightState(
            id=self.tl_id,
            x=self.tl_x,
            y=self.tl_y,
            state=curr.state,
            raw_state=curr.raw,
            mode="auto",
            green_duration=curr.duration,
            yellow_duration=self.amber_duration,
            red_duration=round(cycle - curr.duration - self.amber_duration, 1),
            phase_timer=round(self.phase_timer, 2),
            phase_remaining=max(0.0, round(curr.duration - self.phase_timer, 1)),
            next_state=nxt.state,
            phase_index=self.current_phase_idx,
            phase_name=curr.name,
            signal_groups=groups,
        )

    # ------------------------------------------------------------------ #
    # Metrics
    # ------------------------------------------------------------------ #
    def _reset_metrics(self) -> None:
        self.inflow: Dict[str, int] = defaultdict(int)
        self.outflow: Dict[str, int] = defaultdict(int)
        self.od_arrived: Dict[str, int] = defaultdict(int)
        self.od_travel_sum: Dict[str, float] = defaultdict(float)
        self.delay_sum: Dict[str, float] = defaultdict(float)
        self.delay_n: Dict[str, int] = defaultdict(int)
        self.depart_time: Dict[str, float] = {}
        self.teleports = 0
        self.free_flow_s: Dict[str, float] = {}

    def reset_state(self) -> None:
        super().reset_state()
        self._reset_metrics()
        self.current_phase_idx = 0
        self.phase_timer = 0.0
        self.apply_traffic_light_state()
        for key, route in OD_ROUTES.items():
            total = 0.0
            for edge in ROUTES[route].split():
                lane = f"{edge}_0"
                total += traci.lane.getLength(lane) / max(0.1, traci.lane.getMaxSpeed(lane))
            self.free_flow_s[key] = total

    def on_step(self) -> None:
        now = traci.simulation.getTime()
        for vid in traci.simulation.getDepartedIDList():
            key = _od_key(vid)
            if key:
                self.inflow[key[:2]] += 1
                self.depart_time[vid] = now
                try:
                    traci.vehicle.setImpatience(vid, AGGRESSIVE_IMPATIENCE)
                    traci.vehicle.setMinGap(vid, AGGRESSIVE_MIN_GAP)
                    traci.vehicle.setTau(vid, AGGRESSIVE_TAU)
                    if vid.startswith("FL_NG") or vid.startswith("TL_FL"):
                        traci.vehicle.setLaneChangeMode(vid, 512)
                except traci.TraCIException:
                    pass

        for vid in traci.simulation.getArrivedIDList():
            key = _od_key(vid)
            if not key:
                continue
            self.od_arrived[key] += 1
            self.outflow[key[3:]] += 1
            t0 = self.depart_time.pop(vid, None)
            if t0 is not None:
                self.od_travel_sum[key] += now - t0
                self.delay_sum[key[:2]] += (now - t0) - self.free_flow_s.get(key, 0.0)
                self.delay_n[key[:2]] += 1

        self.teleports += traci.simulation.getStartingTeleportNumber()

    def _queue_length(self, edge: str) -> int:
        halting = 0
        try:
            for i in range(traci.edge.getLaneNumber(edge)):
                lane = f"{edge}_{i}"
                zone_start = traci.lane.getLength(lane) - QUEUE_ZONE_M
                for vid in traci.lane.getLastStepVehicleIDs(lane):
                    if traci.vehicle.getSpeed(vid) < 0.1 and traci.vehicle.getLanePosition(vid) >= zone_start:
                        halting += 1
        except traci.TraCIException:
            pass
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
            roundabout_occupancy=0,
            uturn_count=0,
            teleports=self.teleports,
        )
