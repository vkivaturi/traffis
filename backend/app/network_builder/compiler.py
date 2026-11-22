"""Compiler turning a validated `NetworkProject` into SUMO inputs via `netconvert`."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import subprocess
import xml.etree.ElementTree as ET
from collections import defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from xml.sax.saxutils import quoteattr

from ..config import resolve_sumo_binary, settings
from .schema import (
    BUILTIN_VTYPES,
    NetworkProject,
    ObstacleDef,
    RoadDef,
    SignalPlanDef,
    ValidationIssue,
    edge_id_for,
    incoming_edge_for_road_at_junction,
    outgoing_edge_for_road_at_junction,
    road_polyline,
    validate_network,
)

logger = logging.getLogger("network_compiler")

COMPILER_VERSION = "1"


def write_text_safe(path: Path, content: str) -> None:
    """Write text atomically when possible, avoiding unnecessary writes."""
    try:
        if path.is_file() and path.read_text(encoding="utf-8") == content:
            return
    except OSError:
        pass
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    try:
        os.replace(tmp, path)
    except PermissionError:
        path.write_text(content, encoding="utf-8")
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass


class CompileError(Exception):
    """Raised when validation or SUMO compilation fails."""

    def __init__(self, message: str, issues: Optional[List[ValidationIssue]] = None):
        super().__init__(message)
        self.issues: List[ValidationIssue] = issues or [
            ValidationIssue(severity="error", code="compile_error", message=message)
        ]


@dataclass
class CompileResult:
    network_id: str
    build_dir: Path
    net_file: Path
    route_file: Path
    sumocfg_file: Path
    tll_file: Optional[Path]
    content_hash: str
    from_cache: bool
    warnings: List[str] = field(default_factory=list)
    flow_routes: Dict[str, List[str]] = field(default_factory=dict)  # flow_id -> list of edge IDs


def compute_project_hash(project: NetworkProject) -> str:
    canonical = json.dumps(
        {
            "compiler_version": COMPILER_VERSION,
            "step_length": settings.STEP_LENGTH,
            "project": project.model_dump(by_alias=True),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _write_nod_xml(project: NetworkProject, path: Path) -> None:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<nodes xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/nodes_file.xsd">',
    ]
    for j in project.junctions:
        extra = ' tlType="static"' if j.type == "traffic_light" else ""
        lines.append(
            f'    <node id={quoteattr(j.id)} x="{j.x:g}" y="{j.y:g}" type={quoteattr(j.type)}{extra}/>'
        )
    lines.append("</nodes>")
    write_text_safe(path, "\n".join(lines) + "\n")


def _write_edg_xml(project: NetworkProject, path: Path) -> None:
    junctions_by_id = {j.id: j for j in project.junctions}
    closures: Dict[str, Set[int]] = defaultdict(set)
    for obs in project.obstacles:
        if obs.kind == "lane_closure":
            closures[edge_id_for(obs.road, obs.direction)].add(obs.lane)

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<edges xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/edges_file.xsd">',
    ]

    width = project.settings.lane_width_m
    for r in project.roads:
        speed_ms = (r.speed_kmh if r.speed_kmh is not None else project.settings.default_speed_kmh) / 3.6
        pts = road_polyline(r, junctions_by_id)
        fwd_shape = " ".join(f"{p[0]:g},{p[1]:g}" for p in pts) if r.points else ""
        bwd_shape = " ".join(f"{p[0]:g},{p[1]:g}" for p in reversed(pts)) if r.points else ""

        def emit_edge(eid: str, frm: str, to: str, num_lanes: int, shape: str) -> None:
            shape_attr = f" shape={quoteattr(shape)}" if shape else ""
            closed_lanes = sorted(closures.get(eid, set()))
            header = (
                f'    <edge id={quoteattr(eid)} from={quoteattr(frm)} to={quoteattr(to)} '
                f'numLanes="{num_lanes}" speed="{speed_ms:.3f}" width="{width:g}"{shape_attr}'
            )
            if closed_lanes:
                lines.append(header + ">")
                for lane_idx in closed_lanes:
                    lines.append(f'        <lane index="{lane_idx}" disallow="all"/>')
                lines.append("    </edge>")
            else:
                lines.append(header + "/>")

        emit_edge(edge_id_for(r.id, "forward"), r.from_junction, r.to_junction, r.lanes, fwd_shape)
        if r.lanes_back > 0:
            emit_edge(edge_id_for(r.id, "backward"), r.to_junction, r.from_junction, r.lanes_back, bwd_shape)

    lines.append("</edges>")
    write_text_safe(path, "\n".join(lines) + "\n")


def _write_netccfg(project: NetworkProject, nod_name: str, edg_name: str, net_name: str, path: Path) -> None:
    lefthand = "true" if project.settings.drive_side == "left" else "false"
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<configuration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/netconvertConfiguration.xsd">
    <input>
        <node-files value={quoteattr(nod_name)}/>
        <edge-files value={quoteattr(edg_name)}/>
    </input>
    <output>
        <output-file value={quoteattr(net_name)}/>
    </output>
    <processing>
        <lefthand value="{lefthand}"/>
        <no-turnarounds value="true"/>
        <junctions.corner-detail value="5"/>
        <offset.disable-normalization value="true"/>
    </processing>
    <tls_building>
        <tls.guess value="false"/>
    </tls_building>
    <report>
        <verbose value="false"/>
    </report>
</configuration>
"""
    write_text_safe(path, xml)


