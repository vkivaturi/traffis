import asyncio
import json
import logging
import random
import time
from typing import Set, Dict, Any, Optional, List
import traci
from fastapi import WebSocket

from .config import settings
from .schemas import (
    VehicleData,
    SimulationStats,
    SimulationStateMessage,
    SpawnRequest,
    AutoSpawnConfig,
    NetworkInfo,
    TrafficLightState,
    TrafficLightConfig,
)
from .scenarios.registry import registry
from .scenarios.base import BaseScenario

logger = logging.getLogger("sumo_simulation")
logging.basicConfig(level=logging.INFO)

COLOR_PALETTE = [
    "#38bdf8",  # Sky Blue
    "#f43f5e",  # Rose Red
    "#10b981",  # Emerald Green
    "#f59e0b",  # Amber
    "#8b5cf6",  # Violet
    "#ec4899",  # Pink
    "#06b6d4",  # Cyan
    "#e2e8f0",  # Clean White/Silver
    "#64748b",  # Slate Dark
]

def hex_to_rgba(hex_color: str) -> tuple[int, int, int, int]:
    hex_color = hex_color.lstrip("#")
    if len(hex_color) == 6:
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        return (r, g, b, 255)
    return (56, 189, 248, 255)

def rgba_to_hex(rgba: tuple[int, int, int, int]) -> str:
    r, g, b = rgba[0], rgba[1], rgba[2]
    return f"#{r:02x}{g:02x}{b:02x}"

