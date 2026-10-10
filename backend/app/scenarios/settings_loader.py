"""Loader for per-scenario runtime settings defined in `scenario.xml`.

Every scenario directory under `sumo_config/scenarios/<id>/` contains a
`scenario.xml` file which is the single source of truth for traffic demand,
cruising speed, vehicle mix and traffic signal timings. The UI no longer
exposes any of these knobs — edit the XML and restart / reset the simulation.
"""
import logging
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List

logger = logging.getLogger("scenario_settings")


@dataclass
class PhaseSettings:
    name: str
    state: str          # logical state: "green" | "yellow" | "red"
    raw: str            # SUMO red/yellow/green link string
    duration: float     # seconds
    group: str = ""     # signal group id (approach) this phase belongs to


@dataclass
class ScenarioSettings:
    max_sim_time: float = 300.0
    default_speed_kmh: float = 50.0
    vehicles_per_hour: float = 1500.0
    vehicle_mix: Dict[str, float] = field(default_factory=lambda: {"car": 0.6, "sports": 0.15, "van": 0.15, "truck": 0.1})
    origin_weights: Dict[str, float] = field(default_factory=dict)
    destination_weights: Dict[str, Dict[str, float]] = field(default_factory=dict)
    signal_group_names: Dict[str, str] = field(default_factory=dict)
    phases: List[PhaseSettings] = field(default_factory=list)


def _f(el: ET.Element, attr: str, default: float) -> float:
    try:
        return float(el.get(attr, default))
    except (TypeError, ValueError):
        return default


def load_scenario_settings(path: Path) -> ScenarioSettings:
    s = ScenarioSettings()
    if not path.exists():
        logger.warning("Scenario settings file not found: %s (using defaults)", path)
        return s

    root = ET.parse(path).getroot()

    sim = root.find("simulation")
    if sim is not None:
        s.max_sim_time = _f(sim, "maxSimTime", s.max_sim_time)

    traffic = root.find("traffic")
    if traffic is not None:
        s.default_speed_kmh = _f(traffic, "defaultSpeedKmh", s.default_speed_kmh)
        s.vehicles_per_hour = _f(traffic, "vehiclesPerHour", s.vehicles_per_hour)

        mix = {v.get("type"): _f(v, "weight", 0.0) for v in traffic.findall("vehicleMix/vehicle") if v.get("type")}
        if mix:
            s.vehicle_mix = mix

        origins = {}
        destinations = {}
        for o in traffic.findall("origins/origin"):
            oid = o.get("id")
            if not oid:
                continue
            origins[oid] = _f(o, "weight", 1.0)
            dests = {}
            for d in o.findall("destination"):
                did = d.get("id")
                if did:
                    dests[did] = _f(d, "weight", 1.0)
            if dests:
                destinations[oid] = dests

        if origins:
            s.origin_weights = origins
        if destinations:
            s.destination_weights = destinations

    tl = root.find("trafficLight")
    if tl is not None:
        amber = _f(tl, "amberDuration", 3.0)
        for g in tl.findall("signalGroup"):
            gid = g.get("id", "")
            s.signal_group_names[gid] = g.get("name", gid)
            green_raw = g.get("greenState")
            if green_raw:
                s.phases.append(PhaseSettings(
                    name=f"{s.signal_group_names[gid]} Green", state="green",
                    raw=green_raw, duration=_f(g, "greenDuration", 30.0), group=gid))
            amber_raw = g.get("amberState")
            if amber_raw:
                s.phases.append(PhaseSettings(
                    name=f"{s.signal_group_names[gid]} Amber", state="yellow",
                    raw=amber_raw, duration=_f(g, "amberDuration", amber), group=gid))
            red_raw = g.get("redState")
            if red_raw:
                s.phases.append(PhaseSettings(
                    name=f"{s.signal_group_names[gid]} Red", state="red",
                    raw=red_raw, duration=_f(g, "redDuration", 30.0), group=gid))

    logger.info("Loaded scenario settings from %s: %.0f veh/h @ %.0f km/h, %d signal phases",
                path, s.vehicles_per_hour, s.default_speed_kmh, len(s.phases))
    return s
