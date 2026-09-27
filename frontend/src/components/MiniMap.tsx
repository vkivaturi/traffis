import React, { useRef, useEffect } from 'react';
import type { Vehicle, CameraState, TrafficLightData } from '../types/simulation';

interface MiniMapProps {
  vehicles: Vehicle[];
  camera: CameraState;
  viewportWidthMeters: number;
  onJumpToX: (x: number) => void;
  trafficLight?: TrafficLightData;
}

export const MiniMap: React.FC<MiniMapProps> = ({
  vehicles,
  camera,
  viewportWidthMeters,
  onJumpToX,
  trafficLight,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

    // Padding
    const padX = 24;
    const roadW = width - padX * 2;
    const roadY = 10;
    const roadH = height - 20;
    const laneH = roadH / 3;

    // Road asphalt background
    ctx.fillStyle = '#1e2430';
    ctx.fillRect(padX, roadY, roadW, roadH);

    // Lane dividing dashed lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // Line between lane 2 and lane 1
    ctx.beginPath();
    ctx.moveTo(padX, roadY + laneH);
    ctx.lineTo(padX + roadW, roadY + laneH);
    ctx.stroke();

    // Line between lane 1 and lane 0
    ctx.beginPath();
    ctx.moveTo(padX, roadY + laneH * 2);
    ctx.lineTo(padX + roadW, roadY + laneH * 2);
    ctx.stroke();

    ctx.setLineDash([]);

    // Edge lines
    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 1;
    ctx.strokeRect(padX, roadY, roadW, roadH);

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

    // Draw vehicles as glowing dots
    for (const v of vehicles) {
      const vx = padX + Math.min(1, Math.max(0, v.x / 1000)) * roadW;
      // Lane index 2 (left) is top, lane index 0 (right) is bottom
      const laneOffset = 2 - v.lane_index; // 2 -> 0, 1 -> 1, 0 -> 2
      const vy = roadY + (laneOffset + 0.5) * laneH;

      ctx.shadowColor = v.color || '#38bdf8';
      ctx.shadowBlur = 6;
      ctx.fillStyle = v.color || '#38bdf8';
      ctx.beginPath();
      ctx.arc(vx, vy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Traffic Signal Indicator on MiniMap
    const tlX = trafficLight?.x ?? 500;
    const tlPx = padX + (tlX / 1000) * roadW;
    const tlColor = trafficLight?.state === 'green' ? '#10b981' : trafficLight?.state === 'yellow' ? '#f59e0b' : '#ef4444';

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

    // Draw viewport camera indicator (visible range)
    const viewLeftM = Math.max(0, camera.x - viewportWidthMeters / 2);
    const viewRightM = Math.min(1000, camera.x + viewportWidthMeters / 2);
    const viewLeftPx = padX + (viewLeftM / 1000) * roadW;
    const viewWidthPx = Math.max(8, ((viewRightM - viewLeftM) / 1000) * roadW);

    ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.fillRect(viewLeftPx, roadY - 2, viewWidthPx, roadH + 4);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(viewLeftPx, roadY - 2, viewWidthPx, roadH + 4);

    // Camera Center reticle
    const camPx = padX + (camera.x / 1000) * roadW;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(camPx, roadY - 4);
    ctx.lineTo(camPx, roadY + roadH + 4);
    ctx.stroke();

  }, [vehicles, camera, viewportWidthMeters, trafficLight]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const padX = 24;
    const roadW = rect.width - padX * 2;
    const ratio = Math.max(0, Math.min(1, (clickX - padX) / roadW));
    onJumpToX(ratio * 1000);
  };

  return (
    <div
      style={{
        position: 'relative',
        height: '48px',
        backgroundColor: 'rgba(8, 12, 20, 0.95)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        cursor: 'pointer',
      }}
      title="Highway Radar (Click anywhere to jump camera)"
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
        Radar Overview [0m - 1000m]
      </div>
      <canvas
        ref={canvasRef}
        width={1400}
        height={48}
        onClick={handleClick}
        style={{
          width: '100%',
          height: '48px',
          display: 'block',
        }}
      />
    </div>
  );
};
