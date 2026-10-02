import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from .config import settings, bandwidth_limiter
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


class BandwidthMiddleware(BaseHTTPMiddleware):
    """ASGI middleware that tracks outbound REST response bytes against the
    shared bandwidth limiter. Returns HTTP 429 when the budget is exhausted.

    WebSocket upgrades and the /api/bandwidth monitoring endpoint are exempt.
    """

    EXEMPT_PATHS = {"/api/bandwidth", "/api/health"}

    async def dispatch(self, request: Request, call_next):
        # Don't rate-limit WebSocket upgrade requests or monitoring endpoints
        if request.url.path in self.EXEMPT_PATHS:
            return await call_next(request)

        # Pre-check: if already throttled, reject early with 429
        if not bandwidth_limiter.is_allowed(0):
            return JSONResponse(
                status_code=429,
                content={
                    "error": "bandwidth_limit_exceeded",
                    "message": "Server bandwidth budget exhausted. Try again later.",
                    "usage": bandwidth_limiter.get_usage(),
                },
            )

        response = await call_next(request)

        # Track response body bytes by wrapping the body iterator
        original_body = b""
        async for chunk in response.body_iterator:
            if isinstance(chunk, str):
                chunk = chunk.encode("utf-8")
            original_body += chunk

        # Record the bytes transferred
        bandwidth_limiter.record(len(original_body))

        return Response(
            content=original_body,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type,
        )


app.add_middleware(BandwidthMiddleware)

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "sumo_initialized": sim_manager.is_initialized,
        "is_running": sim_manager.is_running,
        "sim_time": sim_manager.sim_time,
        "active_clients": len(sim_manager.active_websockets),
        "bandwidth": bandwidth_limiter.get_usage()
    }

@app.get("/api/bandwidth")
async def get_bandwidth_usage():
    """Monitor current bandwidth usage and budget."""
    return bandwidth_limiter.get_usage()

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

@app.get("/api/scenarios")
async def list_scenarios():
    from .scenarios.registry import registry
    return registry.list_all()

@app.get("/api/scenario/current")
async def get_current_scenario():
    return sim_manager.scenario.get_metadata()

@app.post("/api/scenario/select")
async def select_scenario(req: dict):
    scenario_id = req.get("scenario_id")
    if not scenario_id:
        raise HTTPException(status_code=400, detail="scenario_id is required")
    try:
        await sim_manager.select_scenario(scenario_id)
        return {"status": "ok", "scenario": sim_manager.scenario.get_metadata().model_dump()}
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

@app.post("/api/default-speed")
async def set_default_speed(payload: dict):
    speed_kmh = float(payload.get("speed_kmh", 50.0))
    await sim_manager.set_default_speed(speed_kmh)
    return {"status": "ok", "default_speed_kmh": sim_manager.default_speed_kmh}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await sim_manager.register_websocket(websocket)

    async def _ws_send(data: dict) -> None:
        """Send a JSON message over the WebSocket and record bytes transferred."""
        payload = json.dumps(data)
        bandwidth_limiter.record(len(payload.encode("utf-8")))
        await websocket.send_text(payload)

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
                elif action == "select_scenario":
                    scenario_id = payload.get("scenario_id")
                    if scenario_id:
                        await sim_manager.select_scenario(scenario_id)
                elif action == "set_default_speed":
                    speed_kmh = float(payload.get("speed_kmh", 50.0))
                    await sim_manager.set_default_speed(speed_kmh)
                    await _ws_send({
                        "type": "default_speed_ack",
                        "default_speed_kmh": sim_manager.default_speed_kmh
                    })
                elif action == "spawn":
                    spawn_req = SpawnRequest(**payload)
                    veh_id = await sim_manager.spawn_vehicle(spawn_req)
                    await _ws_send({
                        "type": "spawn_ack",
                        "vehicle_id": veh_id
                    })
                elif action == "set_auto_spawn":
                    auto_cfg = AutoSpawnConfig(**payload)
                    sim_manager.set_auto_spawn(auto_cfg)
                    await _ws_send({
                        "type": "auto_spawn_ack",
                        "auto_spawn": auto_cfg.model_dump()
                    })
                elif action == "set_traffic_light":
                    tl_cfg = TrafficLightConfig(**payload)
                    await sim_manager.set_traffic_light(tl_cfg)
                    await _ws_send({
                        "type": "traffic_light_ack",
                        "traffic_light": sim_manager._get_traffic_light_data().model_dump()
                    })
                elif action == "next_traffic_light_phase":
                    await sim_manager.next_traffic_light_phase()
                    await _ws_send({
                        "type": "traffic_light_ack",
                        "traffic_light": sim_manager._get_traffic_light_data().model_dump()
                    })
            except json.JSONDecodeError:
                logger.warning("Invalid JSON received over WebSocket: %s", text)
            except Exception as e:
                logger.error("Error processing WebSocket message: %s", e)
    except WebSocketDisconnect:
        sim_manager.unregister_websocket(websocket)
    except Exception as e:
        logger.warning("WebSocket error: %s", e)
        sim_manager.unregister_websocket(websocket)