def _run_netconvert(netccfg_path: Path) -> List[str]:
    netconvert_bin = resolve_sumo_binary("netconvert")
    try:
        proc = subprocess.run(
            [netconvert_bin, "-c", str(netccfg_path)],
            cwd=str(netccfg_path.parent),
            capture_output=True,
            text=True,
            timeout=30,
        )
    except FileNotFoundError:
        raise CompileError(
            f"netconvert binary not found ('{netconvert_bin}'). Ensure Eclipse SUMO is installed and SUMO_HOME is set."
        )
    except subprocess.TimeoutExpired:
        raise CompileError("netconvert timed out after 30 seconds.")

    warnings: List[str] = []
    for line in (proc.stdout + "\n" + proc.stderr).splitlines():
        stripped = line.strip()
        if stripped.startswith("Warning:"):
            warnings.append(stripped)

    if proc.returncode != 0:
        err_lines = [l.strip() for l in (proc.stderr or proc.stdout).splitlines() if l.strip()]
        summary = "\n".join(err_lines[:10]) or f"netconvert exited with code {proc.returncode}"
        raise CompileError(f"netconvert failed:\n{summary}")

    return warnings


def _parse_compiled_net(net_path: Path) -> Tuple[
    Dict[str, Set[str]],
    Dict[str, float],
    Dict[str, Dict[int, str]],
    Dict[str, Dict[int, str]],
]:
    """Parse compiled `.net.xml` for:
    - adjacency: edge_id -> set of reachable next edge_ids (excluding internal edges)
    - lane_lengths: lane_id -> compiled length in metres
    - tl_links: tl_id -> {linkIndex: from_edge_id}
    - junction_responses: junction_id -> {request_index: response bitstring}
    """
    root = ET.parse(net_path).getroot()

    adjacency: Dict[str, Set[str]] = defaultdict(set)
    lane_lengths: Dict[str, float] = {}
    tl_links: Dict[str, Dict[int, str]] = defaultdict(dict)
    junction_responses: Dict[str, Dict[int, str]] = defaultdict(dict)

    for edge in root.findall("edge"):
        if edge.get("function") == "internal":
            continue
        for lane in edge.findall("lane"):
            lid = lane.get("id")
            if lid:
                lane_lengths[lid] = float(lane.get("length", "0.0"))

    for conn in root.findall("connection"):
        frm = conn.get("from", "")
        to = conn.get("to", "")
        if not frm.startswith(":") and not to.startswith(":"):
            adjacency[frm].add(to)
        tl = conn.get("tl")
        link_idx = conn.get("linkIndex")
        if tl and link_idx is not None:
            tl_links[tl][int(link_idx)] = frm

    for junc in root.findall("junction"):
        jid = junc.get("id")
        if not jid or junc.get("type") == "internal":
            continue
        for req in junc.findall("request"):
            idx = req.get("index")
            resp = req.get("response") or req.get("foes") or ""
            if idx is not None:
                junction_responses[jid][int(idx)] = resp

    return adjacency, lane_lengths, tl_links, junction_responses


