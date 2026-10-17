// ----------------------------------------------------
// POLYLINE NETWORK RENDERER (GNT Circle & other curved-geometry scenarios)
// Draws lanes, junctions, medians, island, markings straight from .net.xml shapes.
// ----------------------------------------------------
import type { NetworkGeometry, LaneShape, Point } from '../types/simulation';

type ToScreen = (v: number) => number;

export interface LabelHitRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const ASPHALT = '#1e2535';
const SHOULDER = '#111827';

/** Offset a polyline sideways. d > 0 moves to the left of the travel direction. */
export const offsetPolyline = (pts: Point[], d: number): Point[] => {
  if (pts.length < 2) return pts;
  const normals: Point[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    const dy = pts[i + 1][1] - pts[i][1];
    const len = Math.hypot(dx, dy) || 1;
    normals.push([-dy / len, dx / len]);
  }
  return pts.map((p, i) => {
    const a = normals[Math.max(0, i - 1)];
    const b = normals[Math.min(normals.length - 1, i)];
    let nx = a[0] + b[0];
    let ny = a[1] + b[1];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    // Miter length correction, capped to avoid spikes on sharp corners
    const cos = Math.max(0.5, nx * b[0] + ny * b[1]);
    return [p[0] + (nx * d) / cos, p[1] + (ny * d) / cos];
  });
};

const tracePath = (ctx: CanvasRenderingContext2D, pts: Point[], sx: ToScreen, sy: ToScreen) => {
  ctx.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) ctx.moveTo(sx(p[0]), sy(p[1]));
    else ctx.lineTo(sx(p[0]), sy(p[1]));
  });
};

let hatchPattern: CanvasPattern | null = null;
const getHatchPattern = (ctx: CanvasRenderingContext2D): CanvasPattern | null => {
  if (hatchPattern) return hatchPattern;
  const tile = document.createElement('canvas');
  tile.width = 8;
  tile.height = 8;
  const t = tile.getContext('2d');
  if (!t) return null;
  t.fillStyle = '#3f4756';
  t.fillRect(0, 0, 8, 8);
  t.strokeStyle = '#9ca3af';
  t.lineWidth = 1.2;
  t.beginPath();
  t.moveTo(0, 8);
  t.lineTo(8, 0);
  t.moveTo(-2, 2);
  t.lineTo(2, -2);
  t.moveTo(6, 10);
  t.lineTo(10, 6);
  t.stroke();
  hatchPattern = ctx.createPattern(tile, 'repeat');
  return hatchPattern;
};

/** Sample points along a polyline every `step` metres, with heading. */
const samplePolyline = (pts: Point[], step: number, offset: number) => {
  const out: { x: number; y: number; ang: number }[] = [];
  let next = offset;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const seg = Math.hypot(x2 - x1, y2 - y1);
    while (next <= acc + seg) {
      const t = (next - acc) / (seg || 1);
      out.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, ang: Math.atan2(y2 - y1, x2 - x1) });
      next += step;
    }
    acc += seg;
  }
  return out;
};

const polylineLength = (pts: Point[]) => {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) len += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return len;
};

const groupByEdge = (lanes: LaneShape[]) => {
  const map = new Map<string, LaneShape[]>();
  for (const ln of lanes) {
    const arr = map.get(ln.edge) ?? [];
    arr.push(ln);
    map.set(ln.edge, arr);
  }
  map.forEach((arr) => arr.sort((a, b) => a.index - b.index));
  return map;
};

