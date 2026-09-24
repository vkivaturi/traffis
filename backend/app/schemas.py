from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class VehicleData(BaseModel):
    id: str
    x: float
    y: float
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

class SimulationStateMessage(BaseModel):
    type: str = "state"
    sim_time: float
    step: int
    is_running: bool
    vehicles: List[VehicleData]
    stats: SimulationStats

class SpawnRequest(BaseModel):
    lane: Optional[int] = Field(None, ge=0, le=2, description="Lane index: 0 (right), 1 (middle), 2 (left)")
    speed: Optional[float] = Field(None, ge=1.0, le=50.0, description="Initial speed in m/s")
    type: Optional[str] = Field("car", description="Vehicle type: car, sports, truck, van")
    color: Optional[str] = Field(None, description="Hex color e.g. #38bdf8")

class AutoSpawnConfig(BaseModel):
    enabled: bool = False
    rate_per_minute: float = Field(24.0, ge=1.0, le=200.0)

class NetworkInfo(BaseModel):
    road_length: float = 1000.0
    num_lanes: int = 3
    lane_width: float = 3.2
    lanes: List[Dict[str, Any]]
