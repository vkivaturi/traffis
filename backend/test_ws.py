import asyncio
import json
import time
import websockets

SCENARIOS = ["straight_road", "three_way_intersection", "four_way_intersection"]


async def test_full_flow():
    uri = "ws://127.0.0.1:8000/ws?token=dev_test_session"
    print(f"Connecting to {uri}...")
    async with websockets.connect(uri) as ws:
        async def recv_type(expected_type, timeout=5.0):
            deadline = time.time() + timeout
            while time.time() < deadline:
                raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
                msg = json.loads(raw)
                if msg.get("type") == expected_type:
                    return msg
            raise TimeoutError(f"Did not receive {expected_type}")

        def n_vehs(st):
            return len(st.get("compact_vehicles") or st.get("vehicles") or [])

        await recv_type("network_info")
        await recv_type("state")

        for scenario_id in SCENARIOS:
            print(f"\n=== Scenario: {scenario_id} ===")
            await ws.send(json.dumps({"action": "select_scenario", "payload": {"scenario_id": scenario_id}}))
            sw = await recv_type("scenario_switched")
            assert sw["scenario"]["id"] == scenario_id

            # START: vehicles must appear automatically from scenario.xml inflow
            await ws.send(json.dumps({"action": "play"}))
            state = None
            deadline = time.time() + 8.0
            while time.time() < deadline:
                state = await recv_type("state")
                if n_vehs(state) > 0 and state["sim_time"] > 3:
                    break
            tl = state["traffic_light"]
            print(f"Running: t={state['sim_time']}s vehs={n_vehs(state)} "
                  f"default_speed={state.get('default_speed_kmh')} max_t={state.get('max_sim_time')} "
                  f"tl={tl['state']} ({tl.get('phase_name')}) groups={[g['id'] + ':' + str(g['green_duration']) for g in tl.get('signal_groups') or []]}")
            assert n_vehs(state) > 0, "No vehicles spawned from scenario.xml inflow"

            # PAUSE: clock must freeze
            await ws.send(json.dumps({"action": "pause"}))
            await asyncio.sleep(0.5)
            print("Paused.")

            # STOP: reset to t=0
            await ws.send(json.dumps({"action": "reset"}))
            state = await recv_type("state")
            print(f"After stop: t={state['sim_time']}s vehs={n_vehs(state)} running={state['is_running']}")
            assert state["sim_time"] == 0.0 and not state["is_running"]

        print("\nAll checks passed.")


if __name__ == "__main__":
    asyncio.run(test_full_flow())
