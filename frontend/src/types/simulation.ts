export interface Vehicle {
  id: string;
  x: number;            // longitudinal position in meters
  y: number;            // lateral position in meters
  direction?: string;   // Travel direction ('east' | 'west' | 'north' | 'south') or O-D key (e.g. 'TL_NG')
  lane_index: number;   // 0: Right (Slow), 1: Left (Fast)
  lane_id: string;
  speed: number;        // m/s
  speed_kmh: number;    // km/h
  acceleration: number; // m/s^2
  angle: number;        // heading angle in degrees (90 = East, 270 = West, 180 = South, 0/360 = North)
  type: string;         // 'car' | 'sports' | 'truck' | 'van' | 'motorcycle' | 'auto_rickshaw' | 'bus'
  color: string;        // Hex color
  length: number;       // meters
  width: number;        // meters
  leader_id?: string | null;
  leader_dist?: number | null;
}

export interface SimulationStats {
  active_vehicles: number;
  total_spawned: number;
  total_arrived: number;
  avg_speed_kmh: number;
  density_veh_km: number;
  pce_per_hour?: number;
}

export type TrafficSignalColor = 'green' | 'yellow' | 'red';
export type TrafficSignalMode = 'auto' | 'manual';

export interface SignalGroupTiming {
  id: string;
  name: string;
  green_duration: number;
  amber_duration: number;
  calculated_red_duration: number;
  is_active_green: boolean;
}

export interface TrafficLightData {
  id: string;
  x: number;
  y?: number;
  state: TrafficSignalColor;
  raw_state: string;
  mode: TrafficSignalMode;
  green_duration: number;
  yellow_duration: number;
  red_duration: number;
  phase_timer: number;
  phase_remaining: number;
  next_state: TrafficSignalColor;
  phase_index?: number;
  phase_name?: string;
  signal_groups?: SignalGroupTiming[];
}

export interface SimulationState {
  sim_time: number;
  step: number;
  is_running: boolean;
  scenario_id?: string;
  vehicles: Vehicle[];
  compact_vehicles?: (string | number | null)[][];
  stats: SimulationStats;
  traffic_light?: TrafficLightData;
  junction_metrics?: JunctionMetrics;
  default_speed_kmh?: number;
  max_sim_time?: number;
  time_limit_reached?: boolean;
}

export interface LaneInfo {
  id: string;
  index: number;
  direction?: string;
  arm?: string;
  name: string;
  width: number;
  y_center?: number;
  speed_limit_kmh: number;
}

export interface SpawnOriginInfo {
  id: string;
  label: string;
  description: string;
}

export interface ScenarioMetadata {
  id: string;
  name: string;
  description: string;
  type: 'straight' | 'intersection' | string;
  bounds: {
    min_x: number;
    max_x: number;
    min_y: number;
    max_y: number;
  };
  default_camera: {
    x: number;
    y: number;
    zoom: number;
  };
  spawn_origins: SpawnOriginInfo[];
}

export interface RoadArmInfo {
  id: string;
  name: string;
  direction: string;
  x_start: number;
  y_start: number;
  x_end: number;
  y_end: number;
  num_lanes_inbound: number;
  num_lanes_outbound: number;
}

export interface NetworkInfo {
  scenario: ScenarioMetadata;
  road_length: number;
  num_lanes: number;
  num_lanes_per_dir?: number;
  lane_width: number;
  traffic_light_x?: number;
  traffic_light_y?: number;
  lanes: LaneInfo[];
  arms?: RoadArmInfo[];
  geometry?: NetworkGeometry;
}

export type Point = [number, number];

export interface LaneShape {
  id: string;
  edge: string;
  index: number;       // left-hand traffic: 0 = kerb side, highest = median side
  width: number;
  speed_limit_kmh: number;
  shape: Point[];      // polyline in world metres, in driving direction
}

export interface JunctionShape {
  id: string;
  shape: Point[];
}

export interface MedianShape {
  id: string;
  width: number;
  shape: Point[];
}

export interface ArmLabel {
  id: string;          // 'NG' | 'TL' | 'FL'
  name: string;        // full name, shown on hover
  x: number;
  y: number;
  description?: string;
}

export interface RoundaboutInfo {
  x: number;
  y: number;
  island_radius: number;
  outer_radius: number;
}

export interface NetworkGeometry {
  lanes: LaneShape[];
  connectors?: LaneShape[]; // internal junction lanes (turn paths), asphalt only
  junctions: JunctionShape[];
  paved_areas?: JunctionShape[]; // extra asphalt polygons (e.g. median U-turn opening)
  medians: MedianShape[];
  labels: ArmLabel[];
  roundabout?: RoundaboutInfo | null;
  yield_lanes: string[];
  bounds: { min_x: number; max_x: number; min_y: number; max_y: number };
}

export interface ArmFlowMetrics {
  id: string;
  name: string;
  inflow: number;
  outflow: number;
  avg_delay_s?: number | null;
}

export interface ODMetrics {
  key: string;
  configured_vph: number;
  arrived: number;
  throughput_vph: number;
}

export interface EntryQueue {
  id: string;
  label: string;
  halting: number;
}

export interface JunctionMetrics {
  arms: ArmFlowMetrics[];
  od: ODMetrics[];
  entry_queues: EntryQueue[];
  roundabout_occupancy: number;
  uturn_count: number;
  teleports: number;
}

export interface CameraState {
  x: number;       // Center X in road meters
  y: number;       // Center Y in road meters
  zoom: number;    // Pixels per meter
  followingId: string | null;
}
