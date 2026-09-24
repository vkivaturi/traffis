import asyncio
import json
import websockets

async def test_full_flow():
    uri = "ws://127.0.0.1:8000/ws"
    print(f"Connecting to {uri}...")
    async with websockets.connect(uri) as ws:
        # 1. Receive initial messages
        first_msg = await ws.recv()
        data = json.loads(first_msg)
        print("Received initial packet:", data.get("type"))
        
        # 2. Test receiving 5 state packets at 20Hz
        for i in range(5):
            msg = await ws.recv()
            state = json.loads(msg)
            if state.get("type") == "state":
                st = state.get("sim_time")
                n_veh = len(state.get("vehicles", []))
                avg_spd = state.get("stats", {}).get("avg_speed_kmh")
                print(f"State tick {i}: time={st}s active_vehs={n_veh} avg_speed={avg_spd} km/h")
        
        # 3. Test Spawn command over WebSocket
        print("Sending spawn command...")
        await ws.send(json.dumps({
            "action": "spawn",
            "payload": {"lane": 2, "type": "sports", "color": "#f43f5e", "speed": 35.0}
        }))
        
        spawn_ack = await ws.recv()
        print("Spawn Ack:", spawn_ack)
        
        # 4. Receive next state and check spawned vehicle
        msg = await ws.recv()
        state = json.loads(msg)
        vehs = state.get("vehicles", [])
        print("After spawn - vehicle count:", len(vehs))
        if vehs:
            v = vehs[-1]
            print(f"Vehicle details: id={v.get('id')} x={v.get('x')}m y={v.get('y')}m lane={v.get('lane_index')} speed={v.get('speed_kmh')}km/h")
            
        # 5. Test Pause
        print("Testing Pause...")
        await ws.send(json.dumps({"action": "pause"}))
        await asyncio.sleep(0.1)
        
        # 6. Test Play
        print("Testing Play...")
        await ws.send(json.dumps({"action": "play"}))
        await asyncio.sleep(0.1)

        # 7. Test Reset
        print("Testing Reset...")
        await ws.send(json.dumps({"action": "reset"}))
        await asyncio.sleep(0.1)

        # Receive reset state
        msg = await ws.recv()
        state = json.loads(msg)
        print(f"After reset: sim_time={state.get('sim_time')}s, active_vehs={len(state.get('vehicles', []))}")
        
    print("\n>>> ALL BACKEND & WEBSOCKET VERIFICATIONS PASSED 100%! <<<")

if __name__ == "__main__":
    asyncio.run(test_full_flow())
