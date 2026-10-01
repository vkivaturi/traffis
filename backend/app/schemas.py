from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class VehicleData(BaseModel):
    id: str
    x: float
    y: float
    direction: str = "east"  # "east" | "west" | "north" | "south"
    lane_index: int
    lane_id: str
    speed: float
    speed_kmh: float
    acceleration: float
    angle: float
    type: str
    color: str
    length: float
    width: float
    leader_id: Optional[str] = None
    leader_dist: Optional[float] = None

class SimulationStats(BaseModel):
    active_vehicles: int
    total_spawned: int
    total_arrived: int
    avg_speed_kmh: float
    density_veh_km: float
    pce_per_hour: float = 0.0  # Hourly traffic flow in Passenger Car Equivalent (PCE/h)

class TrafficLightState(BaseModel):
    id: str = "traffic_light"
    x: float = 500.0
    y: float = 0.0
    state: str = "green"  # "green" | "yellow" | "red"
    raw_state: str = "GGGG"
    mode: str = "auto"    # "auto" | "manual"
    green_duration: float = 15.0
    yellow_duration: float = 3.0
    red_duration: float = 12.0
    phase_timer: float = 0.0
    phase_remaining: float = 15.0
    next_state: str = "yellow"
    phase_index: int = 0
    phase_name: Optional[str] = None

class TrafficLightConfig(BaseModel):
    mode: Optional[str] = Field(None, description="'auto' or 'manual'")
    state: Optional[str] = Field(None, description="'green', 'yellow', or 'red'")
    green_duration: Optional[float] = Field(None, ge=1.0, le=120.0, description="Green light duration in seconds")
    yellow_duration: Optional[float] = Field(None, ge=1.0, le=30.0, description="Yellow light duration in seconds")
    red_duration: Optional[float] = Field(None, ge=1.0, le=120.0, description="Red light duration in seconds")

class SimulationStateMessage(BaseModel):
    type: str = "state"
    sim_time: float
    step: int
    is_running: bool
    scenario_id: str = "straight_road"
    vehicles: Optional[List[VehicleData]] = None
    compact_vehicles: Optional[List[List[Any]]] = None
    stats: SimulationStats
    traffic_light: TrafficLightState
    default_speed_kmh: Optional[float] = 50.0

class SpawnRequest(BaseModel):
    direction: Optional[str] = Field(None, description="Travel direction or spawn origin: 'east', 'west', 'north', 'random'")
    origin: Optional[str] = Field(None, description="Spawn origin arm: 'west', 'east', 'north', 'random'")
    turn: Optional[str] = Field(None, description="Turn intention: 'straight', 'left', 'right', 'random'")
    lane: Optional[int] = Field(None, ge=0, le=2, description="Lane index: 0 (right / slow), 1 (left / fast)")
    speed: Optional[float] = Field(None, ge=1.0, le=50.0, description="Initial speed in m/s")
    type: Optional[str] = Field("car", description="Vehicle type: car, sports, truck, van")
    color: Optional[str] = Field(None, description="Hex color e.g. #38bdf8")

class AutoSpawnConfig(BaseModel):
    enabled: bool = True
    rate_per_minute: float = Field(25.0, ge=0.0, le=1000.0, description="Vehicles spawned per minute (e.g. 333.33 for 20,000 veh/hr)")
    rate_per_hour: Optional[float] = Field(None, ge=0.0, le=60000.0, description="Vehicles spawned per hour (up to 20,000+ veh/hr)")

class SpawnOriginInfo(BaseModel):
    id: str
    label: str
    description: str

class ScenarioMetadata(BaseModel):
    id: str
    name: str
    description: str
    type: str  # "straight" | "intersection"
    bounds: Dict[str, float]
    default_camera: Dict[str, Any]
    spawn_origins: List[SpawnOriginInfo]

class RoadArmInfo(BaseModel):
    id: str
    name: str
    direction: str
    x_start: float
    y_start: float
    x_end: float
    y_end: float
    num_lanes_inbound: int = 2
    num_lanes_outbound: int = 2

class NetworkInfo(BaseModel):
    scenario: ScenarioMetadata
    road_length: float = 1000.0
    num_lanes: int = 4
    num_lanes_per_dir: int = 2
    lane_width: float = 3.2
    traffic_light_x: float = 500.0
    traffic_light_y: float = 0.0
    lanes: List[Dict[str, Any]]
    arms: Optional[List[RoadArmInfo]] = None

class ScenarioSelectRequest(BaseModel):
    scenario_id: str
