"""Unit and headless SUMO integration tests for the Network Builder (Phase 1)."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import traci
import traci.main

from app.config import settings
from app.network_builder.compiler import CompileError, compile_network
from app.network_builder.scenario import UserNetworkScenario
from app.network_builder.schema import NetworkProject, validate_network
from app.network_builder.store import EXAMPLES_DIR, NetworkStore
from app.scenarios.registry import registry

DEMO_JSON = EXAMPLES_DIR / "demo_corridor" / "network.json"


def _minimal_valid_dict() -> dict:
    return {
        "schema_version": 1,
        "id": "simple_test",
        "name": "Simple Test",
        "junctions": [
            {"id": "A", "x": -100, "y": 0, "type": "priority", "label": "West"},
            {"id": "B", "x": 100, "y": 0, "type": "priority", "label": "East"},
        ],
        "roads": [
            {"id": "A_B", "from": "A", "to": "B", "lanes": 2, "lanes_back": 2, "speed_kmh": 50},
        ],
        "demand": {
            "vehicle_mix": {"car": 0.8, "van": 0.2},
            "flows": [
                {"id": "A_to_B", "from": "A", "to": "B", "vehs_per_hour": 300},
            ],
        },
    }


class TestNetworkSchemaValidation(unittest.TestCase):
    def test_minimal_valid_network(self):
        project = NetworkProject.model_validate(_minimal_valid_dict())
        issues = validate_network(project)
        self.assertEqual(issues, [])

    def test_unknown_junction_in_road(self):
        data = _minimal_valid_dict()
        data["roads"][0]["to"] = "MISSING"
        issues = validate_network(NetworkProject.model_validate(data))
        codes = {i.code for i in issues}
        self.assertIn("unknown_junction", codes)

    def test_duplicate_junction_id(self):
        data = _minimal_valid_dict()
        data["junctions"].append({"id": "A", "x": 0, "y": 50, "type": "priority"})
        issues = validate_network(NetworkProject.model_validate(data))
        self.assertTrue(any(i.code == "duplicate_id" for i in issues))

    def test_signal_on_non_traffic_light_junction(self):
        data = _minimal_valid_dict()
        data["signals"] = [
            {"junction": "A", "phases": [{"approaches": ["A_B"], "green_s": 20}]}
        ]
        issues = validate_network(NetworkProject.model_validate(data))
        self.assertTrue(any(i.code == "signal_on_non_tl" for i in issues))

    def test_invalid_vehicle_mix_sum(self):
        data = _minimal_valid_dict()
        data["demand"]["vehicle_mix"] = {"car": 0.5, "van": 0.2}
        issues = validate_network(NetworkProject.model_validate(data))
        self.assertTrue(any(i.code == "invalid_mix_sum" for i in issues))

    def test_obstacle_out_of_bounds(self):
        data = _minimal_valid_dict()
        data["obstacles"] = [
            {
                "id": "obs1",
                "kind": "blockage",
                "road": "A_B",
                "direction": "forward",
                "lane": 0,
                "position_m": 195,
                "length_m": 10,
            }
        ]
        issues = validate_network(NetworkProject.model_validate(data))
        self.assertTrue(any(i.code == "obstacle_out_of_bounds" for i in issues))

    def test_unreachable_flow_detected_after_netconvert(self):
        data = {
            "schema_version": 1,
            "id": "oneway_test",
            "name": "One-way Disconnected",
            "junctions": [
                {"id": "A", "x": -100, "y": 0, "type": "priority"},
                {"id": "M", "x": 0, "y": 0, "type": "priority"},
                {"id": "B", "x": 100, "y": 0, "type": "priority"},
            ],
            "roads": [
                {"id": "A_M", "from": "A", "to": "M", "lanes": 1, "lanes_back": 0},
                # M_B goes from B -> M (opposite direction), so A cannot reach B
                {"id": "B_M", "from": "B", "to": "M", "lanes": 1, "lanes_back": 1},
            ],
            "demand": {
                "vehicle_mix": {"car": 1.0},
                "flows": [
                    {"id": "A_to_B", "from": "A", "to": "B", "vehs_per_hour": 100},
                ],
            },
        }
        project = NetworkProject.model_validate(data)
        with tempfile.TemporaryDirectory() as tmp:
            # Make M->B unreachable by setting B_M to one-way B->M and A->M one-way A->M,
            # while B has lanes_back=1? Wait: if lanes_back=1 then M->B IS reachable!
            # Instead, disconnect via two separate components:
            data["junctions"].append({"id": "C", "x": 200, "y": 0, "type": "priority"})
            data["roads"] = [
                {"id": "A_M", "from": "A", "to": "M", "lanes": 1, "lanes_back": 1},
                {"id": "B_C", "from": "B", "to": "C", "lanes": 1, "lanes_back": 1},
            ]
            project = NetworkProject.model_validate(data)
            with self.assertRaises(CompileError) as ctx:
                compile_network(project, Path(tmp))
            self.assertTrue(any(i.code == "unreachable_flow" for i in ctx.exception.issues))


class TestCompilerAndStore(unittest.TestCase):
    def test_compile_demo_corridor_and_cache(self):
        raw = json.loads(DEMO_JSON.read_text(encoding="utf-8"))
        project = NetworkProject.model_validate(raw)
        with tempfile.TemporaryDirectory() as tmp:
            bdir = Path(tmp)
            res1 = compile_network(project, bdir)
            self.assertFalse(res1.from_cache)
            self.assertTrue(res1.net_file.is_file())
            self.assertTrue(res1.route_file.is_file())
            self.assertTrue(res1.sumocfg_file.is_file())
            self.assertIsNotNone(res1.tll_file)
            self.assertTrue(res1.tll_file.is_file())
            self.assertEqual(len(res1.flow_routes), 6)

            # Second compile with identical content hits cache
            res2 = compile_network(project, bdir)
            self.assertTrue(res2.from_cache)
            self.assertEqual(res1.content_hash, res2.content_hash)

    def test_store_crud_and_registry_discovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = NetworkStore(user_dir=Path(tmp))
            records = store.list_records()
            self.assertTrue(any(r.id == "demo_corridor" and r.read_only for r in records))

            saved = store.save_and_compile("unit_test_road", _minimal_valid_dict())
            self.assertEqual(saved.project.id, "unit_test_road")
            self.assertEqual(saved.scenario.id, "net_unit_test_road")
            self.assertIsNotNone(store.get_project("unit_test_road"))

            val_ok = store.validate_payload(_minimal_valid_dict(), run_netconvert=True)
            self.assertTrue(val_ok["valid"])

            self.assertTrue(store.delete_network("unit_test_road"))
            self.assertIsNone(store.get_project("unit_test_road"))

        # Registry includes demo_corridor under "My Networks"
        self.assertTrue(registry.contains("net_demo_corridor"))
        groups = registry.list_groups()
        my_nets = next((g for g in groups if g.id == "my_networks"), None)
        self.assertIsNotNone(my_nets)
        self.assertTrue(any(s.id == "net_demo_corridor" for s in my_nets.scenarios))


class TestHeadlessSumoSmoke(unittest.TestCase):
    def test_demo_corridor_runs_in_sumo(self):
        with tempfile.TemporaryDirectory() as tmp:
            scenario = UserNetworkScenario(DEMO_JSON, build_dir=Path(tmp) / "build")
            scenario.reload_settings()
            net_info = scenario.get_network_info()

            self.assertIsNotNone(net_info.geometry)
            self.assertGreater(len(net_info.geometry.lanes), 10)
            self.assertGreater(len(net_info.geometry.signal_heads), 0)

            cmd = [
                settings.SUMO_BINARY,
                "-c",
                scenario.sumocfg_file,
                "--step-length",
                str(settings.STEP_LENGTH),
                "--start",
                "--quit-on-end",
                "--no-step-log",
                "true",
                "--no-warnings",
                "true",
            ]
            traci.start(cmd, stdout=subprocess.DEVNULL)
            try:
                scenario.reset_state()
                for _ in range(150):  # 15s at 10Hz
                    traci.simulationStep()
                    scenario.on_step()

                veh_ids = traci.vehicle.getIDList()
                self.assertGreater(len(veh_ids), 0, "Expected vehicles to spawn in demo_corridor")
                self.assertIn("obs_breakdown_west", veh_ids, "Expected blockage obstacle vehicle on lane")

                tl_data = scenario.get_traffic_light_data()
                self.assertIsNotNone(tl_data)
                self.assertTrue(tl_data.signal_groups and len(tl_data.signal_groups) >= 6)

                jm = scenario.get_junction_metrics()
                self.assertIsNotNone(jm)
                self.assertEqual(len(jm.od), 6)
            finally:
                try:
                    traci.close(wait=False)
                except Exception:
                    pass
                if hasattr(traci.main, "_connections"):
                    traci.main._connections.pop("default", None)
                    traci.main._connections.pop("", None)


if __name__ == "__main__":
    unittest.main()
