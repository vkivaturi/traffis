import asyncio
import json
import time
import websockets

SCENARIOS = ["straight_road", "three_way_intersection", "four_way_intersection", "gnt_circle"]
GNT_ARMS = {"NG", "TL", "FL"}


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
            is_gnt = scenario_id == "gnt_circle"
            seen_origins = set()
            jm = None
            deadline = time.time() + (20.0 if is_gnt else 8.0)
            while time.time() < deadline:
                state = await recv_type("state")
                # compact tuple direction field carries the OD key, e.g. "TL_NG"
                seen_origins |= {str(v[13])[:2] for v in state.get("compact_vehicles") or []}
                jm = state.get("junction_metrics") or jm  # sent at 1 Hz
                if n_vehs(state) > 0 and state["sim_time"] > 3 and (not is_gnt or GNT_ARMS <= seen_origins):
                    break
            tl = state.get("traffic_light")
            tl_desc = (f"tl={tl['state']} ({tl.get('phase_name')}) "
                       f"groups={[g['id'] + ':' + str(g['green_duration']) for g in tl.get('signal_groups') or []]}"
                       if tl else "tl=none")
            print(f"Running: t={state['sim_time']}s vehs={n_vehs(state)} "
                  f"default_speed={state.get('default_speed_kmh')} max_t={state.get('max_sim_time')} {tl_desc}")
            assert n_vehs(state) > 0, "No vehicles spawned from scenario.xml inflow"
            if is_gnt:
                assert tl is None, "gnt_circle must not report a traffic light by default"
                assert GNT_ARMS <= seen_origins, f"Vehicles not seen from all arms: {seen_origins}"
                assert jm is not None, "No junction_metrics received"
                print(f"Junction: ring={jm['roundabout_occupancy']} uturns={jm['uturn_count']} "
                      f"inflow={ {a['id']: a['inflow'] for a in jm['arms']} } "
                      f"queues={ {q['id']: q['halting'] for q in jm['entry_queues']} }")

                # Verify optional roundabout signals toggle
                print("Testing GNT roundabout signals toggle...")
                await ws.send(json.dumps({"action": "update_scenario_options", "payload": {"options": {"roundabout_signals": True}}}))
                sw2 = await recv_type("scenario_switched")
                assert sw2["scenario"]["options"][0]["value"] is True
                net2 = await recv_type("network_info")
                assert len(net2["data"]["geometry"].get("signal_heads") or []) == 3
                st_sig = await recv_type("state")
                assert st_sig["traffic_light"] is not None and st_sig["traffic_light"]["id"] == "gnt_rb_W"
                print(f"Roundabout signals verified: active phase={st_sig['traffic_light']['phase_name']}")

                # Restore unsignalised default
                await ws.send(json.dumps({"action": "update_scenario_options", "payload": {"options": {"roundabout_signals": False}}}))
                sw3 = await recv_type("scenario_switched")
                assert sw3["scenario"]["options"][0]["value"] is False
                net3 = await recv_type("network_info")
                assert len(net3["data"]["geometry"].get("signal_heads") or []) == 0
                st_nosig = await recv_type("state")
                assert st_nosig.get("traffic_light") is None
                print("Roundabout signals disabled: restored unsignalised merging.")

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
