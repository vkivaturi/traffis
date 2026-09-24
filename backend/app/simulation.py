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
)

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
        """Start the headless SUMO process via TraCI."""
        cmd = [
            settings.SUMO_BINARY,
            "-c", settings.SUMOCFG_FILE,
            "--step-length", str(settings.STEP_LENGTH),
            "--start",
            "--quit-on-end",
            "--no-step-log", "true",
            "--no-warnings", "true"
        ]
        logger.info("Starting SUMO TraCI with command: %s", " ".join(cmd))
        traci.start(cmd)
        self.step_count = 0
        self.sim_time = 0.0
        self.total_spawned = 0
        self.total_arrived = 0
        self.vehicle_counter = 0
        self.vehicle_colors.clear()

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
        """Reset the simulation back to t=0."""
        async with self.lock:
            logger.info("Resetting simulation...")
            try:
                traci.close()
            except Exception as e:
                logger.warning("Error while closing traci on reset: %s", e)
            
            # Restart TraCI
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
        
        # Lane selection
        if req.lane is not None and 0 <= req.lane <= 2:
            depart_lane = str(req.lane)
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
                routeID="route_straight",
                typeID=v_type,
                departLane=depart_lane,
                departSpeed=depart_speed
            )
            traci.vehicle.setColor(veh_id, rgba)
            self.total_spawned += 1
            return veh_id
        except traci.TraCIException as e:
            logger.warning("Failed to insert vehicle %s: %s", veh_id, e)
            # Try with safe defaults if lane was blocked
            try:
                traci.vehicle.add(
                    vehID=veh_id,
                    routeID="route_straight",
                    typeID=v_type,
                    departLane="free",
                    departSpeed="desired"
                )
                traci.vehicle.setColor(veh_id, rgba)
                self.total_spawned += 1
                return veh_id
            except Exception as e2:
                logger.error("Could not spawn vehicle even with free lane: %s", e2)
                raise e2

    def set_auto_spawn(self, config: AutoSpawnConfig):
        self.auto_spawn = config
        logger.info("Auto-spawn updated: enabled=%s, rate=%.1f/min", config.enabled, config.rate_per_minute)

    def get_network_info(self) -> NetworkInfo:
        lanes = [
            {"id": "road_0", "index": 0, "name": "Right Lane (Slow)", "width": 3.2, "y_center": -8.0, "speed_limit_kmh": 120.0},
            {"id": "road_1", "index": 1, "name": "Middle Lane", "width": 3.2, "y_center": -4.8, "speed_limit_kmh": 120.0},
            {"id": "road_2", "index": 2, "name": "Left Lane (Fast / Overtake)", "width": 3.2, "y_center": -1.6, "speed_limit_kmh": 120.0},
        ]
        return NetworkInfo(
            road_length=settings.ROAD_LENGTH_M,
            num_lanes=settings.NUM_LANES,
            lane_width=settings.LANE_WIDTH_M,
            lanes=lanes
        )

    def _do_step(self):
        """Synchronous SUMO step execution (call while holding self.lock)."""
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

                vehicle_list.append(VehicleData(
                    id=vid,
                    x=round(x, 2),
                    y=round(y, 2),
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
                # Vehicle might have arrived/departed during query
                continue

        active_count = len(vehicle_list)
        avg_speed = round(total_speed_kmh / active_count, 1) if active_count > 0 else 0.0
        density = round(active_count / (settings.ROAD_LENGTH_M / 1000.0), 1)

        stats = SimulationStats(
            active_vehicles=active_count,
            total_spawned=self.total_spawned,
            total_arrived=self.total_arrived,
            avg_speed_kmh=avg_speed,
            density_veh_km=density
        )

        return SimulationStateMessage(
            sim_time=self.sim_time,
            step=self.step_count,
            is_running=self.is_running,
            vehicles=vehicle_list,
            stats=stats
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
        interval = 1.0 / settings.UPDATE_RATE_HZ  # 0.05 seconds
        logger.info("Simulation loop running at %.1f Hz (%.3fs interval)...", settings.UPDATE_RATE_HZ, interval)

        while True:
            t0 = time.monotonic()
            try:
                if self.is_running and self.is_initialized:
                    async with self.lock:
                        # Auto-spawning logic
                        if self.auto_spawn.enabled and self.auto_spawn.rate_per_minute > 0:
                            spawn_interval = 60.0 / self.auto_spawn.rate_per_minute
                            if (self.sim_time - self.last_auto_spawn_time) >= spawn_interval:
                                self.last_auto_spawn_time = self.sim_time
                                v_type = random.choices(["car", "sports", "van", "truck"], weights=[0.6, 0.15, 0.15, 0.1])[0]
                                self._insert_vehicle(SpawnRequest(
                                    lane=random.randint(0, 2),
                                    type=v_type
                                ))

                        # Advance SUMO simulation
                        self._do_step()
                        state_msg = self._collect_current_state()

                    # Broadcast outside the lock to minimize lock contention
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
