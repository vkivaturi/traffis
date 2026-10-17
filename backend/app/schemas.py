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

class SignalGroupTiming(BaseModel):
    id: str = Field(..., description="Unique identifier of the signal group / approach arm")
    name: str = Field(..., description="Human readable name of the approach")
    green_duration: float = Field(30.0, description="Green light duration in seconds")
    amber_duration: float = Field(3.0, description="Fixed amber/yellow duration (3.0s)")
    calculated_red_duration: float = Field(33.0, description="System calculated red light duration")
    is_active_green: bool = Field(False, description="Whether this signal group currently has green")

class TrafficLightState(BaseModel):
    id: str = "traffic_light"
    x: float = 500.0
    y: float = 0.0
    state: str = "green"  # "green" | "yellow" | "red"
    raw_state: str = "GGGG"
    mode: str = "auto"    # fixed-time plan from scenario.xml
    green_duration: float = 30.0
    yellow_duration: float = 3.0
    red_duration: float = 33.0
    phase_timer: float = 0.0
    phase_remaining: float = 30.0
    next_state: str = "yellow"
    phase_index: int = 0
    phase_name: Optional[str] = None
    signal_groups: Optional[List[SignalGroupTiming]] = None

class SimulationStateMessage(BaseModel):
    type: str = "state"
    sim_time: float
    step: int
    is_running: bool
    scenario_id: str = "straight_road"
    vehicles: Optional[List[VehicleData]] = None
    compact_vehicles: Optional[List[List[Any]]] = None
    stats: SimulationStats
    traffic_light: Optional[TrafficLightState] = None  # None for unsignalised scenarios (e.g. gnt_circle)
    junction_metrics: Optional["JunctionMetrics"] = None
    default_speed_kmh: Optional[float] = 50.0
    max_sim_time: float = 300.0
    time_limit_reached: bool = False

class SpawnRequest(BaseModel):
    direction: Optional[str] = Field(None, description="Travel direction or spawn origin: 'east', 'west', 'north', 'random'")
    origin: Optional[str] = Field(None, description="Spawn origin arm: 'west', 'east', 'north', 'random'")
    turn: Optional[str] = Field(None, description="Turn intention: 'straight', 'left', 'right', 'random'")
    lane: Optional[int] = Field(None, ge=0, le=2, description="Lane index: 0 (right / slow), 1 (left / fast)")
    speed: Optional[float] = Field(None, ge=1.0, le=50.0, description="Initial speed in m/s")
    type: Optional[str] = Field("car", description="Vehicle type: car, sports, truck, van, motorcycle, auto_rickshaw, bus")
    color: Optional[str] = Field(None, description="Hex color e.g. #38bdf8")

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

class LaneShape(BaseModel):
    id: str
    edge: str
    index: int
    width: float
    speed_limit_kmh: float
    shape: List[List[float]]  # polyline [[x, y], ...] in world metres

class JunctionShape(BaseModel):
    id: str
    shape: List[List[float]]  # closed polygon [[x, y], ...]

class MedianShape(BaseModel):
    id: str
    width: float
    shape: List[List[float]]

class ArmLabel(BaseModel):
    id: str           # "NG" | "TL" | "FL"
    name: str         # full name, e.g. "Nallagandla"
    x: float
    y: float
    description: str = ""

class RoundaboutInfo(BaseModel):
    x: float
    y: float
    island_radius: float
    outer_radius: float

class NetworkGeometry(BaseModel):
    """Arbitrary polyline geometry (curved roads) read from the compiled .net.xml."""
    lanes: List[LaneShape]
    connectors: List[LaneShape] = []   # internal junction lanes, drawn as asphalt only
    junctions: List[JunctionShape]
    paved_areas: List[JunctionShape] = []  # extra asphalt polygons, e.g. median openings
    medians: List[MedianShape] = []
    labels: List[ArmLabel] = []
    roundabout: Optional[RoundaboutInfo] = None
    yield_lanes: List[str] = []  # lanes whose downstream end gives way (ring entries, slip merge, U-turn)
    bounds: Dict[str, float] = {}

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
    geometry: Optional[NetworkGeometry] = None

class ArmFlowMetrics(BaseModel):
    id: str
    name: str
    inflow: int = 0           # vehicles departed from this arm
    outflow: int = 0          # vehicles arrived at this arm
    avg_delay_s: Optional[float] = None  # mean (travel time - free-flow time) of trips from this arm

class ODMetrics(BaseModel):
    key: str                  # e.g. "TL_NG"
    configured_vph: float
    arrived: int = 0
    throughput_vph: float = 0.0

class EntryQueue(BaseModel):
    id: str                   # edge id, e.g. "NG_in"
    label: str
    halting: int = 0          # halting vehicles on the last 100 m

class JunctionMetrics(BaseModel):
    arms: List[ArmFlowMetrics]
    od: List[ODMetrics]
    entry_queues: List[EntryQueue]
    roundabout_occupancy: int = 0
    uturn_count: int = 0
    teleports: int = 0

class ScenarioSelectRequest(BaseModel):
    scenario_id: str

SimulationStateMessage.model_rebuild()
