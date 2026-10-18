// ----------------------------------------------------
// POLYLINE NETWORK RENDERER (GNT Circle & other curved-geometry scenarios)
// Draws lanes, junctions, centre lines, island, markings straight from .net.xml shapes.
// ----------------------------------------------------
import type { NetworkGeometry, LaneShape, Point, TrafficLightData } from '../types/simulation';

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
  trafficLight?: TrafficLightData,
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
  for (const j of geo.junctions) {
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

  // 4. Centre lines between opposing carriageways: double solid yellow (as on the 3-way intersection)
  const centreOffsetM = Math.max(1.5, 0.2 * zoom) / zoom;
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = Math.max(1.5, 0.25 * zoom);
  for (const c of geo.centre_lines) {
    for (const side of [centreOffsetM, -centreOffsetM]) {
      tracePath(ctx, offsetPolyline(c.shape, side), sx, sy);
      ctx.stroke();
    }
  }
  const centreLineEdges = new Set(geo.centre_lines.flatMap((c) => c.edges));

  // 5. Lane markings: dashed separators within a carriageway, solid edges
  const edges = groupByEdge(geo.lanes);
  const markW = Math.max(1, 0.15 * zoom);
  edges.forEach((lanes, edgeId) => {
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

    // Solid edges: kerb (left of lane 0, LHT) and the inner side of the top lane,
    // unless a double centre line already separates this carriageway from the opposing one
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    const kerb = lanes[0];
    tracePath(ctx, offsetPolyline(kerb.shape, kerb.width / 2 - 0.15), sx, sy);
    ctx.stroke();
    if (!centreLineEdges.has(edgeId)) {
      const inner = lanes[lanes.length - 1];
      tracePath(ctx, offsetPolyline(inner.shape, -(inner.width / 2 - 0.15)), sx, sy);
      ctx.stroke();
    }
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

  // 7b. Roundabout Traffic Signals (optional at GNT Circle rb_W)
  if (geo.signal_heads && geo.signal_heads.length > 0) {
    for (const head of geo.signal_heads) {
      const hw = head.width / 2;
      const nx = -Math.sin(head.heading);
      const ny = Math.cos(head.heading);

      // Stop Line across the lane
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = Math.max(2, 0.35 * zoom);
      ctx.beginPath();
      ctx.moveTo(sx(head.x - nx * hw), sy(head.y - ny * hw));
      ctx.lineTo(sx(head.x + nx * hw), sy(head.y + ny * hw));
      ctx.stroke();

      // Determine signal state for this group
      const grp = trafficLight?.signal_groups?.find((g) => g.id === head.group);
      const headState = grp?.state ?? (grp?.is_active_green ? 'green' : (trafficLight?.state ?? 'red'));

      // Roadside Signal Post
      const postDistM = hw + 1.2;
      const postWx = head.x - nx * postDistM;
      const postWy = head.y - ny * postDistM;
      const postSx = sx(postWx);
      const postSy = sy(postWy);

      ctx.save();
      ctx.translate(postSx, postSy);
      // World heading to canvas screen angle (screen Y is inverted)
      ctx.rotate(-head.heading);

      const hW = Math.max(10, Math.min(18, 2.8 * zoom));
      const hH = Math.max(24, Math.min(46, 7.2 * zoom));
      const lampR = Math.max(2.2, Math.min(4.5, 0.7 * zoom));

      // Dark housing box with subtle shadow
      ctx.fillStyle = '#090d16';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = Math.max(1, 0.15 * zoom);
      ctx.beginPath();
      ctx.roundRect(-hW / 2, -hH / 2, hW, hH, Math.max(2, 0.4 * zoom));
      ctx.fill();
      ctx.stroke();

      const spacing = hH * 0.28;

      // RED lamp (top)
      const redActive = headState === 'red';
      ctx.fillStyle = redActive ? '#ef4444' : '#450a0a';
      if (redActive) {
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = Math.max(4, 1.2 * zoom);
      }
      ctx.beginPath();
      ctx.arc(0, -spacing, lampR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // YELLOW lamp (mid)
      const yellowActive = headState === 'yellow';
      ctx.fillStyle = yellowActive ? '#f59e0b' : '#451a03';
      if (yellowActive) {
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = Math.max(4, 1.2 * zoom);
      }
      ctx.beginPath();
      ctx.arc(0, 0, lampR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // GREEN lamp (bottom)
      const greenActive = headState === 'green';
      ctx.fillStyle = greenActive ? '#10b981' : '#064e3b';
      if (greenActive) {
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = Math.max(4, 1.2 * zoom);
      }
      ctx.beginPath();
      ctx.arc(0, spacing, lampR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();

      // Micro badge label when zoomed in
      if (zoom > 1.8 && head.id === 'sig_NG_0') {
        const badgeText = `NG SIGNAL: ${headState.toUpperCase()}`;
        ctx.font = '800 10px JetBrains Mono, monospace';
        const bw = ctx.measureText(badgeText).width + 12;
        const bh = 18;
        const bx = postSx;
        const by = postSy - hH / 2 - 12;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = headState === 'green' ? '#10b981' : (headState === 'yellow' ? '#f59e0b' : '#ef4444');
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(bx - bw / 2, by - bh / 2, bw, bh, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, bx, by + 1);
      } else if (zoom > 1.8 && head.id === 'sig_FL_TL') {
        const badgeText = `RING FL→TL: ${headState.toUpperCase()}`;
        ctx.font = '800 10px JetBrains Mono, monospace';
        const bw = ctx.measureText(badgeText).width + 12;
        const bh = 18;
        const bx = postSx - 20;
        const by = postSy - hH / 2 - 12;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = headState === 'green' ? '#10b981' : (headState === 'yellow' ? '#f59e0b' : '#ef4444');
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(bx - bw / 2, by - bh / 2, bw, bh, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, bx, by + 1);
      }
    }
  }

  // 8. Arm labels: Nallagandla (NG), Flyover (FL), Tellapur (TL)
  const rects: LabelHitRect[] = [];
  ctx.font = '800 11px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const lb of geo.labels) {
    const px = sx(lb.x);
    const py = sy(lb.y);
    const hovered = hoveredLabelId === lb.id;
    const text = lb.name ? `${lb.name} (${lb.id})` : lb.id;
    const w = ctx.measureText(text).width + 20;
    const h = 24;
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
    for (const c of geo.callouts ?? []) {
      ctx.textAlign = c.align ?? 'center';
      ctx.fillText(c.text, sx(c.x), sy(c.y));
    }
  }

  ctx.textBaseline = 'alphabetic';
  ctx.restore();
  return rects;
};
