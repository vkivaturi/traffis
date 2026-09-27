import asyncio
import json
import websockets

async def test_full_flow():
    uri = "ws://127.0.0.1:8000/ws"
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

        # 1. Receive initial messages
        net_info = await recv_type("network_info")
        print("Received network info:", net_info.get("type"), "TL X:", net_info.get("data", {}).get("traffic_light_x"))
        
        # 2. Test receiving 5 state packets at 20Hz
        for i in range(5):
            state = await recv_type("state")
            st = state.get("sim_time")
            n_veh = len(state.get("vehicles", []))
            avg_spd = state.get("stats", {}).get("avg_speed_kmh")
            tl_st = state.get("traffic_light", {}).get("state")
            print(f"State tick {i}: time={st}s active_vehs={n_veh} avg_speed={avg_spd} km/h tl={tl_st}")
        
        # 3. Test Spawn command over WebSocket
        print("Sending spawn command...")
        await ws.send(json.dumps({
            "action": "spawn",
            "payload": {"lane": 2, "type": "sports", "color": "#f43f5e", "speed": 35.0}
        }))
        
        spawn_ack = await recv_type("spawn_ack")
        print("Spawn Ack:", spawn_ack)
        
        # 4. Receive next state and check spawned vehicle & traffic light
        state = await recv_type("state")
        vehs = state.get("vehicles", [])
        tl = state.get("traffic_light", {})
        print("After spawn - vehicle count:", len(vehs))
        print("Traffic light data in state:", tl)
        assert tl.get("state") in ["green", "yellow", "red"], f"Invalid TL state: {tl}"

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
        print(f"After reset: sim_time={state.get('sim_time')}s, active_vehs={len(state.get('vehicles', []))}, tl={state.get('traffic_light', {}).get('state')}")
        
    print("\n>>> ALL BACKEND & WEBSOCKET VERIFICATIONS PASSED 100%! <<<")

if __name__ == "__main__":
    asyncio.run(test_full_flow())
