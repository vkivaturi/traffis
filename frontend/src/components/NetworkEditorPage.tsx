import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  MousePointer2,
  PlusCircle,
  Spline,
  Waypoints,
  Trash2,
  Undo2,
  Redo2,
  Magnet,
  Layers,
  CheckCircle2,
  Save,
  Play,
  FilePlus2,
  Upload,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlertCircle,
  AlertTriangle,
  Plus,
} from 'lucide-react';
import type {
  EditorSelection,
  EditorTool,
  FlowDef,
  JunctionDef,
  JunctionType,
  NetworkProject,
  NetworkRecord,
  RoadDef,
  ValidationIssue,
} from '../types/networkBuilder';
import type { NetworkGeometry } from '../types/simulation';
import {
  NetworkApiError,
  deleteNetwork,
  getNetwork,
  listNetworks,
  previewNetworkGeometry,
  saveNetwork,
  validateNetworkProject,
} from '../utils/networkApi';
import { renderGeometryNetwork } from '../utils/geometryRenderer';
import './NetworkEditorPage.css';

interface NetworkEditorPageProps {
  onBackToSimulator: () => void;
  onRunScenario: (scenarioId: string) => Promise<void> | void;
}

const GRID_STEP_M = 10;

function createBlankProject(id = 'my_network', name = 'My Network'): NetworkProject {
  return {
    schema_version: 1,
    id,
    name,
    description: '',
    settings: {
      drive_side: 'left',
      default_speed_kmh: 50,
      lane_width_m: 3.2,
    },
    junctions: [
      { id: 'W', x: -150, y: 0, type: 'priority', label: 'West' },
      { id: 'E', x: 150, y: 0, type: 'priority', label: 'East' },
    ],
    roads: [
      {
        id: 'W_E',
        from: 'W',
        to: 'E',
        lanes: 2,
        lanes_back: 2,
        speed_kmh: 50,
        points: [],
        name: 'Main Road',
      },
    ],
    signals: [],
    demand: {
      vehicle_mix: { car: 0.7, motorcycle: 0.2, van: 0.1 },
      flows: [
        { id: 'W_to_E', from: 'W', to: 'E', vehs_per_hour: 400 },
        { id: 'E_to_W', from: 'E', to: 'W', vehs_per_hour: 400 },
      ],
    },
    obstacles: [],
  };
}

function getRoadPolyline(road: RoadDef, junctionsById: Map<string, JunctionDef>): [number, number][] {
  const a = junctionsById.get(road.from);
  const b = junctionsById.get(road.to);
  if (!a || !b) return [];
  return [[a.x, a.y], ...road.points, [b.x, b.y]];
}

function polylineLength(pts: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    sum += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  }
  return sum;
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): { dist: number; t: number; projX: number; projY: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return { dist: Math.hypot(px - ax, py - ay), t: 0, projX: ax, projY: ay };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return { dist: Math.hypot(px - projX, py - projY), t, projX, projY };
}

