from typing import Dict, List, Optional
from pathlib import Path

from .base import BaseScenario
from .straight_road import StraightRoadScenario
from .three_way_intersection import ThreeWayIntersectionScenario
from ..schemas import ScenarioMetadata
from ..config import SUMO_CONFIG_DIR

class ScenarioRegistry:
    def __init__(self):
        self._scenarios: Dict[str, BaseScenario] = {}
        self.default_id: str = "straight_road"

    def register(self, scenario: BaseScenario) -> None:
        self._scenarios[scenario.id] = scenario

    def get(self, scenario_id: str) -> Optional[BaseScenario]:
        return self._scenarios.get(scenario_id)

    def get_or_default(self, scenario_id: Optional[str]) -> BaseScenario:
        if scenario_id and scenario_id in self._scenarios:
            return self._scenarios[scenario_id]
        return self._scenarios[self.default_id]

    def list_all(self) -> List[ScenarioMetadata]:
        return [s.get_metadata() for s in self._scenarios.values()]

    def contains(self, scenario_id: str) -> bool:
        return scenario_id in self._scenarios

registry = ScenarioRegistry()

def init_registry():
    # Resolve sumocfg paths
    straight_cfg = SUMO_CONFIG_DIR / "scenarios" / "straight_road" / "road.sumocfg"
    if not straight_cfg.exists():
        straight_cfg = SUMO_CONFIG_DIR / "road.sumocfg"

    three_way_cfg = SUMO_CONFIG_DIR / "scenarios" / "three_way_intersection" / "intersection.sumocfg"

    registry.register(StraightRoadScenario(sumocfg_file=str(straight_cfg)))
    registry.register(ThreeWayIntersectionScenario(sumocfg_file=str(three_way_cfg)))

init_registry()
