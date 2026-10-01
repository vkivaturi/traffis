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
    TrafficLightState,
    TrafficLightConfig,
)
from ..config import settings

logger = logging.getLogger("scenario_straight_road")

class StraightRoadScenario(BaseScenario):
    id = "straight_road"
    name = "Straight Road (Highway)"
    description = "1000m Dual Carriageway with 4 lanes (2 Eastbound, 2 Westbound) and Mid-Highway Traffic Signal"
    type = "straight"
    bounds = {"min_x": 0.0, "max_x": 1000.0, "min_y": -6.4, "max_y": 6.4}
    default_camera = {"x": 100.0, "y": 0.0, "zoom": 12.0}

    def __init__(self, sumocfg_file: str):
        self.sumocfg_file = sumocfg_file
        self.tl_id = "traffic_light"
        self.tl_x = 500.0
        self.tl_y = 0.0
        self.tl_state = "green"  # "green" | "yellow" | "red"
        self.tl_mode = "auto"
        self.tl_green_duration = settings.DEFAULT_GREEN_DURATION
        self.tl_yellow_duration = settings.DEFAULT_YELLOW_DURATION
        self.tl_red_duration = settings.DEFAULT_RED_DURATION
        self.tl_phase_timer = 0.0

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
            {"id": "road_west_0", "index": 0, "direction": "west", "name": "Westbound Right Lane (Slow)", "width": 3.2, "y_center": 4.8, "speed_limit_kmh": 120.0},
            {"id": "road_west_1", "index": 1, "direction": "west", "name": "Westbound Left Lane (Fast / Overtake)", "width": 3.2, "y_center": 1.6, "speed_limit_kmh": 120.0},
            {"id": "road_east_1", "index": 1, "direction": "east", "name": "Eastbound Left Lane (Fast / Overtake)", "width": 3.2, "y_center": -1.6, "speed_limit_kmh": 120.0},
            {"id": "road_east_0", "index": 0, "direction": "east", "name": "Eastbound Right Lane (Slow)", "width": 3.2, "y_center": -4.8, "speed_limit_kmh": 120.0},
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

    def get_auto_spawn_request(self) -> SpawnRequest:
        v_type = random.choices(["car", "sports", "van", "truck"], weights=[0.6, 0.15, 0.15, 0.1])[0]
        v_dir = random.choice(["east", "west"])
        return SpawnRequest(
            direction=v_dir,
            origin=v_dir,
            lane=random.randint(0, 1),
            type=v_type
        )

    def get_tl_raw_state(self, state: str) -> str:
        char = "r" if state == "red" else "y" if state == "yellow" else "G"
        try:
            controlled = traci.trafficlight.getControlledLinks(self.tl_id)
            num_links = len(controlled) if controlled else 4
            return char * num_links
        except Exception:
            return char * 4

    def apply_traffic_light_state(self, state: str) -> None:
        self.tl_state = state
        raw = self.get_tl_raw_state(state)
        try:
            traci.trafficlight.setRedYellowGreenState(self.tl_id, raw)
        except Exception as e:
            logger.warning("Could not set traffic light state '%s' (%s): %s", state, raw, e)

    def update_traffic_light(self, dt: float) -> None:
        if self.tl_mode != "auto":
            return

        self.tl_phase_timer += dt
        if self.tl_state == "green":
            if self.tl_phase_timer >= self.tl_green_duration:
                self.tl_phase_timer = 0.0
                self.apply_traffic_light_state("yellow")
        elif self.tl_state == "yellow":
            if self.tl_phase_timer >= self.tl_yellow_duration:
                self.tl_phase_timer = 0.0
                self.apply_traffic_light_state("red")
        elif self.tl_state == "red":
            if self.tl_phase_timer >= self.tl_red_duration:
                self.tl_phase_timer = 0.0
                self.apply_traffic_light_state("green")

    def set_traffic_light_config(self, config: TrafficLightConfig) -> None:
        if config.green_duration is not None:
            self.tl_green_duration = config.green_duration
        if config.yellow_duration is not None:
            self.tl_yellow_duration = config.yellow_duration
        if config.red_duration is not None:
            self.tl_red_duration = config.red_duration
        if config.mode is not None:
            self.tl_mode = config.mode
        if config.state is not None:
            self.tl_phase_timer = 0.0
            self.apply_traffic_light_state(config.state)

    def next_traffic_light_phase(self) -> None:
        if self.tl_state == "green":
            next_st = "yellow"
        elif self.tl_state == "yellow":
            next_st = "red"
        else:
            next_st = "green"
        self.tl_phase_timer = 0.0
        self.apply_traffic_light_state(next_st)

    def get_traffic_light_data(self) -> TrafficLightState:
        if self.tl_state == "green":
            dur = self.tl_green_duration
            next_st = "yellow"
        elif self.tl_state == "yellow":
            dur = self.tl_yellow_duration
            next_st = "red"
        else:
            dur = self.tl_red_duration
            next_st = "green"

        rem = max(0.0, round(dur - self.tl_phase_timer, 1))
        return TrafficLightState(
            id=self.tl_id,
            x=self.tl_x,
            y=self.tl_y,
            state=self.tl_state,
            raw_state=self.get_tl_raw_state(self.tl_state),
            mode=self.tl_mode,
            green_duration=self.tl_green_duration,
            yellow_duration=self.tl_yellow_duration,
            red_duration=self.tl_red_duration,
            phase_timer=round(self.tl_phase_timer, 2),
            phase_remaining=rem,
            next_state=next_st,
            phase_index=0 if self.tl_state == "green" else 1 if self.tl_state == "yellow" else 2,
            phase_name=f"Highway {self.tl_state.capitalize()}"
        )

    def enrich_vehicle_direction(self, lane_id: str, angle: float, x: float, y: float) -> str:
        return "west" if ("west" in lane_id or angle > 180) else "east"

    def reset_state(self) -> None:
        self.tl_state = "green"
        self.tl_phase_timer = 0.0
        self.apply_traffic_light_state("green")
