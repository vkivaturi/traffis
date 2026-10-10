import logging
import random
from typing import Dict, Any, List, Optional
import traci

from .base import BaseScenario
from ..schemas import (
    ScenarioMetadata,
    SpawnOriginInfo,
    NetworkInfo,
    RoadArmInfo,
    SpawnRequest,
)

logger = logging.getLogger("scenario_three_way_intersection")

class ThreeWayIntersectionScenario(BaseScenario):
    id = "three_way_intersection"
    name = "3-Way Intersection"
    description = "3-Way T-Intersection with 2 lanes in each direction per arm and multi-phase traffic signal control"
    type = "intersection"
    bounds = {"min_x": -250.0, "max_x": 250.0, "min_y": -10.0, "max_y": 250.0}
    default_camera = {"x": 0.0, "y": 70.0, "zoom": 3.8}

    def __init__(self, sumocfg_file: str):
        self.tl_id = "center"
        self.tl_x = 0.0
        self.tl_y = 0.0
        super().__init__(sumocfg_file)

    def get_metadata(self) -> ScenarioMetadata:
        origins = [
            SpawnOriginInfo(
                id="west",
                label="West Arm (Eastbound →)",
                description="Approaching junction from West (X=-250m) heading East into intersection"
            ),
            SpawnOriginInfo(
                id="east",
                label="East Arm (Westbound ←)",
                description="Approaching junction from East (X=250m) heading West into intersection"
            ),
            SpawnOriginInfo(
                id="north",
                label="North Arm (Southbound ↓)",
                description="Approaching junction from North (Y=250m) heading South into intersection"
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
            # West Arm Lanes
            {"id": "west_in_0", "arm": "west", "index": 0, "direction": "inbound", "name": "West Inbound Lane 0 (Straight / Turn Left to North)", "width": 3.2, "speed_limit_kmh": 60.0},
            {"id": "west_in_1", "arm": "west", "index": 1, "direction": "inbound", "name": "West Inbound Lane 1 (Straight)", "width": 3.2, "speed_limit_kmh": 60.0},
            {"id": "west_out_0", "arm": "west", "index": 0, "direction": "outbound", "name": "West Outbound Lane 0", "width": 3.2, "speed_limit_kmh": 60.0},
            {"id": "west_out_1", "arm": "west", "index": 1, "direction": "outbound", "name": "West Outbound Lane 1", "width": 3.2, "speed_limit_kmh": 60.0},

            # East Arm Lanes
            {"id": "east_in_0", "arm": "east", "index": 0, "direction": "inbound", "name": "East Inbound Lane 0 (Straight)", "width": 3.2, "speed_limit_kmh": 60.0},
            {"id": "east_in_1", "arm": "east", "index": 1, "direction": "inbound", "name": "East Inbound Lane 1 (Straight / Turn Right to North)", "width": 3.2, "speed_limit_kmh": 60.0},
            {"id": "east_out_0", "arm": "east", "index": 0, "direction": "outbound", "name": "East Outbound Lane 0", "width": 3.2, "speed_limit_kmh": 60.0},
            {"id": "east_out_1", "arm": "east", "index": 1, "direction": "outbound", "name": "East Outbound Lane 1", "width": 3.2, "speed_limit_kmh": 60.0},

            # North Arm Lanes
            {"id": "north_in_0", "arm": "north", "index": 0, "direction": "inbound", "name": "North Inbound Lane 0 (Turn Left to East)", "width": 3.2, "speed_limit_kmh": 60.0},
            {"id": "north_in_1", "arm": "north", "index": 1, "direction": "inbound", "name": "North Inbound Lane 1 (Turn Right to West)", "width": 3.2, "speed_limit_kmh": 60.0},
            {"id": "north_out_0", "arm": "north", "index": 0, "direction": "outbound", "name": "North Outbound Lane 0", "width": 3.2, "speed_limit_kmh": 60.0},
            {"id": "north_out_1", "arm": "north", "index": 1, "direction": "outbound", "name": "North Outbound Lane 1", "width": 3.2, "speed_limit_kmh": 60.0},
        ]
        arms = [
            RoadArmInfo(
                id="west_arm",
                name="West Arm",
                direction="west",
                x_start=-250.0,
                y_start=0.0,
                x_end=0.0,
                y_end=0.0,
                num_lanes_inbound=2,
                num_lanes_outbound=2
            ),
            RoadArmInfo(
                id="east_arm",
                name="East Arm",
                direction="east",
                x_start=0.0,
                y_start=0.0,
                x_end=250.0,
                y_end=0.0,
                num_lanes_inbound=2,
                num_lanes_outbound=2
            ),
            RoadArmInfo(
                id="north_arm",
                name="North Arm",
                direction="north",
                x_start=0.0,
                y_start=0.0,
                x_end=0.0,
                y_end=250.0,
                num_lanes_inbound=2,
                num_lanes_outbound=2
            )
        ]
        return NetworkInfo(
            scenario=self.get_metadata(),
            road_length=500.0,
            num_lanes=12,
            num_lanes_per_dir=2,
            lane_width=3.2,
            traffic_light_x=self.tl_x,
            traffic_light_y=self.tl_y,
            lanes=lanes,
            arms=arms
        )

    def get_spawn_route(self, req: SpawnRequest) -> str:
        origin = req.origin or req.direction or "random"
        if origin == "random":
            origin = random.choice(["west", "east", "north"])
        elif origin not in ["west", "east", "north"]:
            # fallback if 'east' was given from old straight road UI
            origin = "west" if origin == "east" else "east"

        turn = req.turn or "random"
        if origin == "west":
            if turn == "straight":
                return "route_west_east"
            elif turn in ["left", "turn_left"]:
                return "route_west_north"
            else:
                return random.choice(["route_west_east", "route_west_north"])

        elif origin == "east":
            if turn == "straight":
                return "route_east_west"
            elif turn in ["right", "turn_right"]:
                return "route_east_north"
            else:
                return random.choice(["route_east_west", "route_east_north"])

        else:  # north
            if turn in ["right", "turn_right"]:
                return "route_north_west"
            elif turn in ["left", "turn_left"]:
                return "route_north_east"
            else:
                return random.choice(["route_north_west", "route_north_east"])

    def enrich_vehicle_direction(self, lane_id: str, angle: float, x: float, y: float) -> str:
        if "west_in" in lane_id:
            return "east"
        elif "west_out" in lane_id:
            return "west"
        elif "east_in" in lane_id:
            return "west"
        elif "east_out" in lane_id:
            return "east"
        elif "north_in" in lane_id:
            return "south"
        elif "north_out" in lane_id:
            return "north"
        else:
            # Inside junction intersection
            if 45 <= angle <= 135:
                return "east"
            elif 135 < angle <= 225:
                return "south"
            elif 225 < angle <= 315:
                return "west"
            else:
                return "north"
