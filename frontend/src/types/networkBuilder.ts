import type { NetworkGeometry } from './simulation';

export type DriveSide = 'left' | 'right';
export type JunctionType = 'priority' | 'right_before_left' | 'allway_stop' | 'traffic_light';
export type ObstacleKind = 'blockage' | 'lane_closure';
export type RoadDirection = 'forward' | 'backward';

export interface NetworkSettings {
  drive_side: DriveSide;
  default_speed_kmh: number;
  lane_width_m: number;
}

export interface JunctionDef {
  id: string;
  x: number;
  y: number;
  type: JunctionType;
  label?: string | null;
}

export interface RoadDef {
  id: string;
  from: string;
  to: string;
  lanes: number;
  lanes_back: number;
  speed_kmh?: number | null;
  points: [number, number][];
  name?: string | null;
}

export interface SignalPhaseDef {
  approaches: string[];
  green_s: number;
  name?: string | null;
}

export interface SignalPlanDef {
  junction: string;
  amber_s: number;
  all_red_s: number;
  offset_s: number;
  phases: SignalPhaseDef[];
}

export interface FlowDef {
  id: string;
  from: string;
  to: string;
  vehs_per_hour: number;
}

export interface DemandDef {
  vehicle_mix: Record<string, number>;
  flows: FlowDef[];
}

export interface ObstacleDef {
  id: string;
  kind: ObstacleKind;
  road: string;
  direction: RoadDirection;
  lane: number;
  position_m?: number | null;
  length_m?: number | null;
  label?: string | null;
}

export interface NetworkProject {
  schema_version: 1;
  id: string;
  name: string;
  description: string;
  settings: NetworkSettings;
  junctions: JunctionDef[];
  roads: RoadDef[];
  signals: SignalPlanDef[];
  demand: DemandDef;
  obstacles: ObstacleDef[];
}

export interface NetworkRecord {
  id: string;
  scenario_id: string;
  name: string;
  description: string;
  read_only: boolean;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  element_type?: string | null;
  element_id?: string | null;
}

export interface ValidationResponse {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: string[];
}

export interface PreviewResponse extends ValidationResponse {
  geometry: NetworkGeometry | null;
}

export interface SaveNetworkResponse {
  status: string;
  id: string;
  scenario_id: string;
  from_cache: boolean;
  warnings: string[];
  project: NetworkProject;
}

export type EditorTool = 'select' | 'junction' | 'road' | 'shape_point' | 'delete';

export type EditorSelection =
  | { kind: 'junction'; id: string }
  | { kind: 'road'; id: string }
  | { kind: 'shape_point'; roadId: string; index: number }
  | null;
