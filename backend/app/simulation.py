import asyncio
import json
import logging
import random
import time
from typing import Set, Dict, Any, Optional, List
import traci
from fastapi import WebSocket

from .config import settings, bandwidth_limiter
from .schemas import (
    SimulationStats,
    SimulationStateMessage,
    SpawnRequest,
    NetworkInfo,
    TrafficLightState,
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

# Indian Roads Congress (IRC) Passenger Car Equivalent (PCE/PCU) factors
PCE_WEIGHTS = {
    "car": 1.0,
    "sports": 1.0,
    "van": 1.4,
    "truck": 3.0,
}

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
        self.is_running = False
        self.step_count = 0
        self.sim_time = 0.0
        self.total_spawned = 0
        self.total_arrived = 0
        self.vehicle_counter = 0
        self.vehicle_colors: Dict[str, str] = {}
        
        # Cumulative run-wide speed tracking across all entered, exited, and active vehicles
        self.cumulative_speed_sum_kmh: float = 0.0
        self.cumulative_speed_samples: int = 0
        
        # Active scenario (extensible)
        self.scenario: BaseScenario = registry.get_or_default("straight_road")

        # Simulation limit (from scenario.xml)
        self.time_limit_reached: bool = False

        # Demand generation accumulator (rate comes from scenario.xml)
        self.auto_spawn_accumulator = 0.0

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
        self.scenario.reload_settings()
        traci.start(cmd)
        self.step_count = 0
        self.sim_time = 0.0
        self.time_limit_reached = False
        self.total_spawned = 0
        self.total_arrived = 0
        self.vehicle_counter = 0
        self.auto_spawn_accumulator = 0.0
        self.vehicle_colors.clear()
        self.cumulative_speed_sum_kmh = 0.0
        self.cumulative_speed_samples = 0
        self.scenario.reset_state()

        # Apply default speed limit to all lanes
        default_speed_m_s = self.default_speed_kmh / 3.6
        try:
            for lane_id in traci.lane.getIDList():
                traci.lane.setMaxSpeed(lane_id, default_speed_m_s)
        except Exception as e:
            logger.warning("Could not set initial lane speed limit: %s", e)

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
            self.is_running = False

        # Broadcast scenario switch, new network info, and state
        await self._broadcast_scenario_switched()
        await self._broadcast_network_info()
        await self._broadcast_current_state()

    @property
    def default_speed_kmh(self) -> float:
        return self.scenario.settings.default_speed_kmh

    @property
    def max_sim_time(self) -> float:
        return self.scenario.settings.max_sim_time

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
            self.is_running = False
        
        # Broadcast initial empty state immediately
        await self._broadcast_current_state()

    async def play(self):
        """Resume simulation execution."""
        if self.sim_time >= self.max_sim_time or self.time_limit_reached:
            self.is_running = False
            self.time_limit_reached = True
            logger.warning("Cannot resume simulation: time limit (%.1fs) reached. Reset required.", self.max_sim_time)
            await self._broadcast_current_state()
            return False
        self.is_running = True
        logger.info("Simulation resumed (PLAY).")
        return True

    async def pause(self):
        """Pause simulation execution."""
        self.is_running = False
        logger.info("Simulation paused (PAUSE).")

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

        # Speed selection (defaults to configured cruising speed e.g. 50 km/h = 13.89 m/s)
        if req.speed is not None and req.speed > 0:
            depart_speed = str(round(req.speed, 2))
            max_v_speed = req.speed
        else:
            default_m_s = self.default_speed_kmh / 3.6
            depart_speed = str(round(default_m_s, 2))
            max_v_speed = default_m_s

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
            traci.vehicle.setMaxSpeed(veh_id, max_v_speed)
            self.total_spawned += 1
            return veh_id
        except traci.TraCIException as e:
            logger.debug("Primary lane blocked for vehicle %s on %s: %s", veh_id, route_id, e)
            # Try with safe free lane if chosen lane was blocked
            try:
                traci.vehicle.add(
                    vehID=veh_id,
                    routeID=route_id,
                    typeID=v_type,
                    departLane="free",
                    departSpeed=depart_speed
                )
                traci.vehicle.setColor(veh_id, rgba)
                traci.vehicle.setMaxSpeed(veh_id, max_v_speed)
                self.total_spawned += 1
                return veh_id
            except Exception as e2:
                # If entry lanes are temporarily saturated, skip without throwing to keep loop ticking
                logger.debug("Entry temporarily saturated on %s: %s", route_id, e2)
                return ""

    def get_network_info(self) -> NetworkInfo:
        return self.scenario.get_network_info()

    def _do_step(self):
        """Synchronous SUMO step execution (call while holding self.lock)."""
        self.scenario.update_traffic_light(settings.STEP_LENGTH)
        traci.simulationStep()
        self.step_count += 1
        self.sim_time = round(self.step_count * settings.STEP_LENGTH, 2)
        
        # Accumulate vehicle speed samples across all active vehicles in this step
        # This guarantees vehicles that entered and later exited remain included in the run-wide average speed
        for vid in traci.vehicle.getIDList():
            try:
                self.cumulative_speed_sum_kmh += traci.vehicle.getSpeed(vid) * 3.6
                self.cumulative_speed_samples += 1
            except traci.TraCIException:
                pass

        arrived = traci.simulation.getArrivedIDList()
        self.total_arrived += len(arrived)
        for arr_id in arrived:
            self.vehicle_colors.pop(arr_id, None)

        # Enforce maximum simulation time configured in scenario.xml
        if self.sim_time >= self.max_sim_time:
            self.sim_time = self.max_sim_time
            self.is_running = False
            self.time_limit_reached = True
            logger.info("Simulation time limit reached (%.1fs). Pausing simulation.", self.sim_time)

    def _collect_current_state(self) -> SimulationStateMessage:
        """Extract all current vehicle coordinates and metrics in compact format for network efficiency."""
        veh_ids = traci.vehicle.getIDList()
        compact_list: List[List[Any]] = []
        total_speed_kmh = 0.0

        road_km = self.scenario.get_network_info().road_length / 1000.0
        total_pce = 0.0

        for vid in veh_ids:
            try:
                x, y = traci.vehicle.getPosition(vid)
                speed = traci.vehicle.getSpeed(vid)
                speed_kmh = round(speed * 3.6, 1)
                total_speed_kmh += speed_kmh
                accel = round(traci.vehicle.getAcceleration(vid), 1)
                lane_idx = traci.vehicle.getLaneIndex(vid)
                lane_id = traci.vehicle.getLaneID(vid)
                angle = round(traci.vehicle.getAngle(vid), 1)
                v_type = traci.vehicle.getTypeID(vid)
                length = round(traci.vehicle.getLength(vid), 1)
                width = round(traci.vehicle.getWidth(vid), 1)

                total_pce += PCE_WEIGHTS.get(v_type, 1.0)

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

                # Compact tuple format:
                # [0:id, 1:x, 2:y, 3:speed, 4:accel, 5:angle, 6:lane_idx, 7:type, 8:color, 9:len, 10:wid, 11:leader_id, 12:leader_dist, 13:direction]
                compact_list.append([
                    vid,
                    round(x, 1),
                    round(y, 1),
                    round(speed, 1),
                    accel,
                    angle,
                    lane_idx,
                    v_type,
                    color_hex,
                    length,
                    width,
                    leader_id,
                    leader_dist,
                    v_dir
                ])
            except traci.TraCIException:
                continue

        active_count = len(compact_list)
        # Run-wide cumulative average speed across all vehicles that entered, ran, and exited during the simulation run
        if self.cumulative_speed_samples > 0:
            avg_speed = round(self.cumulative_speed_sum_kmh / self.cumulative_speed_samples, 1)
        elif active_count > 0:
            avg_speed = round(total_speed_kmh / active_count, 1)
        else:
            avg_speed = 0.0

        density = round(active_count / max(0.2, road_km), 1)

        # Indian Traffic Engineering: Passenger Car Equivalent (PCE/PCU) calculation
        density_pce_km = total_pce / max(0.2, road_km)
        # Flow rate q = k * v (in PCE / hour)
        if active_count > 0 and avg_speed > 0:
            pce_per_hour = round(density_pce_km * avg_speed, 1)
        elif self.scenario.settings.vehicles_per_hour > 0:
            avg_pce_factor = 1.3
            pce_per_hour = round(self.scenario.settings.vehicles_per_hour * avg_pce_factor, 1)
        else:
            pce_per_hour = 0.0

        stats = SimulationStats(
            active_vehicles=active_count,
            total_spawned=self.total_spawned,
            total_arrived=self.total_arrived,
            avg_speed_kmh=avg_speed,
            density_veh_km=density,
            pce_per_hour=pce_per_hour
        )

        tl_data = self._get_traffic_light_data()

        return SimulationStateMessage(
            sim_time=self.sim_time,
            step=self.step_count,
            is_running=self.is_running,
            scenario_id=self.scenario.id,
            compact_vehicles=compact_list,
            vehicles=None,
            stats=stats,
            traffic_light=tl_data,
            default_speed_kmh=self.default_speed_kmh,
            max_sim_time=self.max_sim_time,
            time_limit_reached=self.time_limit_reached or (self.sim_time >= self.max_sim_time)
        )

    async def _broadcast_current_state(self):
        """Broadcast state to all connected WebSockets using compact JSON serialization."""
        if not self.active_websockets:
            return

        async with self.lock:
            if not self.is_initialized:
                return
            state_msg = self._collect_current_state()

        json_data = state_msg.model_dump_json(exclude_none=True)
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
        msg_bytes = len(message.encode("utf-8"))
        total_bytes = msg_bytes * len(self.active_websockets)

        # Check bandwidth budget before sending
        if not bandwidth_limiter.try_record(total_bytes):
            # Budget exhausted — send a throttle notification instead (once)
            # to inform clients, then skip the actual payload
            throttle_msg = json.dumps({
                "type": "throttled",
                "reason": "bandwidth_limit",
                "usage": bandwidth_limiter.get_usage()
            })
            dead_sockets = set()
            for ws in self.active_websockets:
                try:
                    await ws.send_text(throttle_msg)
                except Exception:
                    dead_sockets.add(ws)
            for ws in dead_sockets:
                self.active_websockets.discard(ws)
            return

        dead_sockets = set()
        for ws in self.active_websockets:
            try:
                await ws.send_text(message)
            except Exception:
                dead_sockets.add(ws)

        for ws in dead_sockets:
            self.active_websockets.discard(ws)

    async def _simulation_loop(self):
        """High-performance simulation loop:
        Steps SUMO physics at 20 Hz (interval = 0.05s) for Krauss car-following accuracy.
        Broadcasts WebSocket state at 10 Hz (every 2nd step) to cut network traffic by 50%
        while CanvasView 60 FPS lerp ensures silky smooth motion.
        """
        step_interval = 1.0 / settings.SIMULATION_RATE_HZ
        broadcast_step_interval = max(1, int(round(settings.SIMULATION_RATE_HZ / settings.BROADCAST_RATE_HZ)))
        logger.info(
            "Simulation loop: physics @ %.1f Hz (%.3fs), WebSocket broadcast @ %.1f Hz (every %d steps)...",
            settings.SIMULATION_RATE_HZ, step_interval, settings.BROADCAST_RATE_HZ, broadcast_step_interval
        )

        step_counter = 0
        while True:
            t0 = time.monotonic()
            try:
                if self.is_running and self.is_initialized:
                    async with self.lock:
                        # Demand generation at the scenario.xml inflow rate (veh/hr)
                        vph = self.scenario.settings.vehicles_per_hour
                        if vph > 0:
                            rate_per_sec = vph / 3600.0
                            self.auto_spawn_accumulator += rate_per_sec * settings.STEP_LENGTH
                            spawn_count = int(self.auto_spawn_accumulator)
                            if spawn_count > 0:
                                self.auto_spawn_accumulator -= spawn_count
                                for _ in range(min(spawn_count, 15)):
                                    auto_req = self.scenario.get_auto_spawn_request()
                                    self._insert_vehicle(auto_req)

                        # Advance SUMO simulation
                        self._do_step()
                        step_counter += 1

                        should_broadcast = (step_counter % broadcast_step_interval == 0) or self.time_limit_reached
                        if should_broadcast and self.active_websockets:
                            state_msg = self._collect_current_state()
                        else:
                            state_msg = None

                    # Broadcast outside the lock to minimize contention
                    if state_msg and self.active_websockets:
                        json_payload = state_msg.model_dump_json(exclude_none=True)
                        await self._send_to_all(json_payload)

            except Exception as e:
                logger.error("Error in simulation loop: %s", e, exc_info=True)

            elapsed = time.monotonic() - t0
            sleep_duration = max(0.001, step_interval - elapsed)
            await asyncio.sleep(sleep_duration)

    async def register_websocket(self, ws: WebSocket):
        await ws.accept()
        self.active_websockets.add(ws)
        logger.info("WebSocket connected. Active clients: %d", len(self.active_websockets))
        # Send initial network info and current state immediately
        net_info = self.get_network_info()
        net_info_payload = json.dumps({
            "type": "network_info",
            "data": net_info.model_dump()
        })
        bandwidth_limiter.record(len(net_info_payload.encode("utf-8")))
        await ws.send_text(net_info_payload)
        async with self.lock:
            if self.is_initialized:
                state_msg = self._collect_current_state()
                state_payload = state_msg.model_dump_json(exclude_none=True)
                bandwidth_limiter.record(len(state_payload.encode("utf-8")))
                await ws.send_text(state_payload)

    def unregister_websocket(self, ws: WebSocket):
        self.active_websockets.discard(ws)
        logger.info("WebSocket disconnected. Active clients: %d", len(self.active_websockets))

sim_manager = SimulationManager()
