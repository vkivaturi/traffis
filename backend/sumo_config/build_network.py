import os
import subprocess
import sys
from pathlib import Path

CONFIG_DIR = Path(__file__).parent.resolve()

NODES_XML = """<?xml version="1.0" encoding="UTF-8"?>
<nodes xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/nodes_file.xsd">
    <node id="start" x="0.0" y="0.0" type="priority"/>
    <node id="traffic_light" x="500.0" y="0.0" type="traffic_light"/>
    <node id="end" x="1000.0" y="0.0" type="priority"/>
</nodes>
"""

EDGES_XML = """<?xml version="1.0" encoding="UTF-8"?>
<edges xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/edges_file.xsd">
    <edge id="road_in" from="start" to="traffic_light" numLanes="3" speed="33.33"/>
    <edge id="road_out" from="traffic_light" to="end" numLanes="3" speed="33.33"/>
</edges>
"""

ROUTES_XML = """<?xml version="1.0" encoding="UTF-8"?>
<routes xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/routes_file.xsd">
    <vType id="car" accel="2.6" decel="4.5" sigma="0.5" length="5.0" width="1.8" minGap="2.5" maxSpeed="33.33" guiShape="passenger"/>
    <vType id="truck" accel="1.3" decel="3.5" sigma="0.5" length="10.0" width="2.4" minGap="3.5" maxSpeed="25.0" guiShape="truck"/>
    <vType id="sports" accel="4.2" decel="6.0" sigma="0.2" length="4.6" width="1.9" minGap="2.0" maxSpeed="45.0" guiShape="passenger/sedan"/>
    <vType id="van" accel="2.2" decel="4.2" sigma="0.4" length="5.5" width="2.0" minGap="2.8" maxSpeed="30.0" guiShape="passenger/van"/>
    <route id="route_straight" edges="road_in road_out"/>
</routes>
"""

SUMOCFG_XML = """<?xml version="1.0" encoding="UTF-8"?>
<configuration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/sumoConfiguration.xsd">
    <input>
        <net-file value="road.net.xml"/>
        <route-files value="road.rou.xml"/>
    </input>
    <time>
        <begin value="0"/>
        <end value="100000"/>
        <step-length value="0.05"/>
    </time>
    <processing>
        <collision.action value="none"/>
        <time-to-teleport value="-1"/>
    </processing>
    <report>
        <no-step-log value="true"/>
        <no-warnings value="true"/>
    </report>
</configuration>
"""

def find_sumo_binary(binary_name="netconvert"):
    # 1. Check in PATH
    import shutil
    p = shutil.which(binary_name)
    if p:
        return p
    # 2. Check SUMO_HOME
    sumo_home = os.environ.get("SUMO_HOME", "/Library/Frameworks/EclipseSUMO.framework/Versions/Current/EclipseSUMO/share/sumo")
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
    return None

def build():
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    
    nod_file = CONFIG_DIR / "road.nod.xml"
    edg_file = CONFIG_DIR / "road.edg.xml"
    rou_file = CONFIG_DIR / "road.rou.xml"
    cfg_file = CONFIG_DIR / "road.sumocfg"
    net_file = CONFIG_DIR / "road.net.xml"

    print(f"Writing {nod_file}...")
    nod_file.write_text(NODES_XML, encoding="utf-8")
    
    print(f"Writing {edg_file}...")
    edg_file.write_text(EDGES_XML, encoding="utf-8")
    
    print(f"Writing {rou_file}...")
    rou_file.write_text(ROUTES_XML, encoding="utf-8")
    
    print(f"Writing {cfg_file}...")
    cfg_file.write_text(SUMOCFG_XML, encoding="utf-8")

    netconvert_bin = find_sumo_binary("netconvert")
    if not netconvert_bin:
        raise RuntimeError("netconvert binary could not be found! Ensure SUMO is installed.")
    
    print(f"Compiling network with {netconvert_bin}...")
    cmd = [
        netconvert_bin,
        f"--node-files={nod_file}",
        f"--edge-files={edg_file}",
        f"--output-file={net_file}",
        "--no-warnings=true"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("netconvert failed:", result.stderr)
        sys.exit(result.returncode)
    
    print(f"Successfully generated {net_file}!")

if __name__ == "__main__":
    build()
