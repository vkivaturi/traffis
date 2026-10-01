from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import traci

from ..schemas import (
    ScenarioMetadata,
    NetworkInfo,
    SpawnRequest,
    TrafficLightState,
    TrafficLightConfig,
)

class BaseScenario(ABC):
    """
    Abstract base class for all road simulation scenarios in Traffis.
    New scenarios (e.g. 4-way crossroads, roundabout, highway interchange)
    can be added cleanly by implementing this interface and registering in registry.py.
    """

    id: str
    name: str
    description: str
    type: str
    bounds: Dict[str, float]
    default_camera: Dict[str, Any]
    sumocfg_file: str

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
    def get_auto_spawn_request(self) -> SpawnRequest:
        """Generate a randomized SpawnRequest suitable for this scenario."""
        pass

    @abstractmethod
    def get_tl_raw_state(self, state: str) -> str:
        """Convert logical state (green/yellow/red) to SUMO character string for the traffic light."""
        pass

    @abstractmethod
    def apply_traffic_light_state(self, state: str) -> None:
        """Apply traffic light state to SUMO via TraCI."""
        pass

    @abstractmethod
    def update_traffic_light(self, dt: float) -> None:
        """Advance traffic light internal timer / phase by dt seconds."""
        pass

    @abstractmethod
    def set_traffic_light_config(self, config: TrafficLightConfig) -> None:
        """Configure phase timings or manual state."""
        pass

    @abstractmethod
    def next_traffic_light_phase(self) -> None:
        """Advance to next traffic light phase immediately."""
        pass

    @abstractmethod
    def get_traffic_light_data(self) -> TrafficLightState:
        """Return current TrafficLightState for streaming to frontend."""
        pass

    @abstractmethod
    def enrich_vehicle_direction(self, lane_id: str, angle: float, x: float, y: float) -> str:
        """Infer cardinal travel direction ('east', 'west', 'north', 'south') for vehicle."""
        pass

    @abstractmethod
    def reset_state(self) -> None:
        """Reset scenario internal state on simulation restart."""
        pass
