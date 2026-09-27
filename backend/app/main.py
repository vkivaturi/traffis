import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .schemas import SpawnRequest, AutoSpawnConfig, NetworkInfo, TrafficLightConfig
from .simulation import sim_manager

logger = logging.getLogger("traffis_backend")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Launch headless SUMO and simulation background task
    logger.info("Initializing SUMO Traffic Simulation Backend...")
    await sim_manager.start()
    yield
    # Shutdown: Cleanly close TraCI
    logger.info("Shutting down SUMO Traffic Simulation Backend...")
    await sim_manager.stop()

app = FastAPI(
    title="Traffis SUMO Traffic Simulation API",
    version="1.0.0",
    description="Full-stack real-time traffic simulation backend using SUMO and TraCI",
    lifespan=lifespan
)

# CORS middleware for React Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "sumo_initialized": sim_manager.is_initialized,
        "is_running": sim_manager.is_running,
        "sim_time": sim_manager.sim_time,
        "active_clients": len(sim_manager.active_websockets)
    }

@app.get("/api/network-info", response_model=NetworkInfo)
async def get_network_info():
    return sim_manager.get_network_info()

@app.post("/api/play")
async def play_simulation():
    await sim_manager.play()
    return {"status": "ok", "action": "play", "is_running": sim_manager.is_running}

@app.post("/api/pause")
async def pause_simulation():
    await sim_manager.pause()
    return {"status": "ok", "action": "pause", "is_running": sim_manager.is_running}

@app.post("/api/reset")
async def reset_simulation():
    await sim_manager.reset()
    return {"status": "ok", "action": "reset", "sim_time": 0.0}

@app.post("/api/step")
async def step_simulation():
    await sim_manager.step_once()
    return {"status": "ok", "action": "step", "step": sim_manager.step_count}

@app.post("/api/spawn")
async def spawn_vehicle(req: SpawnRequest):
    try:
        veh_id = await sim_manager.spawn_vehicle(req)
        return {"status": "ok", "vehicle_id": veh_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/auto-spawn")
async def configure_auto_spawn(config: AutoSpawnConfig):
    sim_manager.set_auto_spawn(config)
    return {"status": "ok", "auto_spawn": config.model_dump()}

@app.post("/api/traffic-light")
async def configure_traffic_light(config: TrafficLightConfig):
    await sim_manager.set_traffic_light(config)
    return {"status": "ok", "traffic_light": sim_manager._get_traffic_light_data().model_dump()}

@app.post("/api/traffic-light/next")
async def next_traffic_light_phase():
    await sim_manager.next_traffic_light_phase()
    return {"status": "ok", "traffic_light": sim_manager._get_traffic_light_data().model_dump()}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await sim_manager.register_websocket(websocket)
    try:
        while True:
            text = await websocket.receive_text()
            try:
                msg = json.loads(text)
                action = msg.get("action") or msg.get("type")
                payload = msg.get("payload", {})

                if action == "play":
                    await sim_manager.play()
                elif action == "pause":
                    await sim_manager.pause()
                elif action == "reset":
                    await sim_manager.reset()
                elif action == "step":
                    await sim_manager.step_once()
                elif action == "spawn":
                    spawn_req = SpawnRequest(**payload)
                    veh_id = await sim_manager.spawn_vehicle(spawn_req)
                    await websocket.send_text(json.dumps({
                        "type": "spawn_ack",
                        "vehicle_id": veh_id
                    }))
                elif action == "set_auto_spawn":
                    auto_cfg = AutoSpawnConfig(**payload)
                    sim_manager.set_auto_spawn(auto_cfg)
                    await websocket.send_text(json.dumps({
                        "type": "auto_spawn_ack",
                        "auto_spawn": auto_cfg.model_dump()
                    }))
                elif action == "set_traffic_light":
                    tl_cfg = TrafficLightConfig(**payload)
                    await sim_manager.set_traffic_light(tl_cfg)
                    await websocket.send_text(json.dumps({
                        "type": "traffic_light_ack",
                        "traffic_light": sim_manager._get_traffic_light_data().model_dump()
                    }))
                elif action == "next_traffic_light_phase":
                    await sim_manager.next_traffic_light_phase()
                    await websocket.send_text(json.dumps({
                        "type": "traffic_light_ack",
                        "traffic_light": sim_manager._get_traffic_light_data().model_dump()
                    }))
            except json.JSONDecodeError:
                logger.warning("Invalid JSON received over WebSocket: %s", text)
            except Exception as e:
                logger.error("Error processing WebSocket message: %s", e)
    except WebSocketDisconnect:
        sim_manager.unregister_websocket(websocket)
    except Exception as e:
        logger.warning("WebSocket error: %s", e)
        sim_manager.unregister_websocket(websocket)
