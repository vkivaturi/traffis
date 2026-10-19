import json
import logging
from typing import Dict, List, Optional, Any
from pathlib import Path

from .base import BaseScenario
from .straight_road import StraightRoadScenario
from .three_way_intersection import ThreeWayIntersectionScenario
from .four_way_intersection import FourWayIntersectionScenario
from .gnt_circle import GntCircleScenario
from .nallagandla_junction import NallagandlaJunctionScenario
from ..schemas import ScenarioMetadata, ScenarioGroup
from ..config import SUMO_CONFIG_DIR, SCENARIO_GROUPS_FILE

logger = logging.getLogger(__name__)

class ScenarioRegistry:
    def __init__(self):
        self._scenarios: Dict[str, BaseScenario] = {}
        self.default_id: str = "straight_road"
        self._groups_file: Path = SCENARIO_GROUPS_FILE

    def register(self, scenario: BaseScenario) -> None:
        self._scenarios[scenario.id] = scenario

    def get(self, scenario_id: str) -> Optional[BaseScenario]:
        return self._scenarios.get(scenario_id)

    def get_or_default(self, scenario_id: Optional[str]) -> BaseScenario:
        if scenario_id and scenario_id in self._scenarios:
            return self._scenarios[scenario_id]
        return self._scenarios[self.default_id]

    def _load_groups_config(self) -> List[Dict[str, Any]]:
        if self._groups_file.exists():
            try:
                with open(self._groups_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        return data
            except Exception as e:
                logger.error(f"Failed to load scenario groups config: {e}")
        # Default fallback config if file is missing or invalid
        return [
            {
                "id": "nallagandla_tellapur",
                "name": "Nallagandla Tellapur Junction",
                "description": "Suburban arterial junctions connecting Nallagandla, Tellapur, and Lingampalli Flyover.",
                "scenarios": ["gnt_circle", "nallagandla_junction"],
            },
            {
                "id": "other_scenarios",
                "name": "Other scenarios",
                "description": "General road networks and urban intersections.",
                "scenarios": ["straight_road", "three_way_intersection", "four_way_intersection"],
            },
        ]

    def list_groups(self) -> List[ScenarioGroup]:
        raw_groups = self._load_groups_config()
        assigned_ids = set()
        result_groups: List[ScenarioGroup] = []

        for grp in raw_groups:
            group_id = grp.get("id", "group")
            group_name = grp.get("name", "Group")
            group_desc = grp.get("description")
            scenario_ids = grp.get("scenarios") or grp.get("scenario_ids") or []

            scenarios_in_grp: List[ScenarioMetadata] = []
            for sid in scenario_ids:
                if sid in self._scenarios:
                    meta = self._scenarios[sid].get_metadata()
                    meta.group = group_name
                    meta.group_id = group_id
                    scenarios_in_grp.append(meta)
                    assigned_ids.add(sid)

            result_groups.append(
                ScenarioGroup(
                    id=group_id,
                    name=group_name,
                    description=group_desc,
                    scenarios=scenarios_in_grp,
                )
            )

        # Catch-all for any unassigned scenarios: put into "Other scenarios" group
        unassigned_ids = [sid for sid in self._scenarios if sid not in assigned_ids]
        if unassigned_ids:
            other_grp = next((g for g in result_groups if g.id in ("other_scenarios", "other")), None)
            if not other_grp:
                other_grp = ScenarioGroup(
                    id="other_scenarios",
                    name="Other scenarios",
                    description="General road networks and urban intersections.",
                    scenarios=[],
                )
                result_groups.append(other_grp)

            for sid in unassigned_ids:
                meta = self._scenarios[sid].get_metadata()
                meta.group = other_grp.name
                meta.group_id = other_grp.id
                other_grp.scenarios.append(meta)

        return result_groups

    def list_all(self) -> List[ScenarioMetadata]:
        groups = self.list_groups()
        all_metas: List[ScenarioMetadata] = []
        for g in groups:
            all_metas.extend(g.scenarios)
        return all_metas

    def contains(self, scenario_id: str) -> bool:
        return scenario_id in self._scenarios

registry = ScenarioRegistry()

def init_registry():
    # Resolve sumocfg paths
    straight_cfg = SUMO_CONFIG_DIR / "scenarios" / "straight_road" / "road.sumocfg"
    if not straight_cfg.exists():
        straight_cfg = SUMO_CONFIG_DIR / "road.sumocfg"

    three_way_cfg = SUMO_CONFIG_DIR / "scenarios" / "three_way_intersection" / "intersection.sumocfg"
    four_way_cfg = SUMO_CONFIG_DIR / "scenarios" / "four_way_intersection" / "intersection.sumocfg"
    gnt_circle_cfg = SUMO_CONFIG_DIR / "scenarios" / "gnt_circle" / "gnt_circle.sumocfg"
    nallagandla_cfg = SUMO_CONFIG_DIR / "scenarios" / "nallagandla_junction" / "nallagandla_junction.sumocfg"

    registry.register(StraightRoadScenario(sumocfg_file=str(straight_cfg)))
    registry.register(ThreeWayIntersectionScenario(sumocfg_file=str(three_way_cfg)))
    registry.register(FourWayIntersectionScenario(sumocfg_file=str(four_way_cfg)))
    registry.register(GntCircleScenario(sumocfg_file=str(gnt_circle_cfg)))
    registry.register(NallagandlaJunctionScenario(sumocfg_file=str(nallagandla_cfg)))

init_registry()