function nextUniqueId(prefix: string, existing: Set<string>): string {
  let n = 1;
  while (existing.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

function computeNiceScaleMeters(zoom: number): { meters: number; pixels: number } {
  const candidates = [5, 10, 20, 25, 50, 100, 200, 500, 1000];
  for (const m of candidates) {
    const px = m * zoom;
    if (px >= 60 && px <= 160) return { meters: m, pixels: px };
  }
  const fallback = zoom > 1 ? 10 : 200;
  return { meters: fallback, pixels: fallback * zoom };
}

export const NetworkEditorPage: React.FC<NetworkEditorPageProps> = ({
  onBackToSimulator,
  onRunScenario,
}) => {
  // Saved networks list
  const [records, setRecords] = useState<NetworkRecord[]>([]);
  const [project, setProject] = useState<NetworkProject>(() => createBlankProject());
  const [historyPast, setHistoryPast] = useState<NetworkProject[]>([]);
  const [historyFuture, setHistoryFuture] = useState<NetworkProject[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Tool & selection state
  const [tool, setTool] = useState<EditorTool>('select');
  const [selection, setSelection] = useState<EditorSelection>(null);
  const [roadStartJunctionId, setRoadStartJunctionId] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(true);

  // Camera (world coords: Y-up, matching SUMO & CanvasView)
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1.8 });
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 600 });
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredJunctionId, setHoveredJunctionId] = useState<string | null>(null);

  // Validation, save & compiled geometry preview
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'validate' | 'save' | 'run' | 'preview' | null>(null);
  const [showCompiledPreview, setShowCompiledPreview] = useState(false);
  const [previewGeometry, setPreviewGeometry] = useState<NetworkGeometry | null>(null);

  // Canvas & interaction refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<
    | { mode: 'pan'; startX: number; startY: number; camX: number; camY: number }
    | { mode: 'junction'; id: string; moved: boolean; before: NetworkProject }
    | { mode: 'shape_point'; roadId: string; index: number; moved: boolean; before: NetworkProject }
    | null
  >(null);

  const junctionsById = useMemo(
    () => new Map(project.junctions.map((j) => [j.id, j])),
    [project.junctions]
  );

  const errorElementIds = useMemo(() => {
    const set = new Set<string>();
    for (const iss of issues) {
      if (iss.element_id) set.add(iss.element_id);
    }
    return set;
  }, [issues]);

  const boundaryJunctions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of project.junctions) counts.set(j.id, 0);
    for (const r of project.roads) {
      counts.set(r.from, (counts.get(r.from) ?? 0) + 1);
      counts.set(r.to, (counts.get(r.to) ?? 0) + 1);
    }
    return project.junctions.filter((j) => counts.get(j.id) === 1);
  }, [project.junctions, project.roads]);

  const activeRecord = useMemo(
    () => records.find((r) => r.id === project.id) ?? null,
    [records, project.id]
  );

  // Push a mutation onto undo history
  const commitProject = useCallback((updater: (prev: NetworkProject) => NetworkProject) => {
    setProject((prev) => {
      const next = updater(prev);
      setHistoryPast((past) => [...past.slice(-49), prev]);
      setHistoryFuture([]);
      setIsDirty(true);
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    setHistoryPast((past) => {
      if (past.length === 0) return past;
      const previous = past[past.length - 1];
      setHistoryFuture((fut) => [project, ...fut]);
      setProject(previous);
      setIsDirty(true);
      return past.slice(0, -1);
    });
  }, [project]);

  const handleRedo = useCallback(() => {
    setHistoryFuture((fut) => {
      if (fut.length === 0) return fut;
      const next = fut[0];
      setHistoryPast((past) => [...past, project]);
      setProject(next);
      setIsDirty(true);
      return fut.slice(1);
    });
  }, [project]);

  const fitToNetwork = useCallback((proj: NetworkProject) => {
    if (proj.junctions.length === 0) {
      setCamera({ x: 0, y: 0, zoom: 1.8 });
      return;
    }
    const xs = proj.junctions.map((j) => j.x);
    const ys = proj.junctions.map((j) => j.y);
    for (const r of proj.roads) {
      for (const p of r.points) {
        xs.push(p[0]);
        ys.push(p[1]);
      }
    }
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const span = Math.max(maxX - minX + 100, maxY - minY + 100, 140);
    const canvasW = containerRef.current?.clientWidth || 900;
    const canvasH = containerRef.current?.clientHeight || 600;
    const zoom = Math.max(0.4, Math.min(5.0, Math.min(canvasW, canvasH) / span));
    setCamera({ x: cx, y: cy, zoom });
  }, []);

  // Load network list & open demo_corridor on first mount
  const refreshRecords = useCallback(async () => {
    try {
      const list = await listNetworks();
      setRecords(list);
      return list;
    } catch (e) {
      console.warn('Could not load networks list:', e);
      return [];
    }
  }, []);

  const loadNetworkById = useCallback(
    async (networkId: string) => {
      try {
        const loaded = await getNetwork(networkId);
        setProject(loaded);
        setHistoryPast([]);
        setHistoryFuture([]);
        setIsDirty(false);
        setSelection(null);
        setRoadStartJunctionId(null);
        setIssues([]);
        setWarnings([]);
        setPreviewGeometry(null);
        setStatusMessage(`Loaded '${loaded.name}'`);
        fitToNetwork(loaded);
      } catch (e) {
        setStatusMessage(e instanceof Error ? e.message : String(e));
      }
    },
    [fitToNetwork]
  );

  useEffect(() => {
    let active = true;
    // oxlint-disable-next-line react/set-state-in-effect
    refreshRecords().then((list) => {
      if (!active || list.length === 0) return;
      const preferred = list.find((r) => r.id === 'demo_corridor') ?? list[0];
      void loadNetworkById(preferred.id);
    });
    return () => {
      active = false;
    };
  }, [refreshRecords, loadNetworkById]);

  // Coordinate conversions
  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const canvas = canvasRef.current;
      const w = canvas ? canvas.clientWidth : 800;
      const h = canvas ? canvas.clientHeight : 600;
      const wx = (sx - w / 2) / camera.zoom + camera.x;
      const wy = -(sy - h / 2) / camera.zoom + camera.y;
      return { x: wx, y: wy };
    },
    [camera]
  );

  const snapCoord = useCallback(
    (v: number) => (snapToGrid ? Math.round(v / GRID_STEP_M) * GRID_STEP_M : Math.round(v * 10) / 10),
    [snapToGrid]
  );

  // Delete currently selected item or specific item
  const deleteElement = useCallback(
    (target: EditorSelection) => {
      if (!target) return;
      if (target.kind === 'junction') {
        commitProject((prev) => {
          const removedRoads = new Set(
            prev.roads
              .filter((r) => r.from === target.id || r.to === target.id)
              .map((r) => r.id)
          );
          return {
            ...prev,
            junctions: prev.junctions.filter((j) => j.id !== target.id),
            roads: prev.roads.filter((r) => !removedRoads.has(r.id)),
            signals: prev.signals
              .filter((s) => s.junction !== target.id)
              .map((s) => ({
                ...s,
                phases: s.phases.map((p) => ({
                  ...p,
                  approaches: p.approaches.filter((a) => !removedRoads.has(a)),
                })),
              })),
            demand: {
              ...prev.demand,
              flows: prev.demand.flows.filter(
                (f) => f.from !== target.id && f.to !== target.id
              ),
            },
            obstacles: prev.obstacles.filter((o) => !removedRoads.has(o.road)),
          };
        });
        setSelection(null);
      } else if (target.kind === 'road') {
        commitProject((prev) => ({
          ...prev,
          roads: prev.roads.filter((r) => r.id !== target.id),
          signals: prev.signals.map((s) => ({
            ...s,
            phases: s.phases.map((p) => ({
              ...p,
              approaches: p.approaches.filter((a) => a !== target.id),
            })),
          })),
          obstacles: prev.obstacles.filter((o) => o.road !== target.id),
        }));
        setSelection(null);
      } else if (target.kind === 'shape_point') {
        commitProject((prev) => ({
          ...prev,
          roads: prev.roads.map((r) =>
            r.id === target.roadId
              ? { ...r, points: r.points.filter((_, idx) => idx !== target.index) }
              : r
          ),
        }));
        setSelection({ kind: 'road', id: target.roadId });
      }
    },
    [commitProject]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (e.key === 'Escape') {
        setRoadStartJunctionId(null);
        setTool('select');
      } else if (e.key === 'v' || e.key === 'V') {
        setTool('select');
        setRoadStartJunctionId(null);
      } else if (e.key === 'j' || e.key === 'J') {
        setTool('junction');
        setRoadStartJunctionId(null);
      } else if (e.key === 'r' || e.key === 'R') {
        setTool('road');
      } else if (e.key === 'p' || e.key === 'P') {
        setTool('shape_point');
        setRoadStartJunctionId(null);
      } else if (e.key === 'x' || e.key === 'X') {
        setTool('delete');
        setRoadStartJunctionId(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        e.preventDefault();
        deleteElement(selection);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, selection, deleteElement]);

  // Hit-testing in world coordinates
  const hitTest = useCallback(
    (wx: number, wy: number) => {
      const hitRadiusM = Math.max(8, 14 / camera.zoom);

      // 1. Junctions
      for (const j of project.junctions) {
        if (Math.hypot(wx - j.x, wy - j.y) <= hitRadiusM) {
          return { kind: 'junction' as const, id: j.id };
        }
      }

      // 2. Shape points on roads
      for (const r of project.roads) {
        for (let idx = 0; idx < r.points.length; idx++) {
          const [px, py] = r.points[idx];
          if (Math.hypot(wx - px, wy - py) <= hitRadiusM * 0.85) {
            return { kind: 'shape_point' as const, roadId: r.id, index: idx };
          }
        }
      }

      // 3. Roads (segments)
      let bestRoad: { id: string; segIdx: number; dist: number; projX: number; projY: number } | null = null;
      for (const r of project.roads) {
        const pts = getRoadPolyline(r, junctionsById);
        for (let i = 0; i < pts.length - 1; i++) {
          const res = distToSegment(wx, wy, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
          if (res.dist <= hitRadiusM && (!bestRoad || res.dist < bestRoad.dist)) {
            bestRoad = { id: r.id, segIdx: i, ...res };
          }
        }
      }
      if (bestRoad) {
        return { kind: 'road' as const, ...bestRoad };
      }
      return null;
    },
    [project.junctions, project.roads, junctionsById, camera.zoom]
  );

  // Mouse handlers on canvas
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    // Middle or right mouse button -> pan
    if (e.button === 1 || e.button === 2 || e.altKey) {
      dragRef.current = { mode: 'pan', startX: e.clientX, startY: e.clientY, camX: camera.x, camY: camera.y };
      return;
    }

    const hit = hitTest(world.x, world.y);

    if (tool === 'junction') {
      const existing = new Set(project.junctions.map((j) => j.id));
      const newId = nextUniqueId('J', existing);
      const newJ: JunctionDef = {
        id: newId,
        x: snapCoord(world.x),
        y: snapCoord(world.y),
        type: 'priority',
        label: newId,
      };
      commitProject((prev) => ({ ...prev, junctions: [...prev.junctions, newJ] }));
      setSelection({ kind: 'junction', id: newId });
      return;
    }

    if (tool === 'road') {
      if (hit && hit.kind === 'junction') {
        if (!roadStartJunctionId) {
          setRoadStartJunctionId(hit.id);
          setSelection({ kind: 'junction', id: hit.id });
        } else if (roadStartJunctionId !== hit.id) {
          const existing = new Set(project.roads.map((r) => r.id));
          const candidate = `${roadStartJunctionId}_${hit.id}`;
          const newId = existing.has(candidate) ? nextUniqueId('R', existing) : candidate;
          const newRoad: RoadDef = {
            id: newId,
            from: roadStartJunctionId,
            to: hit.id,
            lanes: 2,
            lanes_back: 2,
            speed_kmh: project.settings.default_speed_kmh,
            points: [],
            name: newId,
          };
          commitProject((prev) => ({ ...prev, roads: [...prev.roads, newRoad] }));
          setSelection({ kind: 'road', id: newId });
          setRoadStartJunctionId(null);
        }
      } else {
        setRoadStartJunctionId(null);
      }
      return;
    }

    if (tool === 'shape_point') {
      if (hit && hit.kind === 'road') {
        const pt: [number, number] = [snapCoord(hit.projX), snapCoord(hit.projY)];
        commitProject((prev) => ({
          ...prev,
          roads: prev.roads.map((r) => {
            if (r.id !== hit.id) return r;
            const nextPts = [...r.points];
            nextPts.splice(hit.segIdx, 0, pt);
            return { ...r, points: nextPts };
          }),
        }));
        setSelection({ kind: 'shape_point', roadId: hit.id, index: hit.segIdx });
      }
      return;
    }

    if (tool === 'delete') {
      if (hit) {
        if (hit.kind === 'junction') deleteElement({ kind: 'junction', id: hit.id });
        else if (hit.kind === 'road') deleteElement({ kind: 'road', id: hit.id });
        else if (hit.kind === 'shape_point')
          deleteElement({ kind: 'shape_point', roadId: hit.roadId, index: hit.index });
      }
      return;
    }

    // Select tool
    if (hit && hit.kind === 'junction') {
      setSelection({ kind: 'junction', id: hit.id });
      dragRef.current = { mode: 'junction', id: hit.id, moved: false, before: project };
    } else if (hit && hit.kind === 'shape_point') {
      setSelection({ kind: 'shape_point', roadId: hit.roadId, index: hit.index });
      dragRef.current = {
        mode: 'shape_point',
        roadId: hit.roadId,
        index: hit.index,
        moved: false,
        before: project,
      };
    } else if (hit && hit.kind === 'road') {
      setSelection({ kind: 'road', id: hit.id });
    } else {
      setSelection(null);
      dragRef.current = { mode: 'pan', startX: e.clientX, startY: e.clientY, camX: camera.x, camY: camera.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);
    setCursorWorld({ x: Math.round(world.x * 10) / 10, y: Math.round(world.y * 10) / 10 });

    const drag = dragRef.current;
    if (drag) {
      if (drag.mode === 'pan') {
        const dx = (e.clientX - drag.startX) / camera.zoom;
        const dy = -(e.clientY - drag.startY) / camera.zoom;
        setCamera((c) => ({ ...c, x: drag.camX - dx, y: drag.camY - dy }));
      } else if (drag.mode === 'junction') {
        drag.moved = true;
        const nx = snapCoord(world.x);
        const ny = snapCoord(world.y);
        setProject((prev) => ({
          ...prev,
          junctions: prev.junctions.map((j) => (j.id === drag.id ? { ...j, x: nx, y: ny } : j)),
        }));
      } else if (drag.mode === 'shape_point') {
        drag.moved = true;
        const nx = snapCoord(world.x);
        const ny = snapCoord(world.y);
        setProject((prev) => ({
          ...prev,
          roads: prev.roads.map((r) =>
            r.id === drag.roadId
              ? {
                  ...r,
                  points: r.points.map((pt, idx) => (idx === drag.index ? [nx, ny] : pt)),
                }
              : r
          ),
        }));
      }
      return;
    }

    const hit = hitTest(world.x, world.y);
    setHoveredJunctionId(hit && hit.kind === 'junction' ? hit.id : null);
  };

  const handleMouseUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && (drag.mode === 'junction' || drag.mode === 'shape_point') && drag.moved) {
      setHistoryPast((past) => [...past.slice(-49), drag.before]);
      setHistoryFuture([]);
      setIsDirty(true);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setCamera((c) => ({ ...c, zoom: Math.max(0.25, Math.min(10, c.zoom * factor)) }));
  };

  // Actions: Validate, Preview, Save, Save & Run, New, Import, Export, Delete
  const handleValidate = async () => {
    setBusyAction('validate');
    setStatusMessage(null);
    try {
      const res = await validateNetworkProject(project, true);
      setIssues(res.errors);
      setWarnings(res.warnings);
      setStatusMessage(
        res.valid
          ? `Valid! Compiled cleanly${res.warnings.length ? ` (${res.warnings.length} warning(s))` : ''}.`
          : `Found ${res.errors.length} validation error(s).`
      );
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAction(null);
    }
  };

  const handleTogglePreview = async () => {
    if (showCompiledPreview) {
      setShowCompiledPreview(false);
      return;
    }
    setBusyAction('preview');
    try {
      const res = await previewNetworkGeometry(project);
      setIssues(res.errors);
      setWarnings(res.warnings);
      if (res.valid && res.geometry) {
        setPreviewGeometry(res.geometry);
        setShowCompiledPreview(true);
        setStatusMessage('Showing compiled netconvert geometry overlay.');
      } else {
        setStatusMessage(`Cannot preview: ${res.errors[0]?.message || 'validation failed'}`);
      }
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAction(null);
    }
  };

  const handleSave = async (andRun = false) => {
    setBusyAction(andRun ? 'run' : 'save');
    setStatusMessage(null);
    try {
      const saved = await saveNetwork(project.id, project);
      setProject(saved.project);
      setIsDirty(false);
      setIssues([]);
      setWarnings(saved.warnings);
      await refreshRecords();
      setStatusMessage(`Saved & compiled '${saved.project.name}' (${saved.scenario_id}).`);
      if (andRun) {
        await onRunScenario(saved.scenario_id);
      }
    } catch (e) {
      if (e instanceof NetworkApiError) {
        setIssues(e.issues);
        setStatusMessage(e.message);
      } else {
        setStatusMessage(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleNewNetwork = () => {
    const existing = new Set(records.map((r) => r.id));
    const newId = nextUniqueId('custom_net_', existing);
    const blank = createBlankProject(newId, `Custom Network ${newId.replace('custom_net_', '')}`);
    setProject(blank);
    setHistoryPast([]);
    setHistoryFuture([]);
    setIsDirty(true);
    setSelection(null);
    setIssues([]);
    setWarnings([]);
    setPreviewGeometry(null);
    setShowCompiledPreview(false);
    setStatusMessage(`Created draft '${blank.id}'.`);
    fitToNetwork(blank);
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.id || 'network'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as NetworkProject;
        setProject(parsed);
        setHistoryPast([]);
        setHistoryFuture([]);
        setIsDirty(true);
        setSelection(null);
        setIssues([]);
        setWarnings([]);
        setPreviewGeometry(null);
        setStatusMessage(`Imported '${file.name}'.`);
        fitToNetwork(parsed);
      } catch (err) {
        setStatusMessage(`Invalid JSON file: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    e.target.value = '';
  };

  const handleDeleteCurrentNetwork = async () => {
    if (!activeRecord || activeRecord.read_only) return;
    try {
      await deleteNetwork(project.id);
      const list = await refreshRecords();
      setStatusMessage(`Deleted '${project.id}'.`);
      if (list.length > 0) {
        await loadNetworkById(list[0].id);
      } else {
        handleNewNetwork();
      }
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : String(e));
    }
  };

  // Focus an issue's element on click
  const focusIssue = (iss: ValidationIssue) => {
    if (!iss.element_id) return;
    const j = junctionsById.get(iss.element_id);
    if (j) {
      setSelection({ kind: 'junction', id: j.id });
      setCamera((c) => ({ ...c, x: j.x, y: j.y }));
      return;
    }
    const r = project.roads.find((rd) => rd.id === iss.element_id);
    if (r) {
      setSelection({ kind: 'road', id: r.id });
      const pts = getRoadPolyline(r, junctionsById);
      if (pts.length >= 2) {
        setCamera((c) => ({
          ...c,
          x: (pts[0][0] + pts[pts.length - 1][0]) / 2,
          y: (pts[0][1] + pts[pts.length - 1][1]) / 2,
        }));
      }
    }
  };

  // Track container dimensions cleanly via ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateSize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        setCanvasSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvasSize;
    if (width <= 0 || height <= 0) return;

    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    const sx = (wx: number) => (wx - camera.x) * camera.zoom + width / 2;
    const sy = (wy: number) => -(wy - camera.y) * camera.zoom + height / 2;

    // 1. Grid
    const minW = screenToWorld(0, height);
    const maxW = screenToWorld(width, 0);
    const step = camera.zoom < 0.7 ? 50 : 10;
    const startX = Math.floor(minW.x / step) * step;
    const startY = Math.floor(minW.y / step) * step;

    for (let x = startX; x <= maxW.x; x += step) {
      const major = Math.abs(x % 50) < 1e-6;
      ctx.strokeStyle = x === 0 ? 'rgba(56, 189, 248, 0.25)' : major ? 'rgba(148, 163, 184, 0.14)' : 'rgba(148, 163, 184, 0.06)';
      ctx.lineWidth = major ? 1 : 0.75;
      ctx.beginPath();
      ctx.moveTo(sx(x), 0);
      ctx.lineTo(sx(x), height);
      ctx.stroke();
    }
    for (let y = startY; y <= maxW.y; y += step) {
      const major = Math.abs(y % 50) < 1e-6;
      ctx.strokeStyle = y === 0 ? 'rgba(56, 189, 248, 0.25)' : major ? 'rgba(148, 163, 184, 0.14)' : 'rgba(148, 163, 184, 0.06)';
      ctx.lineWidth = major ? 1 : 0.75;
      ctx.beginPath();
      ctx.moveTo(0, sy(y));
      ctx.lineTo(width, sy(y));
      ctx.stroke();
    }

    // 2. Compiled netconvert geometry overlay (if toggled on)
    if (showCompiledPreview && previewGeometry) {
      ctx.save();
      ctx.globalAlpha = 0.65;
      renderGeometryNetwork(ctx, sx, sy, camera.zoom, previewGeometry, null);
      ctx.restore();
    }

    // 3. Schematic roads
    for (const r of project.roads) {
      const pts = getRoadPolyline(r, junctionsById);
      if (pts.length < 2) continue;

      const isSelected =
        (selection?.kind === 'road' && selection.id === r.id) ||
        (selection?.kind === 'shape_point' && selection.roadId === r.id);
      const hasError = errorElementIds.has(r.id);
      const totalLanes = r.lanes + r.lanes_back;
      const roadWpx = Math.max(4, totalLanes * project.settings.lane_width_m * camera.zoom);

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Outer road ribbon
      ctx.strokeStyle = hasError
        ? 'rgba(244, 63, 94, 0.85)'
        : isSelected
        ? 'rgba(56, 189, 248, 0.9)'
        : 'rgba(51, 65, 85, 0.9)';
      ctx.lineWidth = roadWpx + (isSelected || hasError ? 4 : 0);
      ctx.beginPath();
      ctx.moveTo(sx(pts[0][0]), sy(pts[0][1]));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(sx(pts[i][0]), sy(pts[i][1]));
      ctx.stroke();

      // Inner asphalt
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = Math.max(2, roadWpx - 2);
      ctx.stroke();

      // Centreline (yellow if two-way, dashed sky if one-way)
      ctx.strokeStyle = r.lanes_back > 0 ? '#facc15' : '#38bdf8';
      ctx.lineWidth = Math.max(1, 1.5);
      if (r.lanes_back === 0) ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Midpoint label (name + lanes + length)
      const midSeg = Math.floor((pts.length - 1) / 2);
      const mx = (pts[midSeg][0] + pts[midSeg + 1][0]) / 2;
      const my = (pts[midSeg][1] + pts[midSeg + 1][1]) / 2;
      const lenM = Math.round(polylineLength(pts));
      if (camera.zoom >= 0.7) {
        const label = `${r.name || r.id} (${r.lanes}${r.lanes_back > 0 ? `+${r.lanes_back}` : '→'}L · ${lenM}m)`;
        ctx.font = '600 11px Inter, system-ui, sans-serif';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
        ctx.beginPath();
        ctx.roundRect(sx(mx) - tw / 2 - 5, sy(my) - 18, tw + 10, 16, 4);
        ctx.fill();
        ctx.fillStyle = isSelected ? '#38bdf8' : '#cbd5e1';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, sx(mx), sy(my) - 10);
      }

      // Shape point handles
      for (let idx = 0; idx < r.points.length; idx++) {
        const [px, py] = r.points[idx];
        const ptSelected = selection?.kind === 'shape_point' && selection.roadId === r.id && selection.index === idx;
        ctx.fillStyle = ptSelected ? '#38bdf8' : '#f8fafc';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx(px), sy(py), ptSelected ? 6 : 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 4. Rubber-band preview while drawing a road
    if (tool === 'road' && roadStartJunctionId) {
      const startJ = junctionsById.get(roadStartJunctionId);
      if (startJ) {
        const hoverJ = hoveredJunctionId ? junctionsById.get(hoveredJunctionId) : null;
        const tx = hoverJ ? hoverJ.x : snapCoord(cursorWorld.x);
        const ty = hoverJ ? hoverJ.y : snapCoord(cursorWorld.y);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.moveTo(sx(startJ.x), sy(startJ.y));
        ctx.lineTo(sx(tx), sy(ty));
        ctx.stroke();
        ctx.setLineDash([]);

        const liveLen = Math.round(Math.hypot(tx - startJ.x, ty - startJ.y));
        const lx = sx((startJ.x + tx) / 2);
        const ly = sy((startJ.y + ty) / 2) - 14;
        ctx.font = '700 12px monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'center';
        ctx.fillText(`${liveLen} m`, lx, ly);
      }
    }

    // 5. Junction nodes
    for (const j of project.junctions) {
      const cx = sx(j.x);
      const cy = sy(j.y);
      const isSelected = selection?.kind === 'junction' && selection.id === j.id;
      const isRoadStart = roadStartJunctionId === j.id;
      const isHovered = hoveredJunctionId === j.id;
      const hasError = errorElementIds.has(j.id);
      const radius = isSelected || isRoadStart ? 10 : isHovered ? 9 : 7.5;

      if (hasError) {
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle =
        j.type === 'traffic_light'
          ? '#f59e0b'
          : j.type === 'allway_stop'
          ? '#ef4444'
          : '#38bdf8';
      ctx.strokeStyle = isSelected || isRoadStart ? '#ffffff' : '#0f172a';
      ctx.lineWidth = isSelected || isRoadStart ? 3 : 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Label
      const tag = j.label && j.label !== j.id ? `${j.id} · ${j.label}` : j.id;
      ctx.font = '700 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(tag, cx, cy + radius + 4);
    }

    ctx.restore();
  }, [
    project,
    junctionsById,
    camera,
    canvasSize,
    selection,
    tool,
    roadStartJunctionId,
    hoveredJunctionId,
    cursorWorld,
    errorElementIds,
    showCompiledPreview,
    previewGeometry,
    screenToWorld,
    snapCoord,
  ]);

  const selectedJunction =
    selection?.kind === 'junction' ? junctionsById.get(selection.id) ?? null : null;
  const selectedRoad =
    selection?.kind === 'road'
      ? project.roads.find((r) => r.id === selection.id) ?? null
      : selection?.kind === 'shape_point'
      ? project.roads.find((r) => r.id === selection.roadId) ?? null
      : null;

  const scaleBar = computeNiceScaleMeters(camera.zoom);

  return (
    <div className="ne-root">
      {/* Top Toolbar */}
      <header className="ne-header">
        <div className="ne-header-group">
          <button onClick={onBackToSimulator} className="ne-btn">
            <ArrowLeft size={14} />
            Simulator
          </button>

          <div className="ne-divider" />

          <select
            value={records.some((r) => r.id === project.id) ? project.id : '__draft__'}
            onChange={(e) => {
              if (e.target.value !== '__draft__') loadNetworkById(e.target.value);
            }}
            className="ne-select"
            title="Open saved or example network"
          >
            {!records.some((r) => r.id === project.id) && (
              <option value="__draft__">{project.name} (unsaved draft)</option>
            )}
            {records.map((rec) => (
              <option key={rec.id} value={rec.id}>
                {rec.name} {rec.read_only ? '(Example)' : ''}
              </option>
            ))}
          </select>

          <button onClick={handleNewNetwork} className="ne-btn" title="Create new blank network">
            <FilePlus2 size={14} />
            New
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="ne-btn"
            title="Import network.json from disk"
          >
            <Upload size={14} />
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportJson}
            style={{ display: 'none' }}
          />

          <button onClick={handleExportJson} className="ne-btn" title="Export network.json">
            <Download size={14} />
            Export
          </button>

          {isDirty && <span className="ne-badge-dirty">Unsaved</span>}
        </div>

        <div className="ne-header-group">
          <button
            onClick={handleUndo}
            disabled={historyPast.length === 0}
            className="ne-btn ne-btn-icon"
            title="Undo (Cmd/Ctrl+Z)"
          >
            <Undo2 size={14} />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyFuture.length === 0}
            className="ne-btn ne-btn-icon"
            title="Redo (Cmd/Ctrl+Shift+Z)"
          >
            <Redo2 size={14} />
          </button>

          <button
            onClick={() => setSnapToGrid((s) => !s)}
            className={`ne-btn ${snapToGrid ? 'ne-btn-active-sky' : ''}`}
            title="Toggle 10m grid snapping"
          >
            <Magnet size={14} />
            Snap 10m
          </button>

          <button
            onClick={handleTogglePreview}
            disabled={busyAction !== null}
            className={`ne-btn ${showCompiledPreview ? 'ne-btn-active-emerald' : ''}`}
            title="Overlay compiled SUMO netconvert geometry"
          >
            <Layers size={14} />
            Preview
          </button>

          <button onClick={handleValidate} disabled={busyAction !== null} className="ne-btn">
            <CheckCircle2 size={14} color="#38bdf8" />
            {busyAction === 'validate' ? 'Checking...' : 'Validate'}
          </button>

          <button onClick={() => handleSave(false)} disabled={busyAction !== null} className="ne-btn">
            <Save size={14} />
            {busyAction === 'save' ? 'Saving...' : 'Save'}
          </button>

          <button
            onClick={() => handleSave(true)}
            disabled={busyAction !== null}
            className="ne-btn ne-btn-primary"
          >
            <Play size={14} fill="currentColor" />
            {busyAction === 'run' ? 'Compiling...' : 'Save & Run'}
          </button>
        </div>
      </header>

      {/* Main 3-Pane Workspace */}
      <div className="ne-workspace">
        {/* Left Tool Rail */}
        <aside className="ne-tool-rail">
          {(
            [
              { id: 'select', icon: MousePointer2, label: 'Select / Move (V)' },
              { id: 'junction', icon: PlusCircle, label: 'Add Junction (J)' },
              { id: 'road', icon: Spline, label: 'Draw Road (R)' },
              { id: 'shape_point', icon: Waypoints, label: 'Add Bend Point (P)' },
              { id: 'delete', icon: Trash2, label: 'Delete Element (X)' },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tool === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setTool(item.id);
                  setRoadStartJunctionId(null);
                }}
                title={item.label}
                className={`ne-tool-btn ${active ? 'ne-tool-btn-active' : ''}`}
              >
                <Icon size={16} />
              </button>
            );
          })}

          <div className="ne-tool-spacer" />

          <button
            onClick={() => setCamera((c) => ({ ...c, zoom: Math.min(10, c.zoom * 1.25) }))}
            title="Zoom In"
            className="ne-tool-btn"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={() => setCamera((c) => ({ ...c, zoom: Math.max(0.25, c.zoom / 1.25) }))}
            title="Zoom Out"
            className="ne-tool-btn"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={() => fitToNetwork(project)}
            title="Fit Network to View"
            className="ne-tool-btn"
          >
            <Maximize2 size={16} />
          </button>
        </aside>

        {/* Center Canvas */}
        <div ref={containerRef} className="ne-canvas-wrap">
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
            className="ne-canvas"
            style={{
              cursor:
                tool === 'select' ? 'default' : tool === 'delete' ? 'not-allowed' : 'crosshair',
            }}
          />

          {/* Top-left Mode Hint */}
          <div className="ne-overlay-hint">
            {tool === 'select' &&
              'Click to select · Drag junctions or bend points · Drag background or right-drag to pan'}
            {tool === 'junction' && 'Click anywhere on the grid to place a new junction'}
            {tool === 'road' &&
              (roadStartJunctionId
                ? `Drawing from '${roadStartJunctionId}' — click a second junction (Esc to cancel)`
                : 'Click a starting junction to draw a road')}
            {tool === 'shape_point' && 'Click on any road segment to insert a curve/bend point'}
            {tool === 'delete' && 'Click any junction, road, or bend point to delete it'}
          </div>

          {/* Bottom-left Scale Bar & Coordinates */}
          <div className="ne-scale-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                className="ne-scale-line"
                style={{ width: `${Math.round(scaleBar.pixels)}px` }}
              />
              <span>{scaleBar.meters} m</span>
            </div>
            <span style={{ color: '#475569' }}>|</span>
            <span>
              x: {cursorWorld.x.toFixed(1)}m, y: {cursorWorld.y.toFixed(1)}m
            </span>
          </div>

          {/* Status Toast */}
          {statusMessage && <div className="ne-toast">{statusMessage}</div>}
        </div>

        {/* Right Property Inspector & Validation Drawer */}
        <aside className="ne-inspector">
          <div className="ne-inspector-body">
            {selectedJunction ? (
              <>
                <div className="ne-section-head">
                  <span className="ne-section-title">Junction · {selectedJunction.id}</span>
                  <button
                    onClick={() => deleteElement({ kind: 'junction', id: selectedJunction.id })}
                    className="ne-link-btn ne-link-rose"
                  >
                    <Trash2 size={13} />
                    Delete
                  </button>
                </div>

                <label className="ne-field">
                  <span className="ne-field-label">Label</span>
                  <input
                    type="text"
                    value={selectedJunction.label ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      commitProject((prev) => ({
                        ...prev,
                        junctions: prev.junctions.map((j) =>
                          j.id === selectedJunction.id ? { ...j, label: val || null } : j
                        ),
                      }));
                    }}
                    className="ne-input ne-input-full"
                  />
                </label>

                <label className="ne-field">
                  <span className="ne-field-label">Junction Type</span>
                  <select
                    value={selectedJunction.type}
                    onChange={(e) => {
                      const nextType = e.target.value as JunctionType;
                      commitProject((prev) => ({
                        ...prev,
                        junctions: prev.junctions.map((j) =>
                          j.id === selectedJunction.id ? { ...j, type: nextType } : j
                        ),
                      }));
                    }}
                    className="ne-select ne-select-full"
                  >
                    <option value="priority">Priority (Unsignalised)</option>
                    <option value="traffic_light">Traffic Light (Signalised)</option>
                    <option value="right_before_left">Right Before Left</option>
                    <option value="allway_stop">All-Way Stop</option>
                  </select>
                </label>

                <div className="ne-grid-2">
                  <label className="ne-field">
                    <span className="ne-field-label">X (m)</span>
                    <input
                      type="number"
                      value={selectedJunction.x}
                      onChange={(e) => {
                        const x = Number(e.target.value);
                        if (!Number.isFinite(x)) return;
                        commitProject((prev) => ({
                          ...prev,
                          junctions: prev.junctions.map((j) =>
                            j.id === selectedJunction.id ? { ...j, x } : j
                          ),
                        }));
                      }}
                      className="ne-input ne-input-full ne-mono"
                    />
                  </label>
                  <label className="ne-field">
                    <span className="ne-field-label">Y (m)</span>
                    <input
                      type="number"
                      value={selectedJunction.y}
                      onChange={(e) => {
                        const y = Number(e.target.value);
                        if (!Number.isFinite(y)) return;
                        commitProject((prev) => ({
                          ...prev,
                          junctions: prev.junctions.map((j) =>
                            j.id === selectedJunction.id ? { ...j, y } : j
                          ),
                        }));
                      }}
                      className="ne-input ne-input-full ne-mono"
                    />
                  </label>
                </div>
              </>
            ) : selectedRoad ? (
              <>
                <div className="ne-section-head">
                  <span className="ne-section-title">Road · {selectedRoad.id}</span>
                  <button
                    onClick={() => deleteElement({ kind: 'road', id: selectedRoad.id })}
                    className="ne-link-btn ne-link-rose"
                  >
                    <Trash2 size={13} />
                    Delete
                  </button>
                </div>

                <div className="ne-field-label ne-mono">
                  {selectedRoad.from} → {selectedRoad.to} ·{' '}
                  {Math.round(polylineLength(getRoadPolyline(selectedRoad, junctionsById)))} m
                </div>

                <label className="ne-field">
                  <span className="ne-field-label">Road Name</span>
                  <input
                    type="text"
                    value={selectedRoad.name ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      commitProject((prev) => ({
                        ...prev,
                        roads: prev.roads.map((r) =>
                          r.id === selectedRoad.id ? { ...r, name: val || null } : r
                        ),
                      }));
                    }}
                    className="ne-input ne-input-full"
                  />
                </label>

                <div className="ne-grid-2">
                  <label className="ne-field">
                    <span className="ne-field-label">
                      Lanes ({selectedRoad.from}→{selectedRoad.to})
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={selectedRoad.lanes}
                      onChange={(e) => {
                        const lanes = Math.max(1, Math.min(8, Number(e.target.value) || 1));
                        commitProject((prev) => ({
                          ...prev,
                          roads: prev.roads.map((r) =>
                            r.id === selectedRoad.id ? { ...r, lanes } : r
                          ),
                        }));
                      }}
                      className="ne-input ne-input-full ne-mono"
                    />
                  </label>

                  <label className="ne-field">
                    <span className="ne-field-label">Lanes Back (0=one-way)</span>
                    <input
                      type="number"
                      min={0}
                      max={8}
                      value={selectedRoad.lanes_back}
                      onChange={(e) => {
                        const lanes_back = Math.max(0, Math.min(8, Number(e.target.value) || 0));
                        commitProject((prev) => ({
                          ...prev,
                          roads: prev.roads.map((r) =>
                            r.id === selectedRoad.id ? { ...r, lanes_back } : r
                          ),
                        }));
                      }}
                      className="ne-input ne-input-full ne-mono"
                    />
                  </label>
                </div>

                <label className="ne-field">
                  <span className="ne-field-label">Speed Limit (km/h)</span>
                  <input
                    type="number"
                    min={5}
                    max={150}
                    value={selectedRoad.speed_kmh ?? project.settings.default_speed_kmh}
                    onChange={(e) => {
                      const speed_kmh = Math.max(5, Math.min(150, Number(e.target.value) || 50));
                      commitProject((prev) => ({
                        ...prev,
                        roads: prev.roads.map((r) =>
                          r.id === selectedRoad.id ? { ...r, speed_kmh } : r
                        ),
                      }));
                    }}
                    className="ne-input ne-input-full ne-mono"
                  />
                </label>

                <div className="ne-subtle-divider">
                  <div className="ne-section-head">
                    <span className="ne-field-label">Bend points: {selectedRoad.points.length}</span>
                    {selectedRoad.points.length > 0 && (
                      <button
                        onClick={() =>
                          commitProject((prev) => ({
                            ...prev,
                            roads: prev.roads.map((r) =>
                              r.id === selectedRoad.id ? { ...r, points: [] } : r
                            ),
                          }))
                        }
                        className="ne-link-btn ne-link-amber"
                      >
                        Straighten road
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <span className="ne-section-title">Network Properties</span>

                <label className="ne-field">
                  <span className="ne-field-label">Network ID (alphanumeric + _)</span>
                  <input
                    type="text"
                    value={project.id}
                    onChange={(e) => {
                      const id = e.target.value.replace(/[^A-Za-z0-9_]/g, '');
                      commitProject((prev) => ({ ...prev, id }));
                    }}
                    className="ne-input ne-input-full ne-mono"
                  />
                </label>

                <label className="ne-field">
                  <span className="ne-field-label">Name</span>
                  <input
                    type="text"
                    value={project.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      commitProject((prev) => ({ ...prev, name }));
                    }}
                    className="ne-input ne-input-full"
                  />
                </label>

                <div className="ne-grid-2">
                  <label className="ne-field">
                    <span className="ne-field-label">Drive Side</span>
                    <select
                      value={project.settings.drive_side}
                      onChange={(e) => {
                        const drive_side = e.target.value as 'left' | 'right';
                        commitProject((prev) => ({
                          ...prev,
                          settings: { ...prev.settings, drive_side },
                        }));
                      }}
                      className="ne-select ne-select-full"
                    >
                      <option value="left">Left (India / UK)</option>
                      <option value="right">Right (US / EU)</option>
                    </select>
                  </label>

                  <label className="ne-field">
                    <span className="ne-field-label">Default km/h</span>
                    <input
                      type="number"
                      min={5}
                      max={150}
                      value={project.settings.default_speed_kmh}
                      onChange={(e) => {
                        const default_speed_kmh = Number(e.target.value) || 50;
                        commitProject((prev) => ({
                          ...prev,
                          settings: { ...prev.settings, default_speed_kmh },
                        }));
                      }}
                      className="ne-input ne-input-full ne-mono"
                    />
                  </label>
                </div>

                {/* Quick O-D Flows Section */}
                <div className="ne-subtle-divider">
                  <div className="ne-section-head">
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>
                      O-D Flows ({project.demand.flows.length})
                    </span>
                    {boundaryJunctions.length >= 2 && (
                      <button
                        onClick={() => {
                          const existing = new Set(project.demand.flows.map((f) => f.id));
                          const from = boundaryJunctions[0].id;
                          const to = boundaryJunctions[1].id;
                          const flow: FlowDef = {
                            id: nextUniqueId('flow_', existing),
                            from,
                            to,
                            vehs_per_hour: 300,
                          };
                          commitProject((prev) => ({
                            ...prev,
                            demand: { ...prev.demand, flows: [...prev.demand.flows, flow] },
                          }));
                        }}
                        className="ne-link-btn ne-link-sky"
                      >
                        <Plus size={12} />
                        Add Flow
                      </button>
                    )}
                  </div>

                  <div className="ne-flow-list">
                    {project.demand.flows.map((flow) => (
                      <div key={flow.id} className="ne-flow-row">
                        <select
                          value={flow.from}
                          onChange={(e) => {
                            const val = e.target.value;
                            commitProject((prev) => ({
                              ...prev,
                              demand: {
                                ...prev.demand,
                                flows: prev.demand.flows.map((f) =>
                                  f.id === flow.id ? { ...f, from: val } : f
                                ),
                              },
                            }));
                          }}
                        >
                          {boundaryJunctions.map((j) => (
                            <option key={j.id} value={j.id}>
                              {j.id}
                            </option>
                          ))}
                        </select>
                        <span style={{ color: '#64748b' }}>→</span>
                        <select
                          value={flow.to}
                          onChange={(e) => {
                            const val = e.target.value;
                            commitProject((prev) => ({
                              ...prev,
                              demand: {
                                ...prev.demand,
                                flows: prev.demand.flows.map((f) =>
                                  f.id === flow.id ? { ...f, to: val } : f
                                ),
                              },
                            }));
                          }}
                        >
                          {boundaryJunctions.map((j) => (
                            <option key={j.id} value={j.id}>
                              {j.id}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={0}
                          max={15000}
                          step={50}
                          value={flow.vehs_per_hour}
                          onChange={(e) => {
                            const vph = Math.max(0, Number(e.target.value) || 0);
                            commitProject((prev) => ({
                              ...prev,
                              demand: {
                                ...prev.demand,
                                flows: prev.demand.flows.map((f) =>
                                  f.id === flow.id ? { ...f, vehs_per_hour: vph } : f
                                ),
                              },
                            }));
                          }}
                          title="Vehicles per hour"
                        />
                        <button
                          onClick={() =>
                            commitProject((prev) => ({
                              ...prev,
                              demand: {
                                ...prev.demand,
                                flows: prev.demand.flows.filter((f) => f.id !== flow.id),
                              },
                            }))
                          }
                          className="ne-link-btn ne-link-rose"
                          style={{ marginLeft: 'auto' }}
                          title="Remove flow"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {activeRecord && !activeRecord.read_only && (
                  <div className="ne-subtle-divider">
                    <button onClick={handleDeleteCurrentNetwork} className="ne-btn ne-btn-danger">
                      Delete Saved Network
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Bottom Validation & Warnings Panel */}
          {(issues.length > 0 || warnings.length > 0) && (
            <div className="ne-validation-panel">
              {issues.map((iss, idx) => (
                <button
                  key={`${iss.code}-${idx}`}
                  onClick={() => focusIssue(iss)}
                  className="ne-issue-btn"
                >
                  <AlertCircle size={14} color="#fb7185" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>{iss.message}</span>
                </button>
              ))}
              {warnings.map((w, idx) => (
                <div key={idx} className="ne-warning-item">
                  <AlertTriangle size={14} color="#fbbf24" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