class SimulationManager:
    def __init__(self):
        self.is_initialized = False
        self.is_running = True
        self.step_count = 0
        self.sim_time = 0.0
        self.total_spawned = 0
        self.total_arrived = 0
        self.vehicle_counter = 0
        self.vehicle_colors: Dict[str, str] = {}
        
        # Active scenario (extensible)
        self.scenario: BaseScenario = registry.get_or_default("straight_road")

        # Auto-spawn settings
        self.auto_spawn = AutoSpawnConfig(enabled=True, rate_per_minute=25.0)
        self.last_auto_spawn_time = 0.0

        # Concurrency & WebSockets
        self.lock = asyncio.Lock()
        self.active_websockets: Set[WebSocket] = set()
        self.loop_task: Optional[asyncio.Task] = None
        self.speed_multiplier = 1.0

    async def start(self):
        """Initialize TraCI and background simulation loop."""
        async with self.lock:
            if not self.is_initialized:
                self._start_traci()
                self.is_initialized = True

        if self.loop_task is None or self.loop_task.done():
            self.loop_task = asyncio.create_task(self._simulation_loop())
            logger.info("Simulation loop background task started.")

    def _start_traci(self):
        """Start the headless SUMO process via TraCI using current scenario."""
        cfg_path = self.scenario.sumocfg_file
        cmd = [
            settings.SUMO_BINARY,
            "-c", cfg_path,
            "--step-length", str(settings.STEP_LENGTH),
            "--start",
            "--quit-on-end",
            "--no-step-log", "true",
            "--no-warnings", "true"
        ]
        logger.info("Starting SUMO TraCI for scenario '%s' with command: %s", self.scenario.id, " ".join(cmd))
        traci.start(cmd)
        self.step_count = 0
        self.sim_time = 0.0
        self.total_spawned = 0
        self.total_arrived = 0
        self.vehicle_counter = 0
        self.vehicle_colors.clear()
        self.scenario.reset_state()

    async def select_scenario(self, scenario_id: str) -> None:
        """Switch to a different scenario (e.g. straight road vs 3-way intersection)."""
        target = registry.get(scenario_id)
        if not target:
            raise ValueError(f"Unknown scenario ID: {scenario_id}")

        async with self.lock:
            logger.info("Switching scenario to '%s' (%s)...", target.id, target.name)
            if self.is_initialized:
                try:
                    traci.close()
                except Exception as e:
                    logger.warning("Error closing traci during scenario switch: %s", e)
                self.is_initialized = False

            self.scenario = target
            self._start_traci()
            self.is_initialized = True
            self.is_running = True
            self.last_auto_spawn_time = 0.0

        # Broadcast scenario switch, new network info, and state
        await self._broadcast_scenario_switched()
        await self._broadcast_network_info()
        await self._broadcast_current_state()

    async def set_traffic_light(self, config: TrafficLightConfig):
        async with self.lock:
            self.scenario.set_traffic_light_config(config)
            logger.info("Traffic light updated for scenario '%s'", self.scenario.id)
        await self._broadcast_current_state()

    async def next_traffic_light_phase(self):
        async with self.lock:
            self.scenario.next_traffic_light_phase()
            logger.info("Traffic light manual step next for scenario '%s'", self.scenario.id)
        await self._broadcast_current_state()

    def _get_traffic_light_data(self) -> TrafficLightState:
        return self.scenario.get_traffic_light_data()

    async def stop(self):
        """Stop simulation loop and close TraCI."""
        if self.loop_task:
            self.loop_task.cancel()
            try:
                await self.loop_task
            except asyncio.CancelledError:
                pass
            self.loop_task = None

        async with self.lock:
            if self.is_initialized:
                try:
                    traci.close()
                except Exception as e:
                    logger.warning("Error closing traci: %s", e)
                self.is_initialized = False

    async def reset(self):
        """Reset the current simulation back to t=0."""
        async with self.lock:
            logger.info("Resetting simulation for scenario '%s'...", self.scenario.id)
            try:
                traci.close()
            except Exception as e:
                logger.warning("Error while closing traci on reset: %s", e)
            
            # Restart TraCI with current scenario
            self._start_traci()
            self.is_running = True
            self.last_auto_spawn_time = 0.0
        
        # Broadcast initial empty state immediately
        await self._broadcast_current_state()

    async def play(self):
        """Resume simulation execution."""
        self.is_running = True
        logger.info("Simulation resumed (PLAY).")

    async def pause(self):
        """Pause simulation execution."""
        self.is_running = False
        logger.info("Simulation paused (PAUSE).")

    async def step_once(self):
        """Execute a single simulation step."""
        async with self.lock:
            if not self.is_initialized:
                return
            self._do_step()
        await self._broadcast_current_state()

    async def spawn_vehicle(self, req: SpawnRequest) -> str:
        """Dynamically insert a vehicle into the simulation."""
        async with self.lock:
            if not self.is_initialized:
                raise RuntimeError("Simulation is not initialized.")
            return self._insert_vehicle(req)

    def _insert_vehicle(self, req: SpawnRequest) -> str:
        self.vehicle_counter += 1
        veh_id = f"veh_{self.vehicle_counter}"
        v_type = req.type if req.type in ["car", "truck", "sports", "van"] else "car"
        
        # Resolve route using scenario logic
        route_id = self.scenario.get_spawn_route(req)

        # Lane selection (0 = right / slow, 1 = left / fast)
        if req.lane is not None and 0 <= req.lane <= 2:
            target_lane = min(req.lane, 1)
            depart_lane = str(target_lane)
        else:
            depart_lane = "random"

        # Speed selection
        if req.speed is not None and req.speed > 0:
            depart_speed = str(req.speed)
        else:
            depart_speed = "desired"

        # Color selection
        chosen_color = req.color or random.choice(COLOR_PALETTE)
        rgba = hex_to_rgba(chosen_color)
        self.vehicle_colors[veh_id] = chosen_color

        try:
            traci.vehicle.add(
                vehID=veh_id,
                routeID=route_id,
                typeID=v_type,
                departLane=depart_lane,
                departSpeed=depart_speed
            )
            traci.vehicle.setColor(veh_id, rgba)
            self.total_spawned += 1
            return veh_id
        except traci.TraCIException as e:
            logger.warning("Failed to insert vehicle %s on %s: %s", veh_id, route_id, e)
            # Try with safe free lane if chosen lane was blocked
            try:
                traci.vehicle.add(
                    vehID=veh_id,
                    routeID=route_id,
                    typeID=v_type,
                    departLane="free",
                    departSpeed="desired"
                )
                traci.vehicle.setColor(veh_id, rgba)
                self.total_spawned += 1
                return veh_id
            except Exception as e2:
                logger.error("Could not spawn vehicle even with free lane on %s: %s", route_id, e2)
                raise e2

    def set_auto_spawn(self, config: AutoSpawnConfig):
        self.auto_spawn = config
        logger.info("Auto-spawn updated: enabled=%s, rate=%.1f/min", config.enabled, config.rate_per_minute)

    def get_network_info(self) -> NetworkInfo:
        return self.scenario.get_network_info()

    def _do_step(self):
        """Synchronous SUMO step execution (call while holding self.lock)."""
        self.scenario.update_traffic_light(settings.STEP_LENGTH)
        traci.simulationStep()
        self.step_count += 1
        self.sim_time = round(self.step_count * settings.STEP_LENGTH, 2)
        
        arrived = traci.simulation.getArrivedIDList()
        self.total_arrived += len(arrived)
        for arr_id in arrived:
            self.vehicle_colors.pop(arr_id, None)

    def _collect_current_state(self) -> SimulationStateMessage:
        """Extract all current vehicle coordinates and metrics."""
        veh_ids = traci.vehicle.getIDList()
        vehicle_list: List[VehicleData] = []
        total_speed_kmh = 0.0

        for vid in veh_ids:
            try:
                x, y = traci.vehicle.getPosition(vid)
                speed = traci.vehicle.getSpeed(vid)
                speed_kmh = round(speed * 3.6, 1)
                total_speed_kmh += speed_kmh
                accel = round(traci.vehicle.getAcceleration(vid), 2)
                lane_idx = traci.vehicle.getLaneIndex(vid)
                lane_id = traci.vehicle.getLaneID(vid)
                angle = round(traci.vehicle.getAngle(vid), 1)
                v_type = traci.vehicle.getTypeID(vid)
                length = traci.vehicle.getLength(vid)
                width = traci.vehicle.getWidth(vid)

                color_hex = self.vehicle_colors.get(vid)
                if not color_hex:
                    c = traci.vehicle.getColor(vid)
                    color_hex = rgba_to_hex(c)
                    self.vehicle_colors[vid] = color_hex

                # Leader vehicle detection
                leader_info = traci.vehicle.getLeader(vid, 120.0)
                leader_id = leader_info[0] if leader_info else None
                leader_dist = round(leader_info[1], 1) if leader_info else None

                # Direction detection delegated to scenario
                v_dir = self.scenario.enrich_vehicle_direction(lane_id, angle, x, y)

                vehicle_list.append(VehicleData(
                    id=vid,
                    x=round(x, 2),
                    y=round(y, 2),
                    direction=v_dir,
                    lane_index=lane_idx,
                    lane_id=lane_id,
                    speed=round(speed, 2),
                    speed_kmh=speed_kmh,
                    acceleration=accel,
                    angle=angle,
                    type=v_type,
                    color=color_hex,
                    length=length,
                    width=width,
                    leader_id=leader_id,
                    leader_dist=leader_dist
                ))
            except traci.TraCIException:
                continue

        active_count = len(vehicle_list)
        avg_speed = round(total_speed_kmh / active_count, 1) if active_count > 0 else 0.0
        road_km = self.scenario.get_network_info().road_length / 1000.0
        density = round(active_count / max(0.2, road_km), 1)

        stats = SimulationStats(
            active_vehicles=active_count,
            total_spawned=self.total_spawned,
            total_arrived=self.total_arrived,
            avg_speed_kmh=avg_speed,
            density_veh_km=density
        )

        tl_data = self._get_traffic_light_data()

        return SimulationStateMessage(
            sim_time=self.sim_time,
            step=self.step_count,
            is_running=self.is_running,
            scenario_id=self.scenario.id,
            vehicles=vehicle_list,
            stats=stats,
            traffic_light=tl_data
        )

    async def _broadcast_current_state(self):
        """Broadcast state to all connected WebSockets."""
        if not self.active_websockets:
            return

        async with self.lock:
            if not self.is_initialized:
                return
            state_msg = self._collect_current_state()

        json_data = state_msg.model_dump_json()
        await self._send_to_all(json_data)

    async def _broadcast_scenario_switched(self):
        """Broadcast scenario_switched message to all connected WebSockets."""
        if not self.active_websockets:
            return
        payload = json.dumps({
            "type": "scenario_switched",
            "scenario": self.scenario.get_metadata().model_dump()
        })
        await self._send_to_all(payload)

    async def _broadcast_network_info(self):
        """Broadcast network_info message to all connected WebSockets."""
        if not self.active_websockets:
            return
        net_info = self.get_network_info()
        payload = json.dumps({
            "type": "network_info",
            "data": net_info.model_dump()
        })
        await self._send_to_all(payload)

    async def _send_to_all(self, message: str):
        dead_sockets = set()
        for ws in self.active_websockets:
            try:
                await ws.send_text(message)
            except Exception:
                dead_sockets.add(ws)

        for ws in dead_sockets:
            self.active_websockets.discard(ws)

    async def _simulation_loop(self):
        """20 Hz simulation loop (every 0.05 seconds)."""
        interval = 1.0 / settings.UPDATE_RATE_HZ
        logger.info("Simulation loop running at %.1f Hz (%.3fs interval)...", settings.UPDATE_RATE_HZ, interval)

        while True:
            t0 = time.monotonic()
            try:
                if self.is_running and self.is_initialized:
                    async with self.lock:
                        # Auto-spawning logic using scenario generator
                        if self.auto_spawn.enabled and self.auto_spawn.rate_per_minute > 0:
                            spawn_interval = 60.0 / self.auto_spawn.rate_per_minute
                            if (self.sim_time - self.last_auto_spawn_time) >= spawn_interval:
                                self.last_auto_spawn_time = self.sim_time
                                auto_req = self.scenario.get_auto_spawn_request()
                                self._insert_vehicle(auto_req)

                        # Advance SUMO simulation
                        self._do_step()
                        state_msg = self._collect_current_state()

                    # Broadcast outside the lock to minimize contention
                    if self.active_websockets:
                        json_payload = state_msg.model_dump_json()
                        await self._send_to_all(json_payload)

            except Exception as e:
                logger.error("Error in simulation loop: %s", e, exc_info=True)

            elapsed = time.monotonic() - t0
            sleep_duration = max(0.001, interval - elapsed)
            await asyncio.sleep(sleep_duration)

    async def register_websocket(self, ws: WebSocket):
        await ws.accept()
        self.active_websockets.add(ws)
        logger.info("WebSocket connected. Active clients: %d", len(self.active_websockets))
        # Send initial network info and current state immediately
        net_info = self.get_network_info()
        await ws.send_text(json.dumps({
            "type": "network_info",
            "data": net_info.model_dump()
        }))
        async with self.lock:
            if self.is_initialized:
                state_msg = self._collect_current_state()
                await ws.send_text(state_msg.model_dump_json())

    def unregister_websocket(self, ws: WebSocket):
        self.active_websockets.discard(ws)
        logger.info("WebSocket disconnected. Active clients: %d", len(self.active_websockets))

sim_manager = SimulationManager()
