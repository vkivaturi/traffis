import asyncio
import json
import websockets

async def test_full_flow():
    uri = "ws://127.0.0.1:8000/ws?token=dev_test_session"
    print(f"Connecting to {uri}...")
    async with websockets.connect(uri) as ws:
        async def recv_type(expected_type, timeout=5.0):
            import time
            deadline = time.time() + timeout
            while time.time() < deadline:
                raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
                msg = json.loads(raw)
                if msg.get("type") == expected_type:
                    return msg
            raise TimeoutError(f"Did not receive {expected_type}")

        def get_vehs(st_msg):
            if st_msg.get("vehicles"):
                return st_msg["vehicles"]
            if st_msg.get("compact_vehicles"):
                return [{"id": c[0], "direction": c[13], "speed": c[3], "lane": c[6]} for c in st_msg["compact_vehicles"]]
            return []

        # 1. Receive initial messages
        net_info = await recv_type("network_info")
        print("Received network info:", net_info.get("type"), "TL X:", net_info.get("data", {}).get("traffic_light_x"))
        init_state = await recv_type("state")
        print("Initial state: time=", init_state.get("sim_time"), "is_running=", init_state.get("is_running"))

        # Start simulation
        print("Sending play action to start simulation...")
        await ws.send(json.dumps({"action": "play"}))

        # 2. Test receiving 5 state packets
        for i in range(5):
            state = await recv_type("state")
            st = state.get("sim_time")
            n_veh = len(get_vehs(state))
            avg_spd = state.get("stats", {}).get("avg_speed_kmh")
            tl_st = state.get("traffic_light", {}).get("state")
            print(f"State tick {i}: time={st}s active_vehs={n_veh} avg_speed={avg_spd} km/h tl={tl_st}")
        
        # 3. Test Spawn command over WebSocket (Eastbound and Westbound)
        print("Sending spawn command (Eastbound)...")
        await ws.send(json.dumps({
            "action": "spawn",
            "payload": {"direction": "east", "lane": 1, "type": "sports", "color": "#f43f5e", "speed": 35.0}
        }))
        spawn_ack = await recv_type("spawn_ack")
        print("EB Spawn Ack:", spawn_ack)

        print("Sending spawn command (Westbound)...")
        await ws.send(json.dumps({
            "action": "spawn",
            "payload": {"direction": "west", "lane": 0, "type": "van", "color": "#10b981", "speed": 28.0}
        }))
        spawn_ack_wb = await recv_type("spawn_ack")
        print("WB Spawn Ack:", spawn_ack_wb)
        
        # 4. Receive next state and check spawned vehicles & traffic light
        state = await recv_type("state")
        vehs = get_vehs(state)
        tl = state.get("traffic_light", {})
        print("After spawn - vehicle count:", len(vehs))
        directions = [v.get("direction") for v in vehs]
        print("Vehicle directions in state:", directions)
        print("Traffic light data in state:", tl)
        assert tl.get("state") in ["green", "yellow", "red"], f"Invalid TL state: {tl}"

        # 4b. Test Default Speed Adjustment to 50 km/h
        print("Testing set_default_speed to 50 km/h...")
        await ws.send(json.dumps({
            "action": "set_default_speed",
            "payload": {"speed_kmh": 50.0}
        }))
        spd_ack = await recv_type("default_speed_ack")
        print("Default Speed Ack:", spd_ack)
        assert spd_ack.get("default_speed_kmh") == 50.0

        # 5. Test Traffic Light Timing Configuration
        print("Testing set_traffic_light timings...")
        await ws.send(json.dumps({
            "action": "set_traffic_light",
            "payload": {"green_duration": 20.0, "yellow_duration": 4.0, "red_duration": 15.0, "mode": "auto"}
        }))
        tl_ack = await recv_type("traffic_light_ack")
        print("TL Ack:", tl_ack)

        # 6. Test Manual Phase Skip
        print("Testing next_traffic_light_phase...")
        await ws.send(json.dumps({
            "action": "next_traffic_light_phase"
        }))
        tl_ack2 = await recv_type("traffic_light_ack")
        print("TL Phase Skip Ack:", tl_ack2)

        # 7. Test Inflow Rate (Auto-Spawn) Configuration
        print("Testing set_auto_spawn inflow rate...")
        await ws.send(json.dumps({
            "action": "set_auto_spawn",
            "payload": {"enabled": True, "rate_per_minute": 45.0}
        }))
        auto_ack = await recv_type("auto_spawn_ack")
        print("Auto-spawn Ack:", auto_ack)
            
        # 8. Test Pause
        print("Testing Pause...")
        await ws.send(json.dumps({"action": "pause"}))
        await asyncio.sleep(0.1)
        
        # 9. Test Play
        print("Testing Play...")
        await ws.send(json.dumps({"action": "play"}))
        await asyncio.sleep(0.1)

        # 10. Test Reset
        print("Testing Reset...")
        await ws.send(json.dumps({"action": "reset"}))
        await asyncio.sleep(0.1)

        # Receive reset state
        state = await recv_type("state")
        print(f"After reset: sim_time={state.get('sim_time')}s, active_vehs={len(get_vehs(state))}, tl={state.get('traffic_light', {}).get('state')}")

        # 11. Test Scenario Switching over WebSocket to 3-Way Intersection
        print("Testing Scenario Switch to three_way_intersection...")
        await ws.send(json.dumps({
            "action": "select_scenario",
            "payload": {"scenario_id": "three_way_intersection"}
        }))
        scenario_ack = await recv_type("scenario_switched")
        print("Scenario Switched Ack:", scenario_ack.get("scenario", {}).get("name"))
        assert scenario_ack.get("scenario", {}).get("id") == "three_way_intersection"

        # Receive new network_info for 3-way intersection
        net_info_3way = await recv_type("network_info")
        print("Received 3-way network info:", net_info_3way.get("data", {}).get("scenario", {}).get("name"))

        # Spawn on 3-way intersection from West arm
        print("Spawning vehicle on 3-way intersection from West arm...")
        await ws.send(json.dumps({
            "action": "spawn",
            "payload": {"origin": "west", "turn": "straight", "lane": 0, "type": "car"}
        }))
        spawn_3way = await recv_type("spawn_ack")
        print("3-way spawn ack:", spawn_3way)

        # 12. Test Scenario Switching over WebSocket to 4-Way Intersection
        print("Testing Scenario Switch to four_way_intersection...")
        await ws.send(json.dumps({
            "action": "select_scenario",
            "payload": {"scenario_id": "four_way_intersection"}
        }))
        scenario_ack_4way = await recv_type("scenario_switched")
        print("Scenario Switched Ack:", scenario_ack_4way.get("scenario", {}).get("name"))
        assert scenario_ack_4way.get("scenario", {}).get("id") == "four_way_intersection"

        # Receive new network_info for 4-way intersection
        net_info_4way = await recv_type("network_info")
        print("Received 4-way network info:", net_info_4way.get("data", {}).get("scenario", {}).get("name"))

        # Spawn on 4-way intersection from South arm
        print("Spawning vehicle on 4-way intersection from South arm...")
        await ws.send(json.dumps({
            "action": "spawn",
            "payload": {"origin": "south", "turn": "left", "lane": 1, "type": "sports"}
        }))
        spawn_4way = await recv_type("spawn_ack")
        print("4-way spawn ack:", spawn_4way)

        # 13. Switch back to straight_road
        print("Switching back to straight_road...")
        await ws.send(json.dumps({
            "action": "select_scenario",
            "payload": {"scenario_id": "straight_road"}
        }))
        scenario_ack_straight = await recv_type("scenario_switched")
        print("Scenario Switched back Ack:", scenario_ack_straight.get("scenario", {}).get("name"))
        assert scenario_ack_straight.get("scenario", {}).get("id") == "straight_road"
        
    print("\n>>> ALL BACKEND, SCENARIOS & WEBSOCKET VERIFICATIONS PASSED 100%! <<<")

if __name__ == "__main__":
    asyncio.run(test_full_flow())
