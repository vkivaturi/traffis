"""Pydantic v2 schema and semantic validator for user-authored `network.json` files."""

from __future__ import annotations

import math
import re
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

ID_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")

# Built-in vehicle type parameters (matching Traffis's standard vehicle catalog)
BUILTIN_VTYPES: Dict[str, Dict[str, str]] = {
    "car": {
        "vClass": "passenger",
        "guiShape": "passenger",
        "color": "#38bdf8",
        "length": "4.6",
        "width": "1.8",
        "maxSpeed": "33.33",
        "accel": "2.6",
        "decel": "4.5",
        "minGap": "2.0",
    },
    "sports": {
        "vClass": "passenger",
        "guiShape": "passenger/sedan",
        "color": "#f43f5e",
        "length": "4.6",
        "width": "1.9",
        "maxSpeed": "45.0",
        "accel": "4.2",
        "decel": "6.0",
        "minGap": "1.8",
    },
    "van": {
        "vClass": "delivery",
        "guiShape": "delivery",
        "color": "#a78bfa",
        "length": "5.2",
        "width": "2.0",
        "maxSpeed": "28.0",
        "accel": "2.2",
        "decel": "4.2",
        "minGap": "2.5",
    },
    "truck": {
        "vClass": "truck",
        "guiShape": "truck",
        "color": "#94a3b8",
        "length": "9.5",
        "width": "2.4",
        "maxSpeed": "22.22",
        "accel": "1.3",
        "decel": "3.5",
        "minGap": "3.2",
    },
    "motorcycle": {
        "vClass": "motorcycle",
        "guiShape": "motorcycle",
        "color": "#f59e0b",
        "length": "2.1",
        "width": "0.8",
        "maxSpeed": "25.0",
        "accel": "3.5",
        "decel": "6.0",
        "minGap": "1.2",
    },
    "auto_rickshaw": {
        "vClass": "passenger",
        "guiShape": "passenger/hatchback",
        "color": "#facc15",
        "length": "2.6",
        "width": "1.4",
        "maxSpeed": "15.0",
        "accel": "1.8",
        "decel": "4.0",
        "minGap": "1.5",
    },
}


class NetworkSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    drive_side: Literal["left", "right"] = "left"
    default_speed_kmh: float = Field(default=50.0, ge=5.0, le=150.0)
    lane_width_m: float = Field(default=3.2, ge=2.0, le=5.0)


class JunctionDef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    x: float
    y: float
    type: Literal["priority", "right_before_left", "allway_stop", "traffic_light"] = "priority"
    label: Optional[str] = None


