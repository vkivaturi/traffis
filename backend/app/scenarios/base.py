import logging
import random
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, Any, List
import traci

from ..schemas import (
    ScenarioMetadata,
    NetworkInfo,
    SpawnRequest,
    TrafficLightState,
    SignalGroupTiming,
)
from .settings_loader import ScenarioSettings, load_scenario_settings

logger = logging.getLogger("scenario_base")


class BaseScenario(ABC):
    """
    Abstract base class for all road simulation scenarios in Traffis.
    New scenarios (e.g. 4-way crossroads, roundabout, highway interchange)
    can be added cleanly by implementing this interface and registering in registry.py.

    All runtime parameters (inflow rate, cruising speed, vehicle mix, signal
    timings) are read from `scenario.xml` next to the scenario's `.sumocfg`.
    The fixed-time traffic signal controller is implemented generically here.
    """

    id: str
    name: str
    description: str
    type: str
    bounds: Dict[str, float]
    default_camera: Dict[str, Any]
    sumocfg_file: str
    tl_id: str
    tl_x: float = 0.0
    tl_y: float = 0.0

    def __init__(self, sumocfg_file: str):
        self.sumocfg_file = sumocfg_file
        self.settings_file = Path(sumocfg_file).parent / "scenario.xml"
        self.settings: ScenarioSettings = load_scenario_settings(self.settings_file)
        self.current_phase_idx = 0
        self.phase_timer = 0.0

    def reload_settings(self) -> None:
        """Re-read scenario.xml (called on every SUMO (re)start)."""
        self.settings = load_scenario_settings(self.settings_file)

    # ------------------------------------------------------------------ #
    # Scenario-specific geometry & routing
    # ------------------------------------------------------------------ #
    @abstractmethod
    def get_metadata(self) -> ScenarioMetadata:
        """Return scenario metadata including spawn origins, bounds, and camera presets."""
        pass

    @abstractmethod
    def get_network_info(self) -> NetworkInfo:
        """Return detailed network layout, lanes, dimensions, and arm geometry."""
        pass

    @abstractmethod
    def get_spawn_route(self, req: SpawnRequest) -> str:
        """Resolve a SpawnRequest into a valid route ID for SUMO."""
        pass

    @abstractmethod
    def enrich_vehicle_direction(self, lane_id: str, angle: float, x: float, y: float) -> str:
        """Infer cardinal travel direction ('east', 'west', 'north', 'south') for vehicle."""
        pass

    def get_origin_ids(self) -> List[str]:
        return [o.id for o in self.get_metadata().spawn_origins]

    # ------------------------------------------------------------------ #
    # Demand generation (driven by scenario.xml)
    # ------------------------------------------------------------------ #
    def get_auto_spawn_request(self) -> SpawnRequest:
        """Generate a randomized SpawnRequest using XML vehicle mix and origin weights."""
        mix = self.settings.vehicle_mix
        v_type = random.choices(list(mix.keys()), weights=list(mix.values()))[0]
        origins = self.get_origin_ids()
        weights = [self.settings.origin_weights.get(o, 1.0) for o in origins]
        origin = random.choices(origins, weights=weights)[0] if sum(weights) > 0 else random.choice(origins)

        # Resolve destination / turn intention if configured in scenario.xml
        turn = None
        dest_weights = self.settings.destination_weights.get(origin)
        if dest_weights:
            turn = random.choices(list(dest_weights.keys()), weights=list(dest_weights.values()))[0]

        return SpawnRequest(origin=origin, direction=origin, turn=turn, lane=random.randint(0, 1), type=v_type)

    # ------------------------------------------------------------------ #
    # Fixed-time traffic signal controller (driven by scenario.xml)
    # ------------------------------------------------------------------ #
    def apply_traffic_light_state(self) -> None:
        phases = self.settings.phases
        if not phases:
            return
        raw = phases[self.current_phase_idx].raw
        try:
            traci.trafficlight.setRedYellowGreenState(self.tl_id, raw)
        except Exception as e:
            logger.warning("Could not set traffic light phase %d (%s): %s", self.current_phase_idx, raw, e)

    def update_traffic_light(self, dt: float) -> None:
        phases = self.settings.phases
        if not phases:
            return
        self.phase_timer += dt
        if self.phase_timer >= phases[self.current_phase_idx].duration:
            self.phase_timer = 0.0
            self.current_phase_idx = (self.current_phase_idx + 1) % len(phases)
            self.apply_traffic_light_state()

    def get_traffic_light_data(self) -> TrafficLightState:
        phases = self.settings.phases
        if not phases:
            return TrafficLightState(id=getattr(self, "tl_id", ""), x=self.tl_x, y=self.tl_y)

        curr = phases[self.current_phase_idx]
        nxt = phases[(self.current_phase_idx + 1) % len(phases)]
        cycle = sum(p.duration for p in phases)

        groups: List[SignalGroupTiming] = []
        for gid, gname in self.settings.signal_group_names.items():
            green = sum(p.duration for p in phases if p.group == gid and p.state == "green")
            amber = sum(p.duration for p in phases if p.group == gid and p.state == "yellow")
            groups.append(SignalGroupTiming(
                id=gid,
                name=gname,
                green_duration=green,
                amber_duration=amber,
                calculated_red_duration=round(cycle - green - amber, 1),
                is_active_green=(curr.group == gid and curr.state == "green"),
            ))

        first = groups[0] if groups else None
        return TrafficLightState(
            id=self.tl_id,
            x=self.tl_x,
            y=self.tl_y,
            state=curr.state,
            raw_state=curr.raw,
            mode="auto",
            green_duration=first.green_duration if first else curr.duration,
            yellow_duration=first.amber_duration if first else 3.0,
            red_duration=first.calculated_red_duration if first else 0.0,
            phase_timer=round(self.phase_timer, 2),
            phase_remaining=max(0.0, round(curr.duration - self.phase_timer, 1)),
            next_state=nxt.state,
            phase_index=self.current_phase_idx,
            phase_name=curr.name,
            signal_groups=groups,
        )

    def reset_state(self) -> None:
        """Reset scenario internal state on simulation restart."""
        self.current_phase_idx = 0
        self.phase_timer = 0.0
        self.apply_traffic_light_state()
