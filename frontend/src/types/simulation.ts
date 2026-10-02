export interface Vehicle {
  id: string;
  x: number;            // longitudinal position in meters
  y: number;            // lateral position in meters
  direction?: 'east' | 'west' | 'north' | 'south'; // Travel direction
  lane_index: number;   // 0: Right (Slow), 1: Left (Fast)
  lane_id: string;
  speed: number;        // m/s
  speed_kmh: number;    // km/h
  acceleration: number; // m/s^2
  angle: number;        // heading angle in degrees (90 = East, 270 = West, 180 = South, 0/360 = North)
  type: string;         // 'car' | 'sports' | 'truck' | 'van'
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

export interface TrafficLightSettings {
  mode?: TrafficSignalMode;
  state?: TrafficSignalColor;
  green_duration?: number;
  yellow_duration?: number;
  red_duration?: number;
  green_durations?: Record<string, number>;
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
  default_speed_kmh?: number;
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
}

export interface SpawnOptions {
  direction?: string;
  origin?: string;
  turn?: 'straight' | 'left' | 'right' | 'random';
  lane?: number | null;
  speed?: number | null;
  type?: 'car' | 'sports' | 'truck' | 'van';
  color?: string | null;
}

export interface AutoSpawnSettings {
  enabled: boolean;
  rate_per_minute: number;
  rate_per_hour?: number;
}

export interface CameraState {
  x: number;       // Center X in road meters
  y: number;       // Center Y in road meters
  zoom: number;    // Pixels per meter
  followingId: string | null;
}