def _bfs_shortest_path(adjacency: Dict[str, Set[str]], start_edge: str, end_edge: str) -> Optional[List[str]]:
    if start_edge == end_edge:
        return [start_edge]
    queue: deque[List[str]] = deque([[start_edge]])
    visited = {start_edge}
    while queue:
        path = queue.popleft()
        last = path[-1]
        for nxt in sorted(adjacency.get(last, set())):
            if nxt == end_edge:
                return path + [nxt]
            if nxt not in visited:
                visited.add(nxt)
                queue.append(path + [nxt])
    return None


def _resolve_flow_routes(
    project: NetworkProject,
    adjacency: Dict[str, Set[str]],
) -> Tuple[Dict[str, List[str]], List[ValidationIssue]]:
    connected: Dict[str, List[RoadDef]] = defaultdict(list)
    for r in project.roads:
        connected[r.from_junction].append(r)
        connected[r.to_junction].append(r)

    routes: Dict[str, List[str]] = {}
    issues: List[ValidationIssue] = []

    for flow in project.demand.flows:
        orig_roads = connected.get(flow.from_junction, [])
        dest_roads = connected.get(flow.to_junction, [])
        if not orig_roads or not dest_roads:
            continue
        start_edge = outgoing_edge_for_road_at_junction(orig_roads[0], flow.from_junction)
        end_edge = incoming_edge_for_road_at_junction(dest_roads[0], flow.to_junction)
        if not start_edge or not end_edge:
            continue

        path = _bfs_shortest_path(adjacency, start_edge, end_edge)
        if path is None:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="unreachable_flow",
                    message=f"No route from '{flow.from_junction}' to '{flow.to_junction}' for flow '{flow.id}'.",
                    element_type="flow",
                    element_id=flow.id,
                )
            )
        else:
            routes[flow.id] = path

    return routes, issues


def _build_phase_state_string(
    num_links: int,
    link_to_edge: Dict[int, str],
    responses: Dict[int, str],
    green_edges: Set[str],
) -> str:
    green_indices = {idx for idx, edge in link_to_edge.items() if edge in green_edges}
    chars: List[str] = []
    for i in range(num_links):
        if i not in green_indices:
            chars.append("r")
            continue
        resp = responses.get(i, "")
        must_yield = False
        if resp:
            n = len(resp)
            for j in green_indices:
                if j == i:
                    continue
                pos = n - 1 - j
                if 0 <= pos < n and resp[pos] == "1":
                    must_yield = True
                    break
        chars.append("g" if must_yield else "G")
    return "".join(chars)


def _write_tll_xml(
    project: NetworkProject,
    tl_links: Dict[str, Dict[int, str]],
    junction_responses: Dict[str, Dict[int, str]],
    path: Path,
) -> Optional[Path]:
    if not project.signals:
        return None

    roads_by_id = {r.id: r for r in project.roads}
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<additional xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/additional_file.xsd">',
    ]

    wrote_any = False
    for plan in project.signals:
        link_map = tl_links.get(plan.junction)
        if not link_map:
            continue
        num_links = max(link_map.keys()) + 1
        responses = junction_responses.get(plan.junction, {})
        wrote_any = True

        lines.append(
            f'    <tlLogic id={quoteattr(plan.junction)} type="static" '
            f'programID="traffis" offset="{plan.offset_s:g}">'
        )
        for phase in plan.phases:
            green_edges: Set[str] = set()
            for rid in phase.approaches:
                r = roads_by_id.get(rid)
                if r:
                    inc = incoming_edge_for_road_at_junction(r, plan.junction)
                    if inc:
                        green_edges.add(inc)

            green_state = _build_phase_state_string(num_links, link_map, responses, green_edges)
            lines.append(f'        <phase duration="{phase.green_s:g}" state="{green_state}"/>')

            if plan.amber_s > 0:
                amber_state = "".join("y" if c in ("G", "g") else "r" for c in green_state)
                lines.append(f'        <phase duration="{plan.amber_s:g}" state="{amber_state}"/>')

            if plan.all_red_s > 0:
                lines.append(f'        <phase duration="{plan.all_red_s:g}" state="{"r" * num_links}"/>')

        lines.append("    </tlLogic>")

    lines.append("</additional>")
    if not wrote_any:
        return None

    write_text_safe(path, "\n".join(lines) + "\n")
    return path


