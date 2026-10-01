import React, { useRef, useEffect } from 'react';
import type { Vehicle, CameraState, TrafficLightData, ScenarioMetadata } from '../types/simulation';

interface MiniMapProps {
  vehicles: Vehicle[];
  camera: CameraState;
  viewportWidthMeters: number;
  onJumpToX: (x: number, y?: number) => void;
  trafficLight?: TrafficLightData;
  scenario?: ScenarioMetadata | null;
}

export const MiniMap: React.FC<MiniMapProps> = ({
  vehicles,
  camera,
  viewportWidthMeters,
  onJumpToX,
  trafficLight,
  scenario,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isIntersection = scenario?.type === 'intersection' || scenario?.id === 'three_way_intersection';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = '#0b101b';
    ctx.fillRect(0, 0, width, height);

    if (isIntersection) {
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
  }, [vehicles, camera, viewportWidthMeters, trafficLight, isIntersection]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (isIntersection) {
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

  return (
    <div
      style={{
        position: 'relative',
        height: '52px',
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
        {isIntersection ? '3-Way Radar Overview' : 'Radar Overview [0m - 1000m]'}
      </div>
      <canvas
        ref={canvasRef}
        width={1400}
        height={52}
        onClick={handleClick}
        style={{
          width: '100%',
          height: '52px',
          display: 'block',
        }}
      />
    </div>
  );
};
