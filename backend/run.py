import os
import sys
from pathlib import Path

# Ensure backend root is in PYTHONPATH
BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

# Ensure networks are built
net_file = BACKEND_DIR / "sumo_config" / "road.net.xml"
intersection_net = BACKEND_DIR / "sumo_config" / "scenarios" / "three_way_intersection" / "intersection.net.xml"
if not net_file.exists() or not intersection_net.exists():
    print("Networks missing. Building all scenario networks with netconvert...")
    from sumo_config.build_network import build
    build()

import uvicorn
from app.config import settings

if __name__ == "__main__":
    print(f"Starting Traffis backend on {settings.HOST}:{settings.PORT}")
    print(f"SUMO Binary: {settings.SUMO_BINARY}")
    print(f"SUMO Config: {settings.SUMOCFG_FILE}")
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, log_level="info", reload=False)
