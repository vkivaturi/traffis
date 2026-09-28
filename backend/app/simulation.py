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

        # Traffic Light settings
        self.tl_id = "traffic_light"
        self.tl_state = "green"  # "green" | "yellow" | "red"
        self.tl_mode = "auto"    # "auto" | "manual"
        self.tl_green_duration = settings.DEFAULT_GREEN_DURATION
        self.tl_yellow_duration = settings.DEFAULT_YELLOW_DURATION
        self.tl_red_duration = settings.DEFAULT_RED_DURATION
        self.tl_phase_timer = 0.0

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
        self.tl_state = "green"
        self.tl_phase_timer = 0.0
        self._apply_traffic_light_state(self.tl_state)

    def _get_tl_raw_state(self, state: str) -> str:
        char = "r" if state == "red" else "y" if state == "yellow" else "G"
        try:
            controlled = traci.trafficlight.getControlledLinks(self.tl_id)
            num_links = len(controlled) if controlled else 4
            return char * num_links
        except Exception:
            return char * 4

    def _apply_traffic_light_state(self, state: str):
        raw = self._get_tl_raw_state(state)
        try:
            traci.trafficlight.setRedYellowGreenState(self.tl_id, raw)
        except Exception as e:
            logger.warning("Could not set traffic light state '%s' (%s): %s", state, raw, e)

    def _update_traffic_light(self, dt: float):
        if self.tl_mode != "auto":
            return

        self.tl_phase_timer += dt
        if self.tl_state == "green":
            if self.tl_phase_timer >= self.tl_green_duration:
                self.tl_state = "yellow"
                self.tl_phase_timer = 0.0
                self._apply_traffic_light_state("yellow")
        elif self.tl_state == "yellow":
            if self.tl_phase_timer >= self.tl_yellow_duration:
                self.tl_state = "red"
                self.tl_phase_timer = 0.0
                self._apply_traffic_light_state("red")
        elif self.tl_state == "red":
            if self.tl_phase_timer >= self.tl_red_duration:
                self.tl_state = "green"
                self.tl_phase_timer = 0.0
                self._apply_traffic_light_state("green")

    async def set_traffic_light(self, config: TrafficLightConfig):
        async with self.lock:
            if config.green_duration is not None:
                self.tl_green_duration = config.green_duration
            if config.yellow_duration is not None:
                self.tl_yellow_duration = config.yellow_duration
            if config.red_duration is not None:
                self.tl_red_duration = config.red_duration
            if config.mode is not None:
                self.tl_mode = config.mode
            if config.state is not None:
                self.tl_state = config.state
                self.tl_phase_timer = 0.0
                self._apply_traffic_light_state(self.tl_state)
            logger.info("Traffic light updated: mode=%s, state=%s, G=%.1fs, Y=%.1fs, R=%.1fs",
                        self.tl_mode, self.tl_state, self.tl_green_duration, self.tl_yellow_duration, self.tl_red_duration)
        await self._broadcast_current_state()

    async def next_traffic_light_phase(self):
        async with self.lock:
            if self.tl_state == "green":
                self.tl_state = "yellow"
            elif self.tl_state == "yellow":
                self.tl_state = "red"
            else:
                self.tl_state = "green"
            self.tl_phase_timer = 0.0
            self._apply_traffic_light_state(self.tl_state)
            logger.info("Traffic light manual step -> %s", self.tl_state)
        await self._broadcast_current_state()

    def _get_traffic_light_data(self) -> TrafficLightState:
        if self.tl_state == "green":
            dur = self.tl_green_duration
            next_st = "yellow"
        elif self.tl_state == "yellow":
            dur = self.tl_yellow_duration
            next_st = "red"
        else:
            dur = self.tl_red_duration
            next_st = "green"

        rem = max(0.0, round(dur - self.tl_phase_timer, 1))
        return TrafficLightState(
            id=self.tl_id,
            x=settings.TRAFFIC_LIGHT_X,
            state=self.tl_state,
            raw_state=self._get_tl_raw_state(self.tl_state),
            mode=self.tl_mode,
            green_duration=self.tl_green_duration,
            yellow_duration=self.tl_yellow_duration,
            red_duration=self.tl_red_duration,
            phase_timer=round(self.tl_phase_timer, 2),
            phase_remaining=rem,
            next_state=next_st
        )

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
        
        # Direction selection ('east' or 'west')
        direction = req.direction or "east"
        if direction == "random":
            direction = random.choice(["east", "west"])
        elif direction not in ["east", "west"]:
            direction = "east"
            
        route_id = "route_west" if direction == "west" else "route_east"

        # Lane selection (2 lanes per direction: 0 = right / slow, 1 = left / fast)
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
            # Try with safe defaults if lane was blocked
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
        lanes = [
            {"id": "road_west_0", "index": 0, "direction": "west", "name": "Westbound Right Lane (Slow)", "width": 3.2, "y_center": 4.8, "speed_limit_kmh": 120.0},
            {"id": "road_west_1", "index": 1, "direction": "west", "name": "Westbound Left Lane (Fast / Overtake)", "width": 3.2, "y_center": 1.6, "speed_limit_kmh": 120.0},
            {"id": "road_east_1", "index": 1, "direction": "east", "name": "Eastbound Left Lane (Fast / Overtake)", "width": 3.2, "y_center": -1.6, "speed_limit_kmh": 120.0},
            {"id": "road_east_0", "index": 0, "direction": "east", "name": "Eastbound Right Lane (Slow)", "width": 3.2, "y_center": -4.8, "speed_limit_kmh": 120.0},
        ]
        return NetworkInfo(
            road_length=settings.ROAD_LENGTH_M,
            num_lanes=settings.NUM_LANES,
            num_lanes_per_dir=settings.NUM_LANES_PER_DIR,
            lane_width=settings.LANE_WIDTH_M,
            traffic_light_x=settings.TRAFFIC_LIGHT_X,
            lanes=lanes
        )

    def _do_step(self):
        """Synchronous SUMO step execution (call while holding self.lock)."""
        self._update_traffic_light(settings.STEP_LENGTH)
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

                # Direction detection
                v_dir = "west" if ("west" in lane_id or angle > 180) else "east"

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

        tl_data = self._get_traffic_light_data()

        return SimulationStateMessage(
            sim_time=self.sim_time,
            step=self.step_count,
            is_running=self.is_running,
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
                                v_dir = random.choice(["east", "west"])
                                self._insert_vehicle(SpawnRequest(
                                    direction=v_dir,
                                    lane=random.randint(0, 1),
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
