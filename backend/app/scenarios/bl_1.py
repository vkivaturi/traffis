"""BL-1 Loop: signal-free 3-lane one-way loop network (UI geometry preview)."""
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional

from .base import BaseScenario
from .net_geometry import NetGeometry, load_net_geometry
from ..schemas import (
    ScenarioMetadata,
    SpawnOriginInfo,
    NetworkInfo,
    NetworkGeometry,
    CentreLine,
    ArmLabel,
    MapCallout,
    SpawnRequest,
    TrafficLightState,
)

logger = logging.getLogger("scenario_bl_1")

CENTRE_LINES = [
    CentreLine(id="centre_SHL", edges=["sec_5", "sec_4_shl"], shape=[[-250.0, 40.0], [-95.0, 40.0]]),
    CentreLine(id="centre_INO", edges=["sec_12", "sec_13"], shape=[[55.0, 135.0], [240.0, 135.0]]),
    CentreLine(id="centre_THB", edges=["sec_24", "sec_25"], shape=[[15.0, -24.0], [190.0, -24.0]]),
    CentreLine(id="centre_15_16", edges=["sec_15", "sec_16"], shape=[[-105.0, -34.0], [-82.0, -26.0], [15.0, -24.0]]),
    CentreLine(id="centre_HIT", edges=["sec_8", "sec_9"], shape=[[-46.0, 162.0], [-32.0, 240.0]]),
]

LABELS = [
    ArmLabel(id="BIO", name="Bio Diversity", x=-92.0, y=-255.0, description="South-west corridor (sec 1 in, sec 21 out)"),
    ArmLabel(id="SHL", name="Shilparamam", x=-265.0, y=40.0, description="Mid-west corridor (sec 5 in, sec 4 out)"),
    ArmLabel(id="KON", name="Kondapur", x=-265.0, y=160.0, description="North-west exit (sec 7 out)"),
    ArmLabel(id="HIT", name="HITEC City", x=-32.0, y=255.0, description="North corridor (sec 8 out, sec 9 in)"),
    ArmLabel(id="MIN", name="Mindspace", x=75.0, y=255.0, description="North-east entry (sec 11 in)"),
    ArmLabel(id="INO", name="Inorbit", x=255.0, y=135.0, description="North-east corridor (sec 12 out, sec 13 in)"),
    ArmLabel(id="THB", name="T-Hub", x=205.0, y=-24.0, description="Mid-east corridor (sec 24 out, sec 25 in)"),
    ArmLabel(id="MHP", name="Madhapur", x=205.0, y=-230.0, description="South-east exit (sec 22 out)"),
]

CALLOUTS = [
    # Landmarks
    MapCallout(text="IKEA", x=-162.0, y=95.0),
    MapCallout(text="MIND SPACE", x=18.0, y=202.0),
    MapCallout(text="MY HOME", x=-30.0, y=-82.0),
    MapCallout(text="PARK", x=-30.0, y=-190.0),
    # Section numbers matching the whiteboard
    MapCallout(text="[1]", x=-125.0, y=-190.0),
    MapCallout(text="[2]", x=-122.0, y=-88.0),
    MapCallout(text="[3]", x=-118.0, y=4.0),
    MapCallout(text="[4]", x=-175.0, y=26.0),
    MapCallout(text="[4]", x=-56.0, y=55.0),
    MapCallout(text="[5]", x=-175.0, y=54.0),
    MapCallout(text="[6]", x=-96.0, y=95.0),
    MapCallout(text="[7]", x=-155.0, y=166.0),
    MapCallout(text="[8]", x=-60.0, y=205.0),
    MapCallout(text="[9]", x=-16.0, y=205.0),
    MapCallout(text="[10]", x=8.0, y=160.0),
    MapCallout(text="[11]", x=82.0, y=190.0),
    MapCallout(text="[12]", x=150.0, y=150.0),
    MapCallout(text="[13]", x=150.0, y=120.0),
    MapCallout(text="[14]", x=56.0, y=55.0),
    MapCallout(text="[15]", x=-32.0, y=-12.0),
    MapCallout(text="[16]", x=-42.0, y=-42.0),
    MapCallout(text="[17]", x=34.0, y=-82.0),
    MapCallout(text="[18]", x=-26.0, y=-150.0),
    MapCallout(text="[19]", x=42.0, y=-182.0),
    MapCallout(text="[20]", x=-92.0, y=-152.0),
    MapCallout(text="[21]", x=-60.0, y=-190.0),
    MapCallout(text="[22]", x=110.0, y=-242.0),
    MapCallout(text="[24]", x=105.0, y=-10.0),
    MapCallout(text="[25]", x=105.0, y=-38.0),
]

