import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel
from .schemas import NetworkInfo
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
        "active_clients": len(sim_manager.active_websockets),
    }

@app.get("/api/network-info", response_model=NetworkInfo)
async def get_network_info():
    return sim_manager.get_network_info()

@app.post("/api/play")
async def play_simulation():
    await sim_manager.play()
    return {
        "status": "ok",
        "action": "play",
        "is_running": sim_manager.is_running,
    }

@app.post("/api/pause")
async def pause_simulation():
    await sim_manager.pause()
    return {"status": "ok", "action": "pause", "is_running": sim_manager.is_running}

@app.post("/api/reset")
async def reset_simulation():
    await sim_manager.reset()
    return {"status": "ok", "action": "reset", "sim_time": 0.0}

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
async def select_scenario(req: dict):
    scenario_id = req.get("scenario_id")
    if not scenario_id:
        raise HTTPException(status_code=400, detail="scenario_id is required")
    try:
        await sim_manager.select_scenario(scenario_id)
        return {"status": "ok", "scenario": sim_manager.scenario.get_metadata().model_dump()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/scenario/options")
async def update_scenario_options_endpoint(req: dict):
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
async def compare_run_endpoint(req: CompareRunRequest):
    """Execute scenario in fast batch mode and return final performance metrics for comparison."""
    try:
        result = await sim_manager.run_benchmark(req.scenario_id, req.duration)
        return {"status": "ok", "result": result}
    except Exception as e:
        logger.error("Compare run failed for %s: %s", req.scenario_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------------------------------
# Self-Serve Network Builder API (/api/networks)
# -------------------------------------------------------------------------
@app.get("/api/networks")
async def list_networks():
    from .network_builder.store import network_store
    records = network_store.list_records()
    return [
        {
            "id": r.id,
            "scenario_id": r.scenario_id,
            "name": r.name,
            "description": r.description,
            "read_only": r.read_only,
        }
        for r in records
    ]


@app.post("/api/networks/validate")
async def validate_network_endpoint(req: dict, compile: bool = True):
    from .network_builder.store import network_store
    return network_store.validate_payload(req, run_netconvert=compile)


@app.post("/api/networks/preview")
async def preview_network_endpoint(req: dict):
    """Compile a draft network.json into a temporary build dir and return its NetworkGeometry."""
    import tempfile
    from pathlib import Path
    from .network_builder.compiler import CompileError, compile_network
    from .network_builder.schema import NetworkProject, ValidationIssue, validate_network
    from .scenarios.net_geometry import load_net_geometry
    from .schemas import NetworkGeometry

    try:
        project = NetworkProject.model_validate(req)
    except Exception as e:
        return {
            "valid": False,
            "errors": [ValidationIssue(severity="error", code="schema_error", message=str(e)).model_dump()],
            "warnings": [],
            "geometry": None,
        }

    issues = validate_network(project)
    errors = [i for i in issues if i.severity == "error"]
    if errors:
        return {
            "valid": False,
            "errors": [e.model_dump() for e in errors],
            "warnings": [],
            "geometry": None,
        }

    try:
        with tempfile.TemporaryDirectory(prefix="traffis_preview_") as tmp:
            res = compile_network(project, Path(tmp), force=True)
            geo = load_net_geometry(res.net_file)
            net_geo = NetworkGeometry(
                lanes=geo.lanes,
                connectors=geo.connectors,
                junctions=geo.junctions,
                bounds=geo.bounds(margin=20.0),
            )
            return {
                "valid": True,
                "errors": [],
                "warnings": res.warnings,
                "geometry": net_geo.model_dump(),
            }
    except CompileError as ce:
        return {
            "valid": False,
            "errors": [i.model_dump() for i in ce.issues],
            "warnings": [],
            "geometry": None,
        }


@app.get("/api/networks/{network_id}")
async def get_network(network_id: str):
    from .network_builder.store import network_store
    project = network_store.get_project(network_id)
    if project is None:
        raise HTTPException(status_code=404, detail=f"Network '{network_id}' not found")
    return project.model_dump(by_alias=True)


@app.put("/api/networks/{network_id}")
async def save_network(network_id: str, req: dict):
    from .network_builder.compiler import CompileError
    from .network_builder.store import network_store
    from .scenarios.registry import registry

    try:
        saved = network_store.save_and_compile(network_id, req)
        registry.register(saved.scenario, is_user_network=True)
        return {
            "status": "ok",
            "id": saved.project.id,
            "scenario_id": saved.scenario.id,
            "from_cache": saved.compile_result.from_cache,
            "warnings": saved.compile_result.warnings,
            "project": saved.project.model_dump(by_alias=True),
        }
    except CompileError as ce:
        raise HTTPException(
            status_code=422,
            detail={
                "message": str(ce),
                "errors": [i.model_dump() for i in ce.issues],
            },
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/networks/{network_id}")
async def delete_network(network_id: str):
    from .network_builder.store import network_store
    from .scenarios.registry import registry

    scenario_id = f"net_{network_id}"
    if sim_manager.scenario.id == scenario_id:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete the currently active scenario. Switch to another scenario first.",
        )
    deleted = network_store.delete_network(network_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"User network '{network_id}' not found (bundled examples are read-only)")
    registry.unregister(scenario_id)
    network_store.sync_registry(registry)
    return {"status": "ok", "deleted": network_id}

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
                    logger.info("Received 'play' action from client %s", websocket.client)
                    await sim_manager.play()
                elif action == "pause":
                    logger.info("Received 'pause' action from client %s", websocket.client)
                    await sim_manager.pause()
                elif action == "reset":
                    logger.info("Received 'reset' action from client %s", websocket.client)
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


# -------------------------------------------------------------------------
# Static Frontend Serving (Production / Docker build)
# -------------------------------------------------------------------------
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse

CANDIDATE_DIST_PATHS = [
    Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",
    Path("/app/frontend/dist"),
    Path(__file__).resolve().parent.parent / "dist",
]

FRONTEND_DIST = next((p for p in CANDIDATE_DIST_PATHS if p.is_dir()), None)

if FRONTEND_DIST:
    logger.info("Serving built frontend from %s", FRONTEND_DIST)
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    screenshots_dir = FRONTEND_DIST / "screenshots"
    if screenshots_dir.is_dir():
        app.mount("/screenshots", StaticFiles(directory=str(screenshots_dir)), name="screenshots")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        target = FRONTEND_DIST / full_path
        if full_path and target.is_file():
            return FileResponse(target)
        return FileResponse(FRONTEND_DIST / "index.html")


