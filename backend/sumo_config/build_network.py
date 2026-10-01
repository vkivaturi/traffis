import os
import subprocess
import sys
from pathlib import Path

CONFIG_DIR = Path(__file__).parent.resolve()
SCENARIOS_DIR = CONFIG_DIR / "scenarios"

# Common Vehicle Types
VTYPES_XML = """
    <vType id="car" accel="2.6" decel="4.5" sigma="0.5" length="5.0" width="1.8" minGap="2.5" maxSpeed="33.33" guiShape="passenger"/>
    <vType id="truck" accel="1.3" decel="3.5" sigma="0.5" length="10.0" width="2.4" minGap="3.5" maxSpeed="25.0" guiShape="truck"/>
    <vType id="sports" accel="4.2" decel="6.0" sigma="0.2" length="4.6" width="1.9" minGap="2.0" maxSpeed="45.0" guiShape="passenger/sedan"/>
    <vType id="van" accel="2.2" decel="4.2" sigma="0.4" length="5.5" width="2.0" minGap="2.8" maxSpeed="30.0" guiShape="passenger/van"/>
"""

# Scenario 1: Straight Road (1000m Bi-directional Highway, 2 lanes per direction)
STRAIGHT_NODES = """<?xml version="1.0" encoding="UTF-8"?>
<nodes xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/nodes_file.xsd">
    <node id="start" x="0.0" y="0.0" type="priority"/>
    <node id="traffic_light" x="500.0" y="0.0" type="traffic_light"/>
    <node id="end" x="1000.0" y="0.0" type="priority"/>
</nodes>
"""

STRAIGHT_EDGES = """<?xml version="1.0" encoding="UTF-8"?>
<edges xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/edges_file.xsd">
    <edge id="road_east_in" from="start" to="traffic_light" numLanes="2" speed="33.33" width="3.2"/>
    <edge id="road_east_out" from="traffic_light" to="end" numLanes="2" speed="33.33" width="3.2"/>
    <edge id="road_west_in" from="end" to="traffic_light" numLanes="2" speed="33.33" width="3.2"/>
    <edge id="road_west_out" from="traffic_light" to="start" numLanes="2" speed="33.33" width="3.2"/>
</edges>
"""

STRAIGHT_ROUTES = f"""<?xml version="1.0" encoding="UTF-8"?>
<routes xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/routes_file.xsd">
{VTYPES_XML}
    <route id="route_east" edges="road_east_in road_east_out"/>
    <route id="route_west" edges="road_west_in road_west_out"/>
    <route id="route_straight" edges="road_east_in road_east_out"/>
</routes>
"""

STRAIGHT_SUMOCFG = """<?xml version="1.0" encoding="UTF-8"?>
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

# Scenario 2: 3-Way T-Intersection (2 lanes per direction on each of the 3 arms)
THREE_WAY_NODES = """<?xml version="1.0" encoding="UTF-8"?>
<nodes xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/nodes_file.xsd">
    <node id="west" x="-250.0" y="0.0" type="priority"/>
    <node id="center" x="0.0" y="0.0" type="traffic_light"/>
    <node id="east" x="250.0" y="0.0" type="priority"/>
    <node id="north" x="0.0" y="250.0" type="priority"/>
</nodes>
"""

THREE_WAY_EDGES = """<?xml version="1.0" encoding="UTF-8"?>
<edges xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/edges_file.xsd">
    <!-- West Arm (2 lanes inbound, 2 lanes outbound) -->
    <edge id="west_in" from="west" to="center" numLanes="2" speed="16.67" width="3.2"/>
    <edge id="west_out" from="center" to="west" numLanes="2" speed="16.67" width="3.2"/>

    <!-- East Arm (2 lanes inbound, 2 lanes outbound) -->
    <edge id="east_in" from="east" to="center" numLanes="2" speed="16.67" width="3.2"/>
    <edge id="east_out" from="center" to="east" numLanes="2" speed="16.67" width="3.2"/>

    <!-- North Arm (2 lanes inbound, 2 lanes outbound) -->
    <edge id="north_in" from="north" to="center" numLanes="2" speed="16.67" width="3.2"/>
    <edge id="north_out" from="center" to="north" numLanes="2" speed="16.67" width="3.2"/>
