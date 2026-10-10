import logging
import random
from pathlib import Path
from typing import Dict, Any, List
import traci

from .base import BaseScenario
from ..schemas import (
    ScenarioMetadata,
    SpawnOriginInfo,
    NetworkInfo,
    RoadArmInfo,
    SpawnRequest,
)
from ..config import settings

logger = logging.getLogger("scenario_straight_road")

class StraightRoadScenario(BaseScenario):
    id = "straight_road"
    name = "Straight Road (Highway)"
    description = "1000m Dual Carriageway with 4 lanes (2 Eastbound, 2 Westbound) and Mid-Highway Traffic Signal"
    type = "straight"
    bounds = {"min_x": 0.0, "max_x": 1000.0, "min_y": -6.4, "max_y": 6.4}
    default_camera = {"x": 500.0, "y": 0.0, "zoom": 12.0}

    def __init__(self, sumocfg_file: str):
        self.tl_id = "traffic_light"
        self.tl_x = 500.0
        self.tl_y = 0.0
        super().__init__(sumocfg_file)

    def get_metadata(self) -> ScenarioMetadata:
        origins = [
            SpawnOriginInfo(
                id="east",
                label="Eastbound Approach",
                description="Depart from West terminus (X=0m) heading East (0m → 1000m)"
            ),
            SpawnOriginInfo(
                id="west",
                label="Westbound Approach",
                description="Depart from East terminus (X=1000m) heading West (1000m → 0m)"
            ),
        ]
        return ScenarioMetadata(
            id=self.id,
            name=self.name,
            description=self.description,
            type=self.type,
            bounds=self.bounds,
            default_camera=self.default_camera,
            spawn_origins=origins
        )

    def get_network_info(self) -> NetworkInfo:
        lanes = [
            {"id": "road_east_0", "index": 0, "direction": "east", "name": "Eastbound Left Lane (Slow / Kerb)", "width": 3.2, "y_center": 4.8, "speed_limit_kmh": 120.0},
            {"id": "road_east_1", "index": 1, "direction": "east", "name": "Eastbound Right Lane (Fast / Overtake)", "width": 3.2, "y_center": 1.6, "speed_limit_kmh": 120.0},
            {"id": "road_west_1", "index": 1, "direction": "west", "name": "Westbound Right Lane (Fast / Overtake)", "width": 3.2, "y_center": -1.6, "speed_limit_kmh": 120.0},
            {"id": "road_west_0", "index": 0, "direction": "west", "name": "Westbound Left Lane (Slow / Kerb)", "width": 3.2, "y_center": -4.8, "speed_limit_kmh": 120.0},
        ]
        arms = [
            RoadArmInfo(
                id="highway_main",
                name="Main Highway",
                direction="east_west",
                x_start=0.0,
                y_start=0.0,
                x_end=1000.0,
                y_end=0.0,
                num_lanes_inbound=2,
                num_lanes_outbound=2
            )
        ]
        return NetworkInfo(
            scenario=self.get_metadata(),
            road_length=1000.0,
            num_lanes=4,
            num_lanes_per_dir=2,
            lane_width=3.2,
            traffic_light_x=self.tl_x,
            traffic_light_y=self.tl_y,
            lanes=lanes,
            arms=arms
        )

    def get_spawn_route(self, req: SpawnRequest) -> str:
        # Check origin or direction ('east' or 'west')
        target = req.origin or req.direction or "east"
        if target == "random":
            target = random.choice(["east", "west"])
        elif target not in ["east", "west"]:
            target = "east"
        return "route_west" if target == "west" else "route_east"

    def enrich_vehicle_direction(self, lane_id: str, angle: float, x: float, y: float) -> str:
        return "west" if ("west" in lane_id or angle > 180) else "east"
