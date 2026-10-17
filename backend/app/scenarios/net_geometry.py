"""Read lane / junction polylines from a compiled SUMO `.net.xml`.

Used by scenarios with non-straight geometry (roundabouts, slips, U-turns) so the
frontend can render arbitrary road shapes instead of hard-coded X ranges.
"""
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

from ..schemas import LaneShape, JunctionShape


def _parse_shape(raw: str) -> List[List[float]]:
    pts = []
    for pair in raw.split():
        x, y = pair.split(",")[:2]
        pts.append([round(float(x), 2), round(float(y), 2)])
    return pts


@dataclass
class NetGeometry:
    lanes: List[LaneShape]
    connectors: List[LaneShape]     # internal junction lanes (turn paths, U-turn)
    junctions: List[JunctionShape]
    edge_lengths: Dict[str, float]  # non-internal edge id -> length (m)

    @property
    def total_edge_length(self) -> float:
        return sum(self.edge_lengths.values())

    def bounds(self, margin: float = 0.0) -> Dict[str, float]:
        xs = [p[0] for ln in self.lanes for p in ln.shape]
        ys = [p[1] for ln in self.lanes for p in ln.shape]
        return {
            "min_x": round(min(xs) - margin, 1), "max_x": round(max(xs) + margin, 1),
            "min_y": round(min(ys) - margin, 1), "max_y": round(max(ys) + margin, 1),
        }


def load_net_geometry(net_path: Path) -> NetGeometry:
    root = ET.parse(net_path).getroot()
    lanes: List[LaneShape] = []
    connectors: List[LaneShape] = []
    edge_lengths: Dict[str, float] = {}

    for edge in root.findall("edge"):
        internal = edge.get("function") == "internal"
        eid = edge.get("id")
        for lane in edge.findall("lane"):
            (connectors if internal else lanes).append(LaneShape(
                id=lane.get("id"),
                edge=eid,
                index=int(lane.get("index", 0)),
                width=float(lane.get("width", 3.2)),
                speed_limit_kmh=round(float(lane.get("speed", 13.89)) * 3.6, 1),
                shape=_parse_shape(lane.get("shape", "")),
            ))
            if not internal and lane.get("index") == "0":
                edge_lengths[eid] = float(lane.get("length", 0.0))

    junctions = [
        JunctionShape(id=j.get("id"), shape=_parse_shape(j.get("shape")))
        for j in root.findall("junction")
        if j.get("type") != "internal" and j.get("shape")
    ]
    return NetGeometry(lanes=lanes, connectors=connectors, junctions=junctions, edge_lengths=edge_lengths)