</edges>
"""

THREE_WAY_ROUTES = f"""<?xml version="1.0" encoding="UTF-8"?>
<routes xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/routes_file.xsd">
{VTYPES_XML}
    <!-- Routes from West approach -->
    <route id="route_west_east" edges="west_in east_out"/>
    <route id="route_west_north" edges="west_in north_out"/>

    <!-- Routes from East approach -->
    <route id="route_east_west" edges="east_in west_out"/>
    <route id="route_east_north" edges="east_in north_out"/>

    <!-- Routes from North approach -->
    <route id="route_north_west" edges="north_in west_out"/>
    <route id="route_north_east" edges="north_in east_out"/>
</routes>
"""

THREE_WAY_SUMOCFG = """<?xml version="1.0" encoding="UTF-8"?>
<configuration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/sumoConfiguration.xsd">
    <input>
        <net-file value="intersection.net.xml"/>
        <route-files value="intersection.rou.xml"/>
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
    import shutil
    p = shutil.which(binary_name)
    if p:
        return p
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


def compile_network(nod_path: Path, edg_path: Path, net_path: Path, disable_offset_normalization: bool = False):
    netconvert_bin = find_sumo_binary("netconvert")
    if not netconvert_bin:
        raise RuntimeError("netconvert binary could not be found! Ensure SUMO is installed.")
    
    cmd = [
        netconvert_bin,
        f"--node-files={nod_path}",
        f"--edge-files={edg_path}",
        f"--output-file={net_path}",
        "--no-turnarounds=true",
        "--no-warnings=true",
        "--lefthand=true"
    ]
    if disable_offset_normalization:
        cmd.append("--offset.disable-normalization=true")

    print(f"Compiling {net_path.name} with {netconvert_bin}...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("netconvert failed:", result.stderr)
        sys.exit(result.returncode)
    print(f"Successfully generated {net_path}!")


def build_straight_road():
    # Build in SCENARIOS_DIR / straight_road
    target_dir = SCENARIOS_DIR / "straight_road"
    target_dir.mkdir(parents=True, exist_ok=True)
    
    nod = target_dir / "road.nod.xml"
    edg = target_dir / "road.edg.xml"
    rou = target_dir / "road.rou.xml"
    cfg = target_dir / "road.sumocfg"
    net = target_dir / "road.net.xml"
    
    nod.write_text(STRAIGHT_NODES, encoding="utf-8")
    edg.write_text(STRAIGHT_EDGES, encoding="utf-8")
    rou.write_text(STRAIGHT_ROUTES, encoding="utf-8")
    cfg.write_text(STRAIGHT_SUMOCFG, encoding="utf-8")
    compile_network(nod, edg, net)
    
    # Also replicate into root CONFIG_DIR for backward compatibility
    root_nod = CONFIG_DIR / "road.nod.xml"
    root_edg = CONFIG_DIR / "road.edg.xml"
    root_rou = CONFIG_DIR / "road.rou.xml"
    root_cfg = CONFIG_DIR / "road.sumocfg"
    root_net = CONFIG_DIR / "road.net.xml"
    root_nod.write_text(STRAIGHT_NODES, encoding="utf-8")
    root_edg.write_text(STRAIGHT_EDGES, encoding="utf-8")
    root_rou.write_text(STRAIGHT_ROUTES, encoding="utf-8")
    root_cfg.write_text(STRAIGHT_SUMOCFG, encoding="utf-8")
    compile_network(root_nod, root_edg, root_net)


def build_three_way_intersection():
    target_dir = SCENARIOS_DIR / "three_way_intersection"
    target_dir.mkdir(parents=True, exist_ok=True)
    
    nod = target_dir / "intersection.nod.xml"
    edg = target_dir / "intersection.edg.xml"
    rou = target_dir / "intersection.rou.xml"
    cfg = target_dir / "intersection.sumocfg"
    net = target_dir / "intersection.net.xml"
    
    nod.write_text(THREE_WAY_NODES, encoding="utf-8")
    edg.write_text(THREE_WAY_EDGES, encoding="utf-8")
    rou.write_text(THREE_WAY_ROUTES, encoding="utf-8")
    cfg.write_text(THREE_WAY_SUMOCFG, encoding="utf-8")
    compile_network(nod, edg, net, disable_offset_normalization=True)


def build():
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    SCENARIOS_DIR.mkdir(parents=True, exist_ok=True)
    print("Building scenario 1: Straight Road...")
    build_straight_road()
    print("Building scenario 2: 3-Way Intersection...")
    build_three_way_intersection()
    print("All road networks built successfully!")


if __name__ == "__main__":
    build()