def _write_rou_xml(
    project: NetworkProject,
    flow_routes: Dict[str, List[str]],
    lane_lengths: Dict[str, float],
    path: Path,
    warnings: List[str],
) -> None:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<routes xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/routes_file.xsd">',
        '    <vTypeDistribution id="user_mix">',
    ]

    for vid, share in project.demand.vehicle_mix.items():
        if share <= 0:
            continue
        attrs = {"probability": f"{share:.4f}", **BUILTIN_VTYPES[vid]}
        attr_str = " ".join(f"{k}={quoteattr(v)}" for k, v in attrs.items())
        lines.append(f'        <vType id={quoteattr(vid)} {attr_str}/>')
    lines.append("    </vTypeDistribution>")
    lines.append("")

    # Blockage obstacles as stationary vehicles with permanent stops
    blockages: List[ObstacleDef] = [o for o in project.obstacles if o.kind == "blockage"]
    for obs in blockages:
        ob_len = obs.length_m or 8.0
        vtype_id = f"obs_type_{obs.id}"
        lines.append(
            f'    <vType id={quoteattr(vtype_id)} vClass="emergency" guiShape="truck" '
            f'color="#ef4444" length="{ob_len:g}" width="2.2" maxSpeed="0.1" accel="0.5" decel="4.5"/>'
        )
    if blockages:
        lines.append("")

    for flow in project.demand.flows:
        edges = flow_routes.get(flow.id)
        if not edges:
            continue
        lines.append(f'    <route id={quoteattr(f"r_{flow.id}")} edges={quoteattr(" ".join(edges))}/>')
    if flow_routes:
        lines.append("")

    for obs in blockages:
        eid = edge_id_for(obs.road, obs.direction)
        lid = f"{eid}_{obs.lane}"
        ob_len = obs.length_m or 8.0
        raw_end = (obs.position_m or 0.0) + ob_len
        compiled_len = lane_lengths.get(lid)
        end_pos = raw_end
        if compiled_len is not None and compiled_len > 0:
            max_end = max(ob_len + 0.5, compiled_len - 1.0)
            if raw_end > max_end:
                end_pos = max_end
                warnings.append(
                    f"Obstacle '{obs.id}' end position clamped from {raw_end:.1f}m to {end_pos:.1f}m "
                    f"(compiled lane length {compiled_len:.1f}m)."
                )
        lines.append(
            f'    <vehicle id={quoteattr(f"obs_{obs.id}")} type={quoteattr(f"obs_type_{obs.id}")} '
            f'depart="0" departLane="{obs.lane}" departPos="{end_pos:.2f}" departSpeed="0">'
        )
        lines.append(f'        <route edges={quoteattr(eid)}/>')
        lines.append(
            f'        <stop lane={quoteattr(lid)} endPos="{end_pos:.2f}" duration="100000" parking="false"/>'
        )
        lines.append("    </vehicle>")
    if blockages:
        lines.append("")

    for flow in project.demand.flows:
        if flow.vehs_per_hour <= 0 or flow.id not in flow_routes:
            continue
        lines.append(
            f'    <flow id={quoteattr(flow.id)} route={quoteattr(f"r_{flow.id}")} type="user_mix" '
            f'begin="0" end="100000" vehsPerHour="{flow.vehs_per_hour:g}" '
            f'departLane="best" departSpeed="desired"/>'
        )

    lines.append("</routes>")
    write_text_safe(path, "\n".join(lines) + "\n")


