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
    TrafficLightState,
    TrafficLightConfig,
)

logger = logging.getLogger("scenario_three_way_intersection")

PHASE_DEFS = [
    {
        "index": 0,
        "name": "East-West Green / North Red",
        "state": "green",
        "raw": "rrrGGGGGg",
        "default_duration": 15.0,
        "active_approaches": ["west", "east"],
    },
    {
        "index": 1,
        "name": "East-West Yellow",
        "state": "yellow",
        "raw": "rrrGyyyyy",
        "default_duration": 3.0,
        "active_approaches": ["west", "east"],
    },
    {
        "index": 2,
        "name": "North Green / East-West Red",
        "state": "green",
        "raw": "GGGGrrrrr",
        "default_duration": 12.0,
        "active_approaches": ["north"],
    },
    {
        "index": 3,
        "name": "North Yellow",
        "state": "yellow",
        "raw": "yyyGrrrrr",
        "default_duration": 3.0,
        "active_approaches": ["north"],
    },
]

class ThreeWayIntersectionScenario(BaseScenario):
    id = "three_way_intersection"
    name = "3-Way Intersection"
    description = "3-Way T-Intersection with 2 lanes in each direction per arm and multi-phase traffic signal control"
    type = "intersection"
    bounds = {"min_x": -250.0, "max_x": 250.0, "min_y": -10.0, "max_y": 250.0}
    default_camera = {"x": 0.0, "y": 70.0, "zoom": 3.8}

    def __init__(self, sumocfg_file: str):
        self.sumocfg_file = sumocfg_file
        self.tl_id = "center"
        self.tl_x = 0.0
        self.tl_y = 0.0
        
        # Traffic light phases
        self.current_phase_idx = 0
        self.phase_timer = 0.0
        self.tl_mode = "auto"
        self.phase_durations = [15.0, 3.0, 12.0, 3.0]  # EW-Green, EW-Yellow, N-Green, N-Yellow

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
            {"id": "west_in_0", "arm": "west", "index": 0, "direction": "inbound", "name": "West Inbound Lane 0 (Straight / Turn Right to North)", "width": 3.2, "speed_limit_kmh": 60.0},
            {"id": "west_in_1", "arm": "west", "index": 1, "direction": "inbound", "name": "West Inbound Lane 1 (Straight / Turn Left to North)", "width": 3.2, "speed_limit_kmh": 60.0},
            {"id": "west_out_0", "arm": "west", "index": 0, "direction": "outbound", "name": "West Outbound Lane 0", "width": 3.2, "speed_limit_kmh": 60.0},
            {"id": "west_out_1", "arm": "west", "index": 1, "direction": "outbound", "name": "West Outbound Lane 1", "width": 3.2, "speed_limit_kmh": 60.0},

            # East Arm Lanes
            {"id": "east_in_0", "arm": "east", "index": 0, "direction": "inbound", "name": "East Inbound Lane 0 (Straight / Turn Right to North)", "width": 3.2, "speed_limit_kmh": 60.0},
            {"id": "east_in_1", "arm": "east", "index": 1, "direction": "inbound", "name": "East Inbound Lane 1 (Straight)", "width": 3.2, "speed_limit_kmh": 60.0},
            {"id": "east_out_0", "arm": "east", "index": 0, "direction": "outbound", "name": "East Outbound Lane 0", "width": 3.2, "speed_limit_kmh": 60.0},
            {"id": "east_out_1", "arm": "east", "index": 1, "direction": "outbound", "name": "East Outbound Lane 1", "width": 3.2, "speed_limit_kmh": 60.0},

            # North Arm Lanes
            {"id": "north_in_0", "arm": "north", "index": 0, "direction": "inbound", "name": "North Inbound Lane 0 (Turn Right to West)", "width": 3.2, "speed_limit_kmh": 60.0},
            {"id": "north_in_1", "arm": "north", "index": 1, "direction": "inbound", "name": "North Inbound Lane 1 (Turn Left to East)", "width": 3.2, "speed_limit_kmh": 60.0},
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

    def get_auto_spawn_request(self) -> SpawnRequest:
        v_type = random.choices(["car", "sports", "van", "truck"], weights=[0.6, 0.15, 0.15, 0.1])[0]
        origin = random.choice(["west", "east", "north"])
        return SpawnRequest(
            origin=origin,
            direction=origin,
            lane=random.randint(0, 1),
            type=v_type
        )

    def get_tl_raw_state(self, state: str) -> str:
        phase = PHASE_DEFS[self.current_phase_idx]
        return phase["raw"]

    def apply_traffic_light_state(self, state: str) -> None:
        try:
            raw = PHASE_DEFS[self.current_phase_idx]["raw"]
            traci.trafficlight.setRedYellowGreenState(self.tl_id, raw)
        except Exception as e:
            logger.warning("Could not set traffic light phase %d: %s", self.current_phase_idx, e)

    def update_traffic_light(self, dt: float) -> None:
        if self.tl_mode != "auto":
            return

        self.phase_timer += dt
        curr_dur = self.phase_durations[self.current_phase_idx]
        if self.phase_timer >= curr_dur:
            self.phase_timer = 0.0
            self.current_phase_idx = (self.current_phase_idx + 1) % len(PHASE_DEFS)
            self.apply_traffic_light_state("")

    def set_traffic_light_config(self, config: TrafficLightConfig) -> None:
        if config.green_duration is not None:
            self.phase_durations[0] = config.green_duration
            self.phase_durations[2] = max(5.0, config.green_duration * 0.8)
        if config.yellow_duration is not None:
            self.phase_durations[1] = config.yellow_duration
            self.phase_durations[3] = config.yellow_duration
        if config.mode is not None:
            self.tl_mode = config.mode
        if config.state is not None:
            if config.state == "green":
                self.current_phase_idx = 0
            elif config.state == "yellow":
                self.current_phase_idx = 1
            elif config.state == "red":
                self.current_phase_idx = 2
            self.phase_timer = 0.0
            self.apply_traffic_light_state("")

    def next_traffic_light_phase(self) -> None:
        self.current_phase_idx = (self.current_phase_idx + 1) % len(PHASE_DEFS)
        self.phase_timer = 0.0
        self.apply_traffic_light_state("")

    def get_traffic_light_data(self) -> TrafficLightState:
        curr = PHASE_DEFS[self.current_phase_idx]
        dur = self.phase_durations[self.current_phase_idx]
        rem = max(0.0, round(dur - self.phase_timer, 1))
        next_idx = (self.current_phase_idx + 1) % len(PHASE_DEFS)
        next_phase = PHASE_DEFS[next_idx]

        return TrafficLightState(
            id=self.tl_id,
            x=self.tl_x,
            y=self.tl_y,
            state=curr["state"],
            raw_state=curr["raw"],
            mode=self.tl_mode,
            green_duration=self.phase_durations[0],
            yellow_duration=self.phase_durations[1],
            red_duration=self.phase_durations[2],
            phase_timer=round(self.phase_timer, 2),
            phase_remaining=rem,
            next_state=next_phase["state"],
            phase_index=self.current_phase_idx,
            phase_name=curr["name"]
        )

    def enrich_vehicle_direction(self, lane_id: str, angle: float, x: float, y: float) -> str:
        if "west" in lane_id:
            return "west" if angle > 180 else "east"
        elif "east" in lane_id:
            return "west" if angle > 180 else "east"
        elif "north" in lane_id:
            return "south" if (135 <= angle <= 225) else "north"
        else:
            # In junction
            if 45 <= angle <= 135:
                return "east"
            elif 135 < angle <= 225:
                return "south"
            elif 225 < angle <= 315:
                return "west"
            else:
                return "north"

    def reset_state(self) -> None:
        self.current_phase_idx = 0
        self.phase_timer = 0.0
        self.apply_traffic_light_state("")
