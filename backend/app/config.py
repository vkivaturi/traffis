import os
import shutil
from pathlib import Path
from pydantic import BaseModel

BACKEND_DIR = Path(__file__).resolve().parent.parent
SUMO_CONFIG_DIR = BACKEND_DIR / "sumo_config"

def resolve_sumo_home() -> str:
    env_home = os.environ.get("SUMO_HOME")
    if env_home and os.path.exists(env_home):
        return env_home
    standard_mac_path = "/Library/Frameworks/EclipseSUMO.framework/Versions/Current/EclipseSUMO/share/sumo"
    if os.path.exists(standard_mac_path):
        return standard_mac_path
    homebrew_path = "/opt/homebrew/share/sumo"
    if os.path.exists(homebrew_path):
        return homebrew_path
    return ""

def resolve_sumo_binary(binary_name: str = "sumo") -> str:
    which_bin = shutil.which(binary_name)
    if which_bin:
        return which_bin
    
    sumo_home = resolve_sumo_home()
    if sumo_home:
        candidates = [
            os.path.join(sumo_home, "bin", binary_name),
            os.path.join(sumo_home, "..", "..", "bin", binary_name),
            f"/Library/Frameworks/EclipseSUMO.framework/Versions/Current/EclipseSUMO/bin/{binary_name}",
            f"/opt/homebrew/bin/{binary_name}",
            f"/usr/local/bin/{binary_name}"
        ]
        for c in candidates:
            abs_c = os.path.abspath(c)
            if os.path.exists(abs_c) and os.access(abs_c, os.X_OK):
                return abs_c
    return binary_name

class Settings(BaseModel):
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    SUMO_HOME: str = resolve_sumo_home()
    SUMO_BINARY: str = resolve_sumo_binary("sumo")
    SUMOCFG_FILE: str = str(SUMO_CONFIG_DIR / "road.sumocfg")
    STEP_LENGTH: float = 0.05  # 50ms per simulation step
    UPDATE_RATE_HZ: float = 20.0  # 20 updates per second
    ROAD_LENGTH_M: float = 1000.0
    NUM_LANES: int = 3
    LANE_WIDTH_M: float = 3.2
    TRAFFIC_LIGHT_X: float = 500.0
    DEFAULT_GREEN_DURATION: float = 15.0
    DEFAULT_YELLOW_DURATION: float = 3.0
    DEFAULT_RED_DURATION: float = 12.0
    
settings = Settings()

# Ensure SUMO_HOME is set in os.environ for traci / sumo internal resolution
if settings.SUMO_HOME:
    os.environ["SUMO_HOME"] = settings.SUMO_HOME