class RoadDef(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str
    from_junction: str = Field(alias="from")
    to_junction: str = Field(alias="to")
    lanes: int = Field(default=2, ge=1, le=8)
    lanes_back: int = Field(default=2, ge=0, le=8)
    speed_kmh: Optional[float] = Field(default=None, ge=5.0, le=150.0)
    points: List[List[float]] = Field(default_factory=list)
    name: Optional[str] = None


class SignalPhaseDef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    approaches: List[str] = Field(default_factory=list)
    green_s: float = Field(default=30.0, ge=1.0, le=300.0)
    name: Optional[str] = None


class SignalPlanDef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    junction: str
    amber_s: float = Field(default=3.0, ge=0.0, le=15.0)
    all_red_s: float = Field(default=2.0, ge=0.0, le=15.0)
    offset_s: float = Field(default=0.0, ge=0.0, le=600.0)
    phases: List[SignalPhaseDef] = Field(default_factory=list)


class FlowDef(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str
    from_junction: str = Field(alias="from")
    to_junction: str = Field(alias="to")
    vehs_per_hour: float = Field(default=300.0, ge=0.0, le=15000.0)


class DemandDef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vehicle_mix: Dict[str, float] = Field(default_factory=lambda: {"car": 0.7, "van": 0.15, "motorcycle": 0.15})
    flows: List[FlowDef] = Field(default_factory=list)


class ObstacleDef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    kind: Literal["blockage", "lane_closure"]
    road: str
    direction: Literal["forward", "backward"] = "forward"
    lane: int = Field(default=0, ge=0, le=7)
    position_m: Optional[float] = Field(default=None, ge=0.0)
    length_m: Optional[float] = Field(default=8.0, gt=0.0, le=200.0)
    label: Optional[str] = None


class NetworkProject(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    schema_version: Literal[1] = 1
    id: str
    name: str
    description: str = ""
    settings: NetworkSettings = Field(default_factory=NetworkSettings)
    junctions: List[JunctionDef] = Field(default_factory=list)
    roads: List[RoadDef] = Field(default_factory=list)
    signals: List[SignalPlanDef] = Field(default_factory=list)
    demand: DemandDef = Field(default_factory=DemandDef)
    obstacles: List[ObstacleDef] = Field(default_factory=list)


class ValidationIssue(BaseModel):
    severity: Literal["error", "warning"] = "error"
    code: str
    message: str
    element_type: Optional[str] = None
    element_id: Optional[str] = None


def edge_id_for(road_id: str, direction: Literal["forward", "backward"]) -> str:
    return f"{road_id}_f" if direction == "forward" else f"{road_id}_b"


def road_polyline(road: RoadDef, junctions_by_id: Dict[str, JunctionDef]) -> List[List[float]]:
    j_from = junctions_by_id[road.from_junction]
    j_to = junctions_by_id[road.to_junction]
    pts: List[List[float]] = [[j_from.x, j_from.y]]
    for pt in road.points:
        if len(pt) >= 2:
            pts.append([float(pt[0]), float(pt[1])])
    pts.append([j_to.x, j_to.y])
    return pts


def road_length_m(road: RoadDef, junctions_by_id: Dict[str, JunctionDef]) -> float:
    pts = road_polyline(road, junctions_by_id)
    total = 0.0
    for i in range(len(pts) - 1):
        total += math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
    return total


def incoming_edge_for_road_at_junction(road: RoadDef, junction_id: str) -> Optional[str]:
    """Return the SUMO edge ID of `road` that enters `junction_id`, or None if it does not enter."""
    if road.to_junction == junction_id and road.lanes >= 1:
        return edge_id_for(road.id, "forward")
    if road.from_junction == junction_id and road.lanes_back >= 1:
        return edge_id_for(road.id, "backward")
    return None


def outgoing_edge_for_road_at_junction(road: RoadDef, junction_id: str) -> Optional[str]:
    """Return the SUMO edge ID of `road` that leaves `junction_id`, or None if it does not leave."""
    if road.from_junction == junction_id and road.lanes >= 1:
        return edge_id_for(road.id, "forward")
    if road.to_junction == junction_id and road.lanes_back >= 1:
        return edge_id_for(road.id, "backward")
    return None


def validate_network(project: NetworkProject) -> List[ValidationIssue]:
    """Run semantic validation rules on a parsed `NetworkProject`."""
    issues: List[ValidationIssue] = []

    def add_err(code: str, msg: str, el_type: Optional[str] = None, el_id: Optional[str] = None) -> None:
        issues.append(ValidationIssue(severity="error", code=code, message=msg, element_type=el_type, element_id=el_id))

    if not ID_PATTERN.match(project.id):
        add_err("invalid_id", f"Network id '{project.id}' must match [A-Za-z][A-Za-z0-9_]*.", "network", project.id)

    if len(project.junctions) < 2:
        add_err("too_few_junctions", "Network must define at least 2 junctions.", "network", project.id)
    if len(project.roads) < 1:
        add_err("too_few_roads", "Network must define at least 1 road.", "network", project.id)

    # 1. Junctions
    junctions_by_id: Dict[str, JunctionDef] = {}
    for j in project.junctions:
        if not ID_PATTERN.match(j.id):
            add_err("invalid_id", f"Junction id '{j.id}' must match [A-Za-z][A-Za-z0-9_]*.", "junction", j.id)
        if j.id in junctions_by_id:
            add_err("duplicate_id", f"Duplicate junction id '{j.id}'.", "junction", j.id)
        else:
            junctions_by_id[j.id] = j

    # 2. Roads
    roads_by_id: Dict[str, RoadDef] = {}
    connected_roads: Dict[str, List[RoadDef]] = {jid: [] for jid in junctions_by_id}
    for r in project.roads:
        if not ID_PATTERN.match(r.id):
            add_err("invalid_id", f"Road id '{r.id}' must match [A-Za-z][A-Za-z0-9_]*.", "road", r.id)
        if r.id in roads_by_id:
            add_err("duplicate_id", f"Duplicate road id '{r.id}'.", "road", r.id)
        else:
            roads_by_id[r.id] = r

        if r.from_junction == r.to_junction:
            add_err("self_loop_road", f"Road '{r.id}' cannot start and end at the same junction '{r.from_junction}'.", "road", r.id)
        if r.from_junction not in junctions_by_id:
            add_err("unknown_junction", f"Road '{r.id}' references unknown 'from' junction '{r.from_junction}'.", "road", r.id)
        if r.to_junction not in junctions_by_id:
            add_err("unknown_junction", f"Road '{r.id}' references unknown 'to' junction '{r.to_junction}'.", "road", r.id)

        for idx, pt in enumerate(r.points):
            if len(pt) != 2:
                add_err("invalid_point", f"Road '{r.id}' shape point {idx} must be [x, y].", "road", r.id)

        if r.from_junction in junctions_by_id and r.to_junction in junctions_by_id and r.from_junction != r.to_junction:
            connected_roads[r.from_junction].append(r)
            connected_roads[r.to_junction].append(r)
            length = road_length_m(r, junctions_by_id)
            if length < 5.0:
                add_err("road_too_short", f"Road '{r.id}' is too short ({length:.1f}m; minimum 5m).", "road", r.id)

    # 3. Traffic light junctions need >= 2 connected roads
    for j in project.junctions:
        if j.type == "traffic_light" and len(connected_roads.get(j.id, [])) < 2:
            add_err(
                "tl_needs_two_roads",
                f"Traffic-light junction '{j.id}' must have at least 2 connected roads.",
                "junction",
                j.id,
            )

    # 4. Signals
    seen_signal_junctions = set()
    for sig in project.signals:
        if sig.junction in seen_signal_junctions:
            add_err("duplicate_signal_plan", f"Multiple signal plans target junction '{sig.junction}'.", "signal", sig.junction)
        seen_signal_junctions.add(sig.junction)

        j = junctions_by_id.get(sig.junction)
        if j is None:
            add_err("unknown_junction", f"Signal plan references unknown junction '{sig.junction}'.", "signal", sig.junction)
            continue
        if j.type != "traffic_light":
            add_err(
                "signal_on_non_tl",
                f"Signal plan targets junction '{sig.junction}' which has type '{j.type}' (expected 'traffic_light').",
                "signal",
                sig.junction,
            )
        if not sig.phases:
            add_err("empty_signal_plan", f"Signal plan for junction '{sig.junction}' must have at least 1 phase.", "signal", sig.junction)
        for p_idx, phase in enumerate(sig.phases):
            if not phase.approaches:
                add_err(
                    "empty_phase_approaches",
                    f"Signal plan '{sig.junction}' phase {p_idx + 1} must list at least 1 approach road.",
                    "signal",
                    sig.junction,
                )
            for rid in phase.approaches:
                road = roads_by_id.get(rid)
                if road is None:
                    add_err(
                        "unknown_road",
                        f"Signal plan '{sig.junction}' phase {p_idx + 1} references unknown road '{rid}'.",
                        "signal",
                        sig.junction,
                    )
                elif incoming_edge_for_road_at_junction(road, sig.junction) is None:
                    add_err(
                        "approach_not_entering",
                        f"Road '{rid}' does not have an incoming lane entering junction '{sig.junction}'.",
                        "signal",
                        sig.junction,
                    )

    # 5. Demand: vehicle mix & flows
    mix = project.demand.vehicle_mix
    if not mix:
        add_err("empty_vehicle_mix", "Demand vehicle_mix must specify at least one vehicle type.", "demand", None)
    else:
        for vt, share in mix.items():
            if vt not in BUILTIN_VTYPES:
                add_err(
                    "unknown_vtype",
                    f"Unknown vehicle type '{vt}' in vehicle_mix; allowed: {sorted(BUILTIN_VTYPES)}.",
                    "demand",
                    vt,
                )
            if share < 0:
                add_err("negative_share", f"Vehicle mix share for '{vt}' cannot be negative.", "demand", vt)
        total_share = sum(mix.values())
        if abs(total_share - 1.0) > 0.01:
            add_err(
                "invalid_mix_sum",
                f"Vehicle mix shares sum to {total_share:.3f} (expected 1.0 ± 0.01).",
                "demand",
                None,
            )

    seen_flows = set()
    for flow in project.demand.flows:
        if not ID_PATTERN.match(flow.id):
            add_err("invalid_id", f"Flow id '{flow.id}' must match [A-Za-z][A-Za-z0-9_]*.", "flow", flow.id)
        if flow.id in seen_flows:
            add_err("duplicate_id", f"Duplicate flow id '{flow.id}'.", "flow", flow.id)
        seen_flows.add(flow.id)

        if flow.from_junction == flow.to_junction:
            add_err("same_origin_dest", f"Flow '{flow.id}' origin and destination cannot be the same ('{flow.from_junction}').", "flow", flow.id)
        if flow.from_junction not in junctions_by_id:
            add_err("unknown_junction", f"Flow '{flow.id}' references unknown origin junction '{flow.from_junction}'.", "flow", flow.id)
        else:
            adj = connected_roads[flow.from_junction]
            if len(adj) != 1:
                add_err(
                    "non_boundary_origin",
                    f"Flow '{flow.id}' origin '{flow.from_junction}' must be a boundary junction (connected to 1 road, has {len(adj)}).",
                    "flow",
                    flow.id,
                )
            elif outgoing_edge_for_road_at_junction(adj[0], flow.from_junction) is None:
                add_err(
                    "no_outgoing_lane",
                    f"Flow '{flow.id}' origin '{flow.from_junction}' has no outgoing lane on road '{adj[0].id}'.",
                    "flow",
                    flow.id,
                )

        if flow.to_junction not in junctions_by_id:
            add_err("unknown_junction", f"Flow '{flow.id}' references unknown destination junction '{flow.to_junction}'.", "flow", flow.id)
        else:
            adj = connected_roads[flow.to_junction]
            if len(adj) != 1:
                add_err(
                    "non_boundary_dest",
                    f"Flow '{flow.id}' destination '{flow.to_junction}' must be a boundary junction (connected to 1 road, has {len(adj)}).",
                    "flow",
                    flow.id,
                )
            elif incoming_edge_for_road_at_junction(adj[0], flow.to_junction) is None:
                add_err(
                    "no_incoming_lane",
                    f"Flow '{flow.id}' destination '{flow.to_junction}' has no incoming lane on road '{adj[0].id}'.",
                    "flow",
                    flow.id,
                )

    # 6. Obstacles
    seen_obstacles = set()
    for obs in project.obstacles:
        if not ID_PATTERN.match(obs.id):
            add_err("invalid_id", f"Obstacle id '{obs.id}' must match [A-Za-z][A-Za-z0-9_]*.", "obstacle", obs.id)
        if obs.id in seen_obstacles:
            add_err("duplicate_id", f"Duplicate obstacle id '{obs.id}'.", "obstacle", obs.id)
        seen_obstacles.add(obs.id)

        road = roads_by_id.get(obs.road)
        if road is None:
            add_err("unknown_road", f"Obstacle '{obs.id}' references unknown road '{obs.road}'.", "obstacle", obs.id)
            continue

        num_lanes = road.lanes if obs.direction == "forward" else road.lanes_back
        if num_lanes == 0:
            add_err(
                "invalid_direction",
                f"Obstacle '{obs.id}' targets '{obs.direction}' direction on one-way road '{obs.road}'.",
                "obstacle",
                obs.id,
            )
            continue
        if obs.lane >= num_lanes:
            add_err(
                "invalid_lane",
                f"Obstacle '{obs.id}' targets lane {obs.lane} on road '{obs.road}' ({obs.direction}), which only has {num_lanes} lane(s).",
                "obstacle",
                obs.id,
            )

        if obs.kind == "blockage":
            if obs.position_m is None:
                add_err("missing_position", f"Blockage obstacle '{obs.id}' must specify position_m.", "obstacle", obs.id)
            elif road.from_junction in junctions_by_id and road.to_junction in junctions_by_id:
                rlen = road_length_m(road, junctions_by_id)
                ob_len = obs.length_m or 8.0
                if obs.position_m + ob_len > rlen:
                    add_err(
                        "obstacle_out_of_bounds",
                        f"Blockage '{obs.id}' (pos {obs.position_m}m + len {ob_len}m) exceeds road '{obs.road}' length ({rlen:.1f}m).",
                        "obstacle",
                        obs.id,
                    )

    return issues