export const renderGeometryNetwork = (
  ctx: CanvasRenderingContext2D,
  sx: ToScreen,
  sy: ToScreen,
  zoom: number,
  geo: NetworkGeometry,
  hoveredLabelId: string | null,
): LabelHitRect[] => {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';

  // 1. Shoulders / embankment under every lane
  ctx.strokeStyle = SHOULDER;
  for (const ln of geo.lanes) {
    ctx.lineWidth = (ln.width + 2.4) * zoom;
    tracePath(ctx, ln.shape, sx, sy);
    ctx.stroke();
  }
  ctx.fillStyle = SHOULDER;
  ctx.strokeStyle = SHOULDER;
  ctx.lineWidth = 2.4 * zoom;
  for (const j of geo.junctions) {
    tracePath(ctx, j.shape, sx, sy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 2. Asphalt: junction polygons + lane ribbons
  ctx.fillStyle = ASPHALT;
  ctx.strokeStyle = ASPHALT;
  ctx.lineWidth = Math.max(1, 0.6 * zoom);
  for (const j of [...geo.junctions, ...(geo.paved_areas ?? [])]) {
    tracePath(ctx, j.shape, sx, sy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  for (const ln of [...geo.lanes, ...(geo.connectors ?? [])]) {
    ctx.lineWidth = (ln.width + 0.1) * zoom;
    tracePath(ctx, ln.shape, sx, sy);
    ctx.stroke();
  }

  // 3. Roundabout central island (green) with kerb
  const rb = geo.roundabout;
  if (rb) {
    const cx = sx(rb.x);
    const cy = sy(rb.y);
    const r = rb.island_radius * zoom;
    const grad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    grad.addColorStop(0, '#166534');
    grad.addColorStop(1, '#14532d');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = Math.max(1.5, 0.35 * zoom);
    ctx.setLineDash([0.9 * zoom, 0.9 * zoom]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (zoom > 1.2) {
      ctx.fillStyle = 'rgba(220, 252, 231, 0.85)';
      ctx.font = `800 ${Math.max(9, Math.min(22, 0.45 * r))}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GNT', cx, cy - 0.12 * r);
      ctx.font = `600 ${Math.max(7, Math.min(14, 0.26 * r))}px Inter, sans-serif`;
      ctx.fillText('CIRCLE', cx, cy + 0.22 * r);
      ctx.textBaseline = 'alphabetic';
    }
  }

  // 4. Raised medians (hatched)
  const hatch = getHatchPattern(ctx);
  for (const m of geo.medians) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = (m.width + 0.3) * zoom;
    tracePath(ctx, m.shape, sx, sy);
    ctx.stroke();
    ctx.strokeStyle = hatch ?? '#3f4756';
    ctx.lineWidth = m.width * zoom;
    tracePath(ctx, m.shape, sx, sy);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';

  // 5. Lane markings: dashed separators within a carriageway, solid edges
  const edges = groupByEdge(geo.lanes);
  const markW = Math.max(1, 0.15 * zoom);
  edges.forEach((lanes) => {
    // Dashed dividers between neighbouring lanes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = markW;
    ctx.setLineDash([3 * zoom, 4.5 * zoom]);
    for (let i = 0; i < lanes.length - 1; i++) {
      const divider = offsetPolyline(lanes[i].shape, -lanes[i].width / 2);
      tracePath(ctx, divider, sx, sy);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Kerb edge (left of lane 0, LHT) in white, median edge (right of top lane) in amber
    const kerb = lanes[0];
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    tracePath(ctx, offsetPolyline(kerb.shape, kerb.width / 2 - 0.15), sx, sy);
    ctx.stroke();
    const med = lanes[lanes.length - 1];
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.8)';
    tracePath(ctx, offsetPolyline(med.shape, -(med.width / 2 - 0.15)), sx, sy);
    ctx.stroke();
  });

  // 6. Direction chevrons along each lane (teal, like the design sketch)
  if (zoom > 0.9) {
    const step = zoom > 4 ? 25 : 45;
    const size = Math.max(3, Math.min(10, 0.9 * zoom));
    ctx.strokeStyle = 'rgba(94, 234, 212, 0.45)';
    ctx.lineWidth = Math.max(1, 0.18 * zoom);
    for (const ln of geo.lanes) {
      const len = polylineLength(ln.shape);
      if (len < 12) continue;
      for (const s of samplePolyline(ln.shape, step, Math.min(10, len / 2))) {
        const px = sx(s.x);
        const py = sy(s.y);
        const a = -s.ang; // screen Y is flipped
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(-size * 0.6, -size * 0.6);
        ctx.lineTo(size * 0.4, 0);
        ctx.lineTo(-size * 0.6, size * 0.6);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // 7. Give-way markings (shark teeth + dashed line) at the end of yielding lanes
  if (zoom > 1.5) {
    const yieldSet = new Set(geo.yield_lanes);
    for (const ln of geo.lanes) {
      if (!yieldSet.has(ln.id) || ln.shape.length < 2) continue;
      const end = ln.shape[ln.shape.length - 1];
      const prev = ln.shape[ln.shape.length - 2];
      const dx = end[0] - prev[0];
      const dy = end[1] - prev[1];
      const l = Math.hypot(dx, dy) || 1;
      const ux = dx / l;
      const uy = dy / l;
      const nx = -uy;
      const ny = ux;
      const half = ln.width / 2 - 0.2;

      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1, 0.2 * zoom);
      ctx.setLineDash([0.6 * zoom, 0.5 * zoom]);
      ctx.beginPath();
      ctx.moveTo(sx(end[0] + nx * half), sy(end[1] + ny * half));
      ctx.lineTo(sx(end[0] - nx * half), sy(end[1] - ny * half));
      ctx.stroke();
      ctx.setLineDash([]);

      // Triangles point toward the approaching driver
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      const teeth = 3;
      const tw = (2 * half) / teeth;
      for (let k = 0; k < teeth; k++) {
        const o = -half + tw * (k + 0.5);
        const bx = end[0] - ux * 1.0 + nx * o;
        const by = end[1] - uy * 1.0 + ny * o;
        ctx.beginPath();
        ctx.moveTo(sx(bx + nx * tw * 0.35), sy(by + ny * tw * 0.35));
        ctx.lineTo(sx(bx - nx * tw * 0.35), sy(by - ny * tw * 0.35));
        ctx.lineTo(sx(bx - ux * 1.6), sy(by - uy * 1.6));
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // 8. Arm labels (NG / TL / FL) — full name on hover
  const rects: LabelHitRect[] = [];
  ctx.font = '800 12px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const lb of geo.labels) {
    const px = sx(lb.x);
    const py = sy(lb.y);
    const hovered = hoveredLabelId === lb.id;
    const text = hovered ? `${lb.id} · ${lb.name}` : lb.id;
    const w = ctx.measureText(text).width + 16;
    const h = 22;
    ctx.fillStyle = hovered ? 'rgba(56, 189, 248, 0.25)' : 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = hovered ? '#38bdf8' : 'rgba(244, 114, 182, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(px - w / 2, py - h / 2, w, h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hovered ? '#e0f2fe' : '#f9a8d4';
    ctx.fillText(text, px, py + 1);
    rects.push({ id: lb.id, x: px - w / 2, y: py - h / 2, w, h });
  }

  // 9. Feature callouts
  if (zoom > 2.2) {
    ctx.font = '700 10px Inter, sans-serif';
    ctx.fillStyle = 'rgba(244, 114, 182, 0.85)';
    ctx.fillText('↶ U-TURN', sx(-250), sy(-204));
    ctx.textAlign = 'left';
    ctx.fillText('FREE LEFT → FL', sx(100), sy(-110));
  }

  ctx.textBaseline = 'alphabetic';
  ctx.restore();
  return rects;
};