def _write_sumocfg(net_name: str, rou_name: str, tll_name: Optional[str], path: Path) -> None:
    add_line = f'        <additional-files value={quoteattr(tll_name)}/>\n' if tll_name else ""
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<configuration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/sumoConfiguration.xsd">
    <input>
        <net-file value={quoteattr(net_name)}/>
        <route-files value={quoteattr(rou_name)}/>
{add_line}    </input>
    <time>
        <begin value="0"/>
        <end value="100000"/>
        <step-length value="{settings.STEP_LENGTH:g}"/>
    </time>
    <processing>
        <collision.action value="none"/>
        <time-to-teleport value="300"/>
    </processing>
    <report>
        <no-step-log value="true"/>
        <no-warnings value="true"/>
    </report>
</configuration>
"""
    write_text_safe(path, xml)


def compile_network(project: NetworkProject, build_dir: Path, force: bool = False) -> CompileResult:
    """Validate and compile `project` into SUMO files inside `build_dir`."""
    issues = validate_network(project)
    errors = [i for i in issues if i.severity == "error"]
    if errors:
        summary = "; ".join(e.message for e in errors[:5])
        raise CompileError(f"Network validation failed: {summary}", issues=errors)

    build_dir.mkdir(parents=True, exist_ok=True)
    nid = project.id
    nod_file = build_dir / f"{nid}.nod.xml"
    edg_file = build_dir / f"{nid}.edg.xml"
    netccfg_file = build_dir / f"{nid}.netccfg"
    net_file = build_dir / f"{nid}.net.xml"
    tll_file = build_dir / f"{nid}.tll.xml"
    rou_file = build_dir / f"{nid}.rou.xml"
    sumocfg_file = build_dir / f"{nid}.sumocfg"
    meta_file = build_dir / ".build_meta.json"

    content_hash = compute_project_hash(project)
    if not force and meta_file.is_file() and net_file.is_file() and rou_file.is_file() and sumocfg_file.is_file():
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
            if meta.get("hash") == content_hash:
                return CompileResult(
                    network_id=nid,
                    build_dir=build_dir,
                    net_file=net_file,
                    route_file=rou_file,
                    sumocfg_file=sumocfg_file,
                    tll_file=tll_file if meta.get("has_tll") and tll_file.is_file() else None,
                    content_hash=content_hash,
                    from_cache=True,
                    warnings=meta.get("warnings", []),
                    flow_routes=meta.get("flow_routes", {}),
                )
        except Exception:
            pass

    _write_nod_xml(project, nod_file)
    _write_edg_xml(project, edg_file)
    _write_netccfg(project, nod_file.name, edg_file.name, net_file.name, netccfg_file)

    warnings = _run_netconvert(netccfg_file)

    adjacency, lane_lengths, tl_links, junction_responses = _parse_compiled_net(net_file)

    flow_routes, reach_issues = _resolve_flow_routes(project, adjacency)
    if reach_issues:
        summary = "; ".join(i.message for i in reach_issues[:5])
        raise CompileError(f"Route reachability check failed: {summary}", issues=reach_issues)

    written_tll = _write_tll_xml(project, tl_links, junction_responses, tll_file)
    if written_tll is None and tll_file.exists():
        tll_file.unlink(missing_ok=True)

    _write_rou_xml(project, flow_routes, lane_lengths, rou_file, warnings)
    _write_sumocfg(
        net_file.name,
        rou_file.name,
        written_tll.name if written_tll else None,
        sumocfg_file,
    )

    write_text_safe(
        meta_file,
        json.dumps(
            {
                "hash": content_hash,
                "has_tll": written_tll is not None,
                "warnings": warnings,
                "flow_routes": flow_routes,
            },
            indent=2,
        )
        + "\n",
    )

    logger.info("Compiled user network '%s' into %s (%d flows)", nid, build_dir, len(flow_routes))
    return CompileResult(
        network_id=nid,
        build_dir=build_dir,
        net_file=net_file,
        route_file=rou_file,
        sumocfg_file=sumocfg_file,
        tll_file=written_tll,
        content_hash=content_hash,
        from_cache=False,
        warnings=warnings,
        flow_routes=flow_routes,
    )