YIELD_LANES = [
    "sec_20_0", "sec_20_1", "sec_20_2",
    "sec_4_nb_0", "sec_4_nb_1", "sec_4_nb_2",
    "sec_5_0", "sec_5_1", "sec_5_2",
    "sec_6_10_0", "sec_6_10_1", "sec_6_10_2",
]


class Bl1Scenario(BaseScenario):
    id = "bl_1"
    name = "BL-1 Loop (UI Preview)"
    description = (
        "Signal-free 3-lane one-way loop network connecting BIO, SHL, KON, HIT, MIN, INO, THB, and MHP. "
        "Geometry preview without active traffic simulation."
    )
    type = "intersection"
    tl_id = ""
    demand_from_route_file = True
    apply_default_speed_limit = False

    def __init__(self, sumocfg_file: str):
        super().__init__(sumocfg_file)
        self._net_path = Path(sumocfg_file).parent / "bl_1.net.xml"
        self._geo: Optional[NetGeometry] = None
        self.bounds = {"min_x": -275.0, "max_x": 265.0, "min_y": -265.0, "max_y": 265.0}
        self.default_camera = {"x": -5.0, "y": 0.0, "zoom": 1.35}

    def _get_geo(self) -> NetGeometry:
        if self._geo is None:
            self._geo = load_net_geometry(self._net_path)
            self.bounds = self._geo.bounds(margin=25.0)
        return self._geo

    def get_metadata(self) -> ScenarioMetadata:
        self._get_geo()
        return ScenarioMetadata(
            id=self.id,
            name=self.name,
            description=self.description,
            type=self.type,
            bounds=self.bounds,
            default_camera=self.default_camera,
            spawn_origins=[
                SpawnOriginInfo(id="BIO", label="BIO", description="Bio Diversity inbound"),
                SpawnOriginInfo(id="SHL", label="SHL", description="Shilparamam inbound"),
                SpawnOriginInfo(id="HIT", label="HIT", description="HITEC City inbound"),
                SpawnOriginInfo(id="MIN", label="MIN", description="Mindspace inbound"),
                SpawnOriginInfo(id="INO", label="INO", description="Inorbit inbound"),
                SpawnOriginInfo(id="THB", label="THB", description="T-Hub inbound"),
            ],
            options=[],
        )

    def get_network_info(self) -> NetworkInfo:
        geo = self._get_geo()
        return NetworkInfo(
            scenario=self.get_metadata(),
            road_length=round(geo.total_edge_length, 1),
            num_lanes=3,
            num_lanes_per_dir=3,
            lane_width=3.2,
            traffic_light_x=0.0,
            traffic_light_y=0.0,
            lanes=[],
            geometry=NetworkGeometry(
                lanes=geo.lanes,
                connectors=geo.connectors,
                junctions=geo.junctions,
                centre_lines=CENTRE_LINES,
                labels=LABELS,
                callouts=CALLOUTS,
                yield_lanes=YIELD_LANES,
                bounds=self.bounds,
            ),
        )

    def get_spawn_route(self, req: SpawnRequest) -> str:
        return ""

    def enrich_vehicle_direction(self, lane_id: str, angle: float, x: float, y: float) -> str:
        return "north"

    def get_traffic_light_state(self) -> Optional[TrafficLightState]:
        return None

