export interface Vehicle {
  id: string;
  x: number;            // longitudinal position in meters (0 to 1000)
  y: number;            // lateral position in meters (-9.6 to 0)
  lane_index: number;   // 0: Right, 1: Middle, 2: Left
  lane_id: string;
  speed: number;        // m/s
  speed_kmh: number;    // km/h
  acceleration: number; // m/s^2
  angle: number;        // heading angle in degrees (90 = East)
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
}

export type TrafficSignalColor = 'green' | 'yellow' | 'red';
export type TrafficSignalMode = 'auto' | 'manual';

export interface TrafficLightData {
  id: string;
  x: number;
  state: TrafficSignalColor;
  raw_state: string;
  mode: TrafficSignalMode;
  green_duration: number;
  yellow_duration: number;
  red_duration: number;
  phase_timer: number;
  phase_remaining: number;
  next_state: TrafficSignalColor;
}

export interface TrafficLightSettings {
  mode?: TrafficSignalMode;
  state?: TrafficSignalColor;
  green_duration?: number;
  yellow_duration?: number;
  red_duration?: number;
}

export interface SimulationState {
  sim_time: number;
  step: number;
  is_running: boolean;
  vehicles: Vehicle[];
  stats: SimulationStats;
  traffic_light?: TrafficLightData;
}

export interface LaneInfo {
  id: string;
  index: number;
  name: string;
  width: number;
  y_center: number;
  speed_limit_kmh: number;
}

export interface NetworkInfo {
  road_length: number;
  num_lanes: number;
  lane_width: number;
  traffic_light_x?: number;
  lanes: LaneInfo[];
}

export interface SpawnOptions {
  lane?: number | null;
  speed?: number | null;
  type?: 'car' | 'sports' | 'truck' | 'van';
  color?: string | null;
}

export interface AutoSpawnSettings {
  enabled: boolean;
  rate_per_minute: number;
}

export interface CameraState {
  x: number;       // Center X in road meters (0 to 1000)
  y: number;       // Center Y in road meters (-9.6 to 0)
  zoom: number;    // Pixels per meter
  followingId: string | null;
}

