import React, { useRef, useEffect } from 'react';
import type { Vehicle, CameraState, TrafficLightData, ScenarioMetadata, NetworkInfo } from '../types/simulation';

const GEOMETRY_MAP_HEIGHT = 84;
const BAR_WIDTH = 1400;
const BAR_HEIGHT = 52;

interface MiniMapProps {
  vehicles: Vehicle[];
  camera: CameraState;
  viewportWidthMeters: number;
  onJumpToX: (x: number, y?: number) => void;
  trafficLight?: TrafficLightData;
  scenario?: ScenarioMetadata | null;
  networkInfo?: NetworkInfo | null;
}

export const MiniMap: React.FC<MiniMapProps> = ({
  vehicles,
  camera,
  viewportWidthMeters,
  onJumpToX,
  trafficLight,
  scenario,
  networkInfo,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isIntersection = scenario?.type === 'intersection' || scenario?.id === 'three_way_intersection';
  const geometry =
    networkInfo?.geometry && networkInfo.scenario?.id === scenario?.id ? networkInfo.geometry : null;
  // World -> minimap CSS-pixel transform for the 2D geometry overview (used by click handler)
  const geoTransformRef = useRef<{ scale: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (geometry) {
      // ----------------------------------------------------
      // 2D BOUNDING-BOX OVERVIEW (curved geometry, no signal marker)
      // ----------------------------------------------------
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      if (canvas.width !== Math.round(W * dpr)) canvas.width = Math.round(W * dpr);
      if (canvas.height !== Math.round(H * dpr)) canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = '#0b101b';
      ctx.fillRect(0, 0, W, H);

      const b = geometry.bounds;
      const scale = Math.min((W - 40) / (b.max_x - b.min_x), (H - 10) / (b.max_y - b.min_y));
      const ox = W / 2 - ((b.min_x + b.max_x) / 2) * scale;
      const oy = H / 2 + ((b.min_y + b.max_y) / 2) * scale;
      geoTransformRef.current = { scale, ox, oy };
      const px = (x: number) => ox + x * scale;
      const py = (y: number) => oy - y * scale;

      ctx.fillStyle = '#1e2430';
      for (const j of geometry.junctions) {
        ctx.beginPath();
        j.shape.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(px(x), py(y)) : ctx.lineTo(px(x), py(y))));
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = '#2b3445';
      ctx.lineJoin = 'round';
      for (const ln of geometry.lanes) {
        ctx.lineWidth = Math.max(1, ln.width * scale);
        ctx.beginPath();
        ln.shape.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(px(x), py(y)) : ctx.lineTo(px(x), py(y))));
        ctx.stroke();
      }
      if (geometry.roundabout) {
        ctx.fillStyle = '#166534';
        ctx.beginPath();
        ctx.arc(px(geometry.roundabout.x), py(geometry.roundabout.y), geometry.roundabout.island_radius * scale, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#f9a8d4';
      ctx.font = '700 8px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      for (const lb of geometry.labels) {
        ctx.fillText(lb.id, px(lb.x), Math.max(8, Math.min(H - 2, py(lb.y))));
      }

      for (const v of vehicles) {
        ctx.fillStyle = v.color || '#38bdf8';
        ctx.beginPath();
        ctx.arc(px(v.x), py(v.y), 1.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Camera viewport box (height estimated from the window aspect ratio)
      const viewW = viewportWidthMeters * scale;
      const viewH = viewW * Math.max(0.3, (window.innerHeight - 220) / Math.max(1, window.innerWidth));
      const camX = px(camera.x);
      const camY = py(camera.y);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.fillRect(camX - viewW / 2, camY - viewH / 2, viewW, viewH);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(camX - viewW / 2, camY - viewH / 2, viewW, viewH);
      return;
    }

    // Fixed-size radar bar for the original scenarios
    if (canvas.width !== BAR_WIDTH) canvas.width = BAR_WIDTH;
    if (canvas.height !== BAR_HEIGHT) canvas.height = BAR_HEIGHT;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = '#0b101b';
    ctx.fillRect(0, 0, width, height);

    if (scenario?.id === 'four_way_intersection') {
      // ----------------------------------------------------
      // 4-WAY CROSSROADS RADAR
      // ----------------------------------------------------
      const cx = width / 2;
      const cy = height / 2;
      const armLengthPx = Math.min((width - 60) / 2, (height - 10) / 2);
      const roadThickness = 10;

      // Draw horizontal arms (West to East)
      ctx.fillStyle = '#1e2430';
      ctx.fillRect(cx - armLengthPx, cy - roadThickness / 2, armLengthPx * 2, roadThickness);

      // Draw vertical arms (North to South)
      ctx.fillRect(cx - roadThickness / 2, cy - armLengthPx, roadThickness, armLengthPx * 2);

      // Medians
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      // West median
      ctx.beginPath();
      ctx.moveTo(cx - armLengthPx, cy);
      ctx.lineTo(cx, cy);
      ctx.stroke();

      // East median
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + armLengthPx, cy);
      ctx.stroke();

      // North median
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - armLengthPx);
      ctx.stroke();

      // South median
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy + armLengthPx);
      ctx.stroke();

      // Outer borders
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - armLengthPx, cy - roadThickness / 2, armLengthPx * 2, roadThickness);
      ctx.strokeRect(cx - roadThickness / 2, cy - armLengthPx, roadThickness, armLengthPx * 2);

      // Arm labels
      ctx.fillStyle = '#64748b';
      ctx.font = '700 8px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('WEST [-250m]', cx - armLengthPx + 4, cy - 7);
      ctx.textAlign = 'right';
      ctx.fillText('[+250m] EAST', cx + armLengthPx - 4, cy - 7);
      ctx.textAlign = 'center';
      ctx.fillText('NORTH [+250m]', cx, cy - armLengthPx + 8);
      ctx.fillText('SOUTH [-250m]', cx, cy + armLengthPx - 2);

      // Traffic Signal dot
      const tlColor =
        trafficLight?.state === 'green' ? '#10b981' : trafficLight?.state === 'yellow' ? '#f59e0b' : '#ef4444';
      ctx.shadowColor = tlColor;
      ctx.shadowBlur = 8;
      ctx.fillStyle = tlColor;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Vehicles as glowing dots
      for (const v of vehicles) {
        let dotX = cx;
        let dotY = cy;

        if (Math.abs(v.x) > Math.abs(v.y)) {
          // Primarily horizontal (West or East arm)
          const ratioX = Math.max(-1, Math.min(1, v.x / 250));
          dotX = cx + ratioX * armLengthPx;
          dotY = cy + (v.y > 0 ? -2 : 2);
        } else {
          // Primarily vertical (North or South arm)
          const ratioY = Math.max(-1, Math.min(1, v.y / 250));
          dotX = cx + (v.x > 0 ? 2 : -2);
          dotY = cy - ratioY * armLengthPx;
        }

        ctx.shadowColor = v.color || '#38bdf8';
        ctx.shadowBlur = 5;
        ctx.fillStyle = v.color || '#38bdf8';
        ctx.beginPath();
        ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Camera Viewport Box
      const camRatioX = Math.max(-1, Math.min(1, camera.x / 250));
      const camRatioY = Math.max(-1, Math.min(1, camera.y / 250));
      const camDotX = cx + camRatioX * armLengthPx;
      const camDotY = cy - camRatioY * armLengthPx;

      const boxW = Math.max(16, (viewportWidthMeters / 500) * (armLengthPx * 2));
      const boxH = Math.max(12, boxW * 0.4);

      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.fillRect(camDotX - boxW / 2, camDotY - boxH / 2, boxW, boxH);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(camDotX - boxW / 2, camDotY - boxH / 2, boxW, boxH);
    } else if (isIntersection) {
      // ----------------------------------------------------
      // 3-WAY INTERSECTION RADAR
      // ----------------------------------------------------
      const cx = width / 2;
      const cy = height - 14; // Center junction near bottom center
      const armLengthPx = Math.min((width - 60) / 2, height - 20);
      const roadThickness = 12;

      // Draw West Arm (from cx - armLengthPx to cx, at cy)
      ctx.fillStyle = '#1e2430';
      ctx.fillRect(cx - armLengthPx, cy - roadThickness / 2, armLengthPx, roadThickness);

      // Draw East Arm (from cx to cx + armLengthPx, at cy)
      ctx.fillRect(cx, cy - roadThickness / 2, armLengthPx, roadThickness);

      // Draw North Arm (from cy down to cy - armLengthPx, at cx)
      ctx.fillRect(cx - roadThickness / 2, cy - armLengthPx, roadThickness, armLengthPx);

      // Center junction
      ctx.fillRect(cx - roadThickness / 2, cy - roadThickness / 2, roadThickness, roadThickness);

      // Medians
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      // West median
      ctx.beginPath();
      ctx.moveTo(cx - armLengthPx, cy);
      ctx.lineTo(cx, cy);
      ctx.stroke();

      // East median
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + armLengthPx, cy);
      ctx.stroke();

      // North median
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - armLengthPx);
      ctx.stroke();

      // Outer borders
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - armLengthPx, cy - roadThickness / 2, armLengthPx * 2, roadThickness);
      ctx.strokeRect(cx - roadThickness / 2, cy - armLengthPx, roadThickness, armLengthPx);

      // Arm labels
      ctx.fillStyle = '#64748b';
      ctx.font = '700 8px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('WEST [-250m]', cx - armLengthPx + 4, cy - 8);
      ctx.textAlign = 'right';
      ctx.fillText('[+250m] EAST', cx + armLengthPx - 4, cy - 8);
      ctx.textAlign = 'center';
      ctx.fillText('NORTH [+250m]', cx, cy - armLengthPx - 4);

      // Traffic Signal dot
      const tlColor =
        trafficLight?.state === 'green' ? '#10b981' : trafficLight?.state === 'yellow' ? '#f59e0b' : '#ef4444';
      ctx.shadowColor = tlColor;
      ctx.shadowBlur = 8;
      ctx.fillStyle = tlColor;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Vehicles as glowing dots
      // In 3-way, world coords: West arm X in [-250, 0], East arm X in [0, 250], North arm Y in [0, 250]
      for (const v of vehicles) {
        let dotX = cx;
        let dotY = cy;

        if (Math.abs(v.x) > Math.abs(v.y)) {
          // Primarily horizontal (West or East arm)
          const ratioX = Math.max(-1, Math.min(1, v.x / 250));
          dotX = cx + ratioX * armLengthPx;
          dotY = cy + (v.y > 0 ? -2 : 2);
        } else {
          // Primarily vertical (North arm)
          const ratioY = Math.max(0, Math.min(1, v.y / 250));
          dotX = cx + (v.x > 0 ? 2 : -2);
          dotY = cy - ratioY * armLengthPx;
        }

        ctx.shadowColor = v.color || '#38bdf8';
        ctx.shadowBlur = 5;
        ctx.fillStyle = v.color || '#38bdf8';
        ctx.beginPath();
        ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Camera Viewport Box
      const camRatioX = Math.max(-1, Math.min(1, camera.x / 250));
      const camRatioY = Math.max(0, Math.min(1, camera.y / 250));
      const camDotX = cx + camRatioX * armLengthPx;
      const camDotY = cy - camRatioY * armLengthPx;

      const boxW = Math.max(16, (viewportWidthMeters / 500) * (armLengthPx * 2));
      const boxH = Math.max(12, boxW * 0.4);

      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.fillRect(camDotX - boxW / 2, camDotY - boxH / 2, boxW, boxH);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(camDotX - boxW / 2, camDotY - boxH / 2, boxW, boxH);
    } else {
      // ----------------------------------------------------
      // 1000m STRAIGHT HIGHWAY RADAR
      // ----------------------------------------------------
      const padX = 24;
      const roadW = width - padX * 2;
      const roadY = 10;
      const roadH = height - 20;
      const laneH = roadH / 4;

      // Road asphalt background
      ctx.fillStyle = '#1e2430';
      ctx.fillRect(padX, roadY, roadW, roadH);

      // Lane dividing dashed lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      ctx.beginPath();
      ctx.moveTo(padX, roadY + laneH);
      ctx.lineTo(padX + roadW, roadY + laneH);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(padX, roadY + laneH * 3);
      ctx.lineTo(padX + roadW, roadY + laneH * 3);
      ctx.stroke();

      ctx.setLineDash([]);

      // Center Median
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padX, roadY + laneH * 2);
      ctx.lineTo(padX + roadW, roadY + laneH * 2);
      ctx.stroke();

      // Outer Edge lines
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.strokeRect(padX, roadY, roadW, roadH);

      // Mini Direction Indicators (Left-Hand Traffic: EB Top, WB Bottom)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.font = '700 8px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('EASTBOUND →', padX + 8, roadY + laneH - 2);
      ctx.textAlign = 'right';
      ctx.fillText('← WESTBOUND', padX + roadW - 8, roadY + laneH * 3 + 7);

      // Distance tick markers
      ctx.fillStyle = '#64748b';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      const markers = [0, 250, 500, 750, 1000];
      markers.forEach((m) => {
        const mx = padX + (m / 1000) * roadW;
        ctx.beginPath();
        ctx.moveTo(mx, roadY + roadH);
        ctx.lineTo(mx, roadY + roadH + 4);
        ctx.strokeStyle = '#475569';
        ctx.stroke();
        ctx.fillText(`${m}m`, mx, roadY + roadH + 13);
      });

      // Draw vehicles as glowing dots (LHT: EB Top [slots 0, 1], WB Bottom [slots 2, 3])
      for (const v of vehicles) {
        const vx = padX + Math.min(1, Math.max(0, v.x / 1000)) * roadW;
        const isEast = v.direction === 'east' || v.y > 0 || (v.angle >= 45 && v.angle <= 135);
        const slot = isEast ? (v.lane_index === 0 ? 0 : 1) : (v.lane_index === 1 ? 2 : 3);
        const vy = roadY + (slot + 0.5) * laneH;

        ctx.shadowColor = v.color || '#38bdf8';
        ctx.shadowBlur = 6;
        ctx.fillStyle = v.color || '#38bdf8';
        ctx.beginPath();
        ctx.arc(vx, vy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Traffic Signal Indicator on MiniMap
      const tlX = trafficLight?.x ?? 500;
      const tlPx = padX + (tlX / 1000) * roadW;
      const tlColor =
        trafficLight?.state === 'green' ? '#10b981' : trafficLight?.state === 'yellow' ? '#f59e0b' : '#ef4444';

      ctx.strokeStyle = tlColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(tlPx, roadY - 2);
      ctx.lineTo(tlPx, roadY + roadH + 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Glowing Signal Lamp Marker
      ctx.shadowColor = tlColor;
      ctx.shadowBlur = 8;
      ctx.fillStyle = tlColor;
      ctx.beginPath();
      ctx.arc(tlPx, roadY - 5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw viewport camera indicator
      const viewLeftM = Math.max(0, camera.x - viewportWidthMeters / 2);
      const viewRightM = Math.min(1000, camera.x + viewportWidthMeters / 2);
      const viewLeftPx = padX + (viewLeftM / 1000) * roadW;
      const viewWidthPx = Math.max(8, ((viewRightM - viewLeftM) / 1000) * roadW);

      ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.fillRect(viewLeftPx, roadY - 2, viewWidthPx, roadH + 4);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(viewLeftPx, roadY - 2, viewWidthPx, roadH + 4);

      const camPx = padX + (camera.x / 1000) * roadW;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(camPx, roadY - 4);
      ctx.lineTo(camPx, roadY + roadH + 4);
      ctx.stroke();
    }
  }, [vehicles, camera, viewportWidthMeters, trafficLight, isIntersection, scenario, geometry]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const geoT = geoTransformRef.current;
    if (geometry && geoT) {
      onJumpToX((clickX - geoT.ox) / geoT.scale, (geoT.oy - clickY) / geoT.scale);
    } else if (scenario?.id === 'four_way_intersection') {
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const armLengthPx = Math.min((rect.width - 60) / 2, (rect.height - 10) / 2);

      const dx = clickX - cx;
      const dy = clickY - cy;

      if (Math.abs(dx) > Math.abs(dy)) {
        // West or East arm
        const worldX = (dx / armLengthPx) * 250;
        onJumpToX(Math.max(-250, Math.min(250, worldX)), 0);
      } else {
        // North or South arm
        const worldY = (-dy / armLengthPx) * 250;
        onJumpToX(0, Math.max(-250, Math.min(250, worldY)));
      }
    } else if (isIntersection) {
      const cx = rect.width / 2;
      const cy = rect.height - 14;
      const armLengthPx = Math.min((rect.width - 60) / 2, rect.height - 20);

      const dx = clickX - cx;
      const dy = clickY - cy;

      if (Math.abs(dx) > Math.abs(dy)) {
        // West or East arm
        const worldX = (dx / armLengthPx) * 250;
        onJumpToX(Math.max(-250, Math.min(250, worldX)), 0);
      } else {
        // North arm
        const worldY = (-dy / armLengthPx) * 250;
        onJumpToX(0, Math.max(0, Math.min(250, worldY)));
      }
    } else {
      const padX = 24;
      const roadW = rect.width - padX * 2;
      const ratio = Math.max(0, Math.min(1, (clickX - padX) / roadW));
      onJumpToX(ratio * 1000, 0);
    }
  };

  const mapHeight = geometry ? GEOMETRY_MAP_HEIGHT : BAR_HEIGHT;
  const radarLabel = geometry
    ? `${scenario?.name ?? 'Network'} Overview`
    : scenario?.id === 'four_way_intersection'
      ? '4-Way Crossroads Radar Overview'
      : isIntersection
      ? '3-Way T-Junction Radar Overview'
      : 'Radar Overview [0m - 1000m]';

  return (
    <div
      style={{
        position: 'relative',
        height: `${mapHeight}px`,
        backgroundColor: 'rgba(8, 12, 20, 0.95)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        cursor: 'pointer',
      }}
      title="Radar Overview (Click anywhere to jump camera)"
    >
      <div
        style={{
          position: 'absolute',
          left: '12px',
          top: '4px',
          fontSize: '0.65rem',
          fontWeight: 700,
          color: '#64748b',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
        }}
      >
        {radarLabel}
      </div>
      <canvas
        ref={canvasRef}
        width={BAR_WIDTH}
        height={BAR_HEIGHT}
        onClick={handleClick}
        style={{
          width: '100%',
          height: `${mapHeight}px`,
          display: 'block',
        }}
      />
    </div>
  );
};
