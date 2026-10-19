import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from pydantic import BaseModel
from .config import settings, bandwidth_limiter
from .schemas import NetworkInfo
from .simulation import sim_manager
from .auth import get_current_user, verify_ws_token, verify_token

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
        "max_sim_time": sim_manager.max_sim_time,
        "time_limit_reached": sim_manager.time_limit_reached,
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
async def play_simulation(user: dict = Depends(get_current_user)):
    resumed = await sim_manager.play()
    return {
        "status": "ok" if resumed else "limit_reached",
        "action": "play",
        "is_running": sim_manager.is_running,
        "time_limit_reached": sim_manager.time_limit_reached
    }

@app.post("/api/pause")
async def pause_simulation(user: dict = Depends(get_current_user)):
    await sim_manager.pause()
    return {"status": "ok", "action": "pause", "is_running": sim_manager.is_running}

@app.post("/api/reset")
async def reset_simulation(user: dict = Depends(get_current_user)):
    await sim_manager.reset()
    return {"status": "ok", "action": "reset", "sim_time": 0.0, "time_limit_reached": False}

@app.get("/api/scenarios")
async def list_scenarios(grouped: bool = False):
    from .scenarios.registry import registry
    if grouped:
        return registry.list_groups()
    return registry.list_all()

@app.get("/api/scenarios/groups")
@app.get("/api/scenario-groups")
async def list_scenario_groups():
    from .scenarios.registry import registry
    return registry.list_groups()

@app.get("/api/scenario/current")
async def get_current_scenario():
    return sim_manager.scenario.get_metadata()

@app.post("/api/scenario/select")
async def select_scenario(req: dict, user: dict = Depends(get_current_user)):
    scenario_id = req.get("scenario_id")
    if not scenario_id:
        raise HTTPException(status_code=400, detail="scenario_id is required")
    try:
        await sim_manager.select_scenario(scenario_id)
        return {"status": "ok", "scenario": sim_manager.scenario.get_metadata().model_dump()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/scenario/options")
async def update_scenario_options_endpoint(req: dict, user: dict = Depends(get_current_user)):
    options = req.get("options") or req
    try:
        await sim_manager.update_scenario_options(options)
        return {
            "status": "ok",
            "scenario": sim_manager.scenario.get_metadata().model_dump(),
            "network_info": sim_manager.get_network_info().model_dump(),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class CompareRunRequest(BaseModel):
    scenario_id: str
    duration: float = 60.0

@app.post("/api/simulation/compare-run")
async def compare_run_endpoint(
    req: CompareRunRequest,
    current_user: dict = Depends(get_current_user)
):
    """Execute scenario in fast batch mode and return final performance metrics for comparison.
    Enforces Google authentication.
    """
    try:
        result = await sim_manager.run_benchmark(req.scenario_id, req.duration)
        return {"status": "ok", "result": result}
    except Exception as e:
        logger.error("Compare run failed for %s: %s", req.scenario_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    user = verify_ws_token(websocket)
    if not user:
        logger.warning("Rejecting unauthenticated WebSocket handshake from %s", websocket.client)
        # Accept first so the client receives a close code (1008) it can act on, instead of an opaque
        # handshake failure (1006). The frontend uses this to show the sign-in-again prompt.
        await websocket.accept()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized: Google sign-in required")
        return

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
                elif action == "select_scenario":
                    scenario_id = payload.get("scenario_id")
                    if scenario_id:
                        await sim_manager.select_scenario(scenario_id)
                elif action in ("update_scenario_options", "set_scenario_options"):
                    options = payload.get("options") or {}
                    await sim_manager.update_scenario_options(options)
            except json.JSONDecodeError:
                logger.warning("Invalid JSON received over WebSocket: %s", text)
            except Exception as e:
                logger.error("Error processing WebSocket message: %s", e, exc_info=True)
                try:
                    await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
                except Exception:
                    pass
    except WebSocketDisconnect:
        sim_manager.unregister_websocket(websocket)
    except Exception as e:
        logger.warning("WebSocket error: %s", e)
        sim_manager.unregister_websocket(websocket)

