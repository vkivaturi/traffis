import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Vehicle, CameraState, TrafficLightData, TrafficSignalColor } from '../types/simulation';
import { ZoomIn, ZoomOut, Maximize2, Crosshair, Navigation, LocateFixed } from 'lucide-react';

interface CanvasViewProps {
  vehicles: Vehicle[];
  camera: CameraState;
  setCamera: React.Dispatch<React.SetStateAction<CameraState>>;
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string | null) => void;
  onViewportMetersChange: (meters: number) => void;
  trafficLight?: TrafficLightData;
  onTrafficLightClick?: () => void;
}

interface InterpolatedVehicle {
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  speed: number;
  speed_kmh: number;
  acceleration: number;
  angle: number;
  type: string;
  color: string;
  length: number;
  width: number;
  lane_index: number;
  leader_id?: string | null;
  leader_dist?: number | null;
}

export const CanvasView: React.FC<CanvasViewProps> = ({
  vehicles,
  camera,
  setCamera,
  selectedVehicleId,
  onSelectVehicle,
  onViewportMetersChange,
  trafficLight,
  onTrafficLightClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; camX: number; camY: number }>({
    mouseX: 0,
    mouseY: 0,
    camX: 500,
    camY: -4.8,
  });

  const interpVehiclesRef = useRef<Map<string, InterpolatedVehicle>>(new Map());
  const hoveredVehicleIdRef = useRef<string | null>(null);

  // Sync incoming vehicle data into interpolation map
  useEffect(() => {
    const currentMap = interpVehiclesRef.current;
    const incomingIds = new Set<string>();

    for (const v of vehicles) {
      incomingIds.add(v.id);
      const existing = currentMap.get(v.id);
      if (existing) {
        existing.targetX = v.x;
        existing.targetY = v.y;
        existing.speed = v.speed;
        existing.speed_kmh = v.speed_kmh;
        existing.acceleration = v.acceleration;
        existing.angle = v.angle;
        existing.color = v.color;
        existing.lane_index = v.lane_index;
        existing.leader_id = v.leader_id;
        existing.leader_dist = v.leader_dist;
      } else {
        currentMap.set(v.id, {
          currentX: v.x,
          currentY: v.y,
          targetX: v.x,
          targetY: v.y,
          speed: v.speed,
          speed_kmh: v.speed_kmh,
          acceleration: v.acceleration,
          angle: v.angle,
          type: v.type,
          color: v.color,
          length: v.length,
          width: v.width,
          lane_index: v.lane_index,
          leader_id: v.leader_id,
          leader_dist: v.leader_dist,
        });
      }
    }

    // Remove arrived vehicles
    for (const id of currentMap.keys()) {
      if (!incomingIds.has(id)) {
        currentMap.delete(id);
      }
    }
  }, [vehicles]);

  // Handle follow mode
  useEffect(() => {
    if (camera.followingId) {
      const followed = interpVehiclesRef.current.get(camera.followingId);
      if (followed) {
        setCamera((prev) => ({
          ...prev,
          x: Math.max(0, Math.min(1000, followed.currentX)),
        }));
      }
    }
  }, [camera.followingId, vehicles, setCamera]);

  // Handle resize and report viewport visible meters
  useEffect(() => {
    const updateSize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      // Report visible road width in meters
      const visibleMeters = rect.width / camera.zoom;
      onViewportMetersChange(visibleMeters);
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [camera.zoom, onViewportMetersChange]);

  // Main 60FPS render loop
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;

      const canvas = canvasRef.current;
      if (!canvas) {
        animId = requestAnimationFrame(render);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animId = requestAnimationFrame(render);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Coordinate transforms: world meters -> screen pixels
      const cx = width / 2;
      const cy = height / 2;
      const zoom = camera.zoom;
      const camX = camera.x;
      const camY = camera.y;

      const worldToScreenX = (wx: number) => cx + (wx - camX) * zoom;
      // In SUMO, road lanes have negative Y (from 0 to -9.6)
      // Screen Y increases downwards, so screenY = cy + (- (wy - camY)) * zoom
      const worldToScreenY = (wy: number) => cy + (-(wy - camY)) * zoom;

      // 1. Draw Background (Dark Terrain / Grass with subtle grid)
      ctx.fillStyle = '#080c14';
      ctx.fillRect(0, 0, width, height);

      // Terrain grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 1;
      const gridSpacingPx = 50 * zoom;
      if (gridSpacingPx > 10) {
        const startGridX = worldToScreenX(Math.floor((camX - width / (2 * zoom)) / 50) * 50);
        for (let gx = startGridX; gx < width + 100; gx += gridSpacingPx) {
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, height);
          ctx.stroke();
        }
      }

      // 2. Draw 1000m Road
      // Road goes from x = 0 to x = 1000.
      // Upper bound y = 0.0, Lower bound y = -9.6.
      const roadScreenX1 = worldToScreenX(0);
      const roadScreenX2 = worldToScreenX(1000);
      const roadScreenYTop = worldToScreenY(0.0);
      const roadScreenYBottom = worldToScreenY(-9.6);
      const roadScreenHeight = roadScreenYBottom - roadScreenYTop;
      const roadScreenWidth = roadScreenX2 - roadScreenX1;

      // Embankment / Shoulders
      const shoulderH = 4 * zoom;
      // Top Shoulder
      ctx.fillStyle = '#111827';
      ctx.fillRect(roadScreenX1 - 20 * zoom, roadScreenYTop - shoulderH, roadScreenWidth + 40 * zoom, shoulderH);
      // Bottom Shoulder
      ctx.fillRect(roadScreenX1 - 20 * zoom, roadScreenYBottom, roadScreenWidth + 40 * zoom, shoulderH);

      // Asphalt base
      const roadGrad = ctx.createLinearGradient(0, roadScreenYTop, 0, roadScreenYBottom);
      roadGrad.addColorStop(0, '#1c2230');
      roadGrad.addColorStop(0.5, '#1e2535');
      roadGrad.addColorStop(1, '#1a202c');
      ctx.fillStyle = roadGrad;
      ctx.fillRect(roadScreenX1, roadScreenYTop, roadScreenWidth, roadScreenHeight);

      // Lane dividers (3 lanes: widths 3.2m each)
      // Divider 1 (between Lane 2 and 1): y = -3.2
      // Divider 2 (between Lane 1 and 0): y = -6.4
      const div1Y = worldToScreenY(-3.2);
      const div2Y = worldToScreenY(-6.4);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = Math.max(1, 0.2 * zoom);
      ctx.setLineDash([0.8 * zoom, 1.2 * zoom]);

      // Draw dashed line 1
      ctx.beginPath();
      ctx.moveTo(roadScreenX1, div1Y);
      ctx.lineTo(roadScreenX2, div1Y);
      ctx.stroke();

      // Draw dashed line 2
      ctx.beginPath();
      ctx.moveTo(roadScreenX1, div2Y);
      ctx.lineTo(roadScreenX2, div2Y);
      ctx.stroke();

      ctx.setLineDash([]);

      // Road edge lines (Yellow/White solid)
      ctx.strokeStyle = '#fcd34d';
      ctx.lineWidth = Math.max(1.5, 0.25 * zoom);

      // Top edge (y = 0.0)
      ctx.beginPath();
      ctx.moveTo(roadScreenX1, roadScreenYTop);
      ctx.lineTo(roadScreenX2, roadScreenYTop);
      ctx.stroke();

      // Bottom edge (y = -9.6)
      ctx.beginPath();
      ctx.moveTo(roadScreenX1, roadScreenYBottom);
      ctx.lineTo(roadScreenX2, roadScreenYBottom);
      ctx.stroke();

      // 3. Lane labels & direction arrows painted on road
      const laneHeightPx = roadScreenHeight / 3;
      if (zoom > 4) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.font = `600 ${Math.max(10, Math.min(16, 1.2 * zoom))}px Inter, sans-serif`;
        ctx.textAlign = 'left';

        // Draw at intervals
        for (let mx = 50; mx <= 950; mx += 150) {
          const sx = worldToScreenX(mx);
          if (sx > -100 && sx < width + 100) {
            ctx.fillText('L2 (Fast)', sx, div1Y - laneHeightPx * 0.4);
            ctx.fillText('L1 (Middle)', sx, div2Y - laneHeightPx * 0.4);
            ctx.fillText('L0 (Slow)', sx, roadScreenYBottom - laneHeightPx * 0.4);
          }
        }
      }

      // 4. Distance markers (every 50m and 100m)
      for (let m = 0; m <= 1000; m += 50) {
        const mx = worldToScreenX(m);
        if (mx < -50 || mx > width + 50) continue;

        const isMajor = m % 100 === 0;
        ctx.strokeStyle = isMajor ? 'rgba(56, 189, 248, 0.5)' : 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = isMajor ? 2 : 1;

        ctx.beginPath();
        ctx.moveTo(mx, roadScreenYTop - 6);
        ctx.lineTo(mx, roadScreenYBottom + 6);
        ctx.stroke();

        // Distance text badge
        ctx.fillStyle = isMajor ? '#38bdf8' : '#94a3b8';
        ctx.font = `700 ${isMajor ? 11 : 9}px JetBrains Mono, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`${m}m`, mx, roadScreenYBottom + 20);
      }

      // 5. Start Gate (0m) & Finish Gate (1000m)
      // Start Gate
      if (roadScreenX1 > -200 && roadScreenX1 < width + 200) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
        ctx.fillRect(roadScreenX1 - 4, roadScreenYTop - 12, 8, roadScreenHeight + 24);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 3;
        ctx.strokeRect(roadScreenX1 - 4, roadScreenYTop - 12, 8, roadScreenHeight + 24);

        ctx.fillStyle = '#10b981';
        ctx.font = '800 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('START (0m)', roadScreenX1, roadScreenYTop - 20);
      }

      // Finish Gate
      if (roadScreenX2 > -200 && roadScreenX2 < width + 200) {
        ctx.fillStyle = 'rgba(244, 63, 94, 0.2)';
        ctx.fillRect(roadScreenX2 - 4, roadScreenYTop - 12, 8, roadScreenHeight + 24);
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 3;
        ctx.strokeRect(roadScreenX2 - 4, roadScreenYTop - 12, 8, roadScreenHeight + 24);

        ctx.fillStyle = '#f43f5e';
        ctx.font = '800 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('FINISH (1000m)', roadScreenX2, roadScreenYTop - 20);
      }

      // 5.5. Traffic Signal Intersection (500m)
      const tlX = trafficLight?.x ?? 500.0;
      const tlScreenX = worldToScreenX(tlX);
      const tlState = trafficLight?.state ?? 'green';
      const tlColorHex = tlState === 'green' ? '#10b981' : tlState === 'yellow' ? '#f59e0b' : '#ef4444';

      if (tlScreenX > -250 && tlScreenX < width + 250) {
        // (A) Stop Line Markings on the road (at x = 497.5m, right before the 500m junction)
        const stopLineScreenX = worldToScreenX(tlX - 2.5);

        // Ground illumination glow on asphalt
        if (zoom > 2) {
          const glowGrad = ctx.createRadialGradient(
            stopLineScreenX,
            (roadScreenYTop + roadScreenYBottom) / 2,
            5,
            stopLineScreenX,
            (roadScreenYTop + roadScreenYBottom) / 2,
            Math.max(25, 18 * zoom)
          );
          glowGrad.addColorStop(
            0,
            tlState === 'green'
              ? 'rgba(16, 185, 129, 0.28)'
              : tlState === 'yellow'
              ? 'rgba(245, 158, 11, 0.35)'
              : 'rgba(239, 68, 68, 0.42)'
          );
          glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = glowGrad;
          ctx.fillRect(stopLineScreenX - 25 * zoom, roadScreenYTop - 4, 50 * zoom, roadScreenHeight + 8);
        }

        // Rumble strips / warning bars on road before stop line
        if (zoom > 3) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
          for (let rx = 1; rx <= 3; rx++) {
            const rbx = worldToScreenX(tlX - 2.5 - rx * 3.5);
            ctx.fillRect(rbx, roadScreenYTop + 2, Math.max(1.5, 0.3 * zoom), roadScreenHeight - 4);
          }
        }

        // Thick Solid White Stop Bar
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(
          stopLineScreenX - Math.max(2, 0.3 * zoom),
          roadScreenYTop,
          Math.max(3.5, 0.6 * zoom),
          roadScreenHeight
        );

        // Painted STOP labels in each lane
        if (zoom > 5) {
          ctx.save();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.font = `800 ${Math.max(9, Math.min(15, 1.1 * zoom))}px Inter, sans-serif`;
          ctx.textAlign = 'right';
          const lHeight = roadScreenHeight / 3;
          const stopLabelX = stopLineScreenX - 4 * zoom;
          ctx.fillText('STOP', stopLabelX, roadScreenYTop + lHeight * 0.65);
          ctx.fillText('STOP', stopLabelX, roadScreenYTop + lHeight * 1.65);
          ctx.fillText('STOP', stopLabelX, roadScreenYTop + lHeight * 2.65);
          ctx.restore();
        }

        // (B) Overhead Gantry Structure
        const colW = Math.max(5, 0.7 * zoom);
        const gantryTop = roadScreenYTop - 32 * Math.min(2.0, Math.max(0.6, zoom / 8));

        // Top Column Support
        ctx.fillStyle = '#334155';
        ctx.fillRect(tlScreenX - colW / 2, gantryTop, colW, roadScreenYTop - gantryTop);
        // Bottom Column Base
        ctx.fillRect(tlScreenX - colW / 2, roadScreenYBottom, colW, 18);

        // Steel truss beam spanning across road
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(tlScreenX - colW, gantryTop, colW * 2, roadScreenHeight + (roadScreenYTop - gantryTop) + 18);
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(tlScreenX - colW, gantryTop, colW * 2, roadScreenHeight + (roadScreenYTop - gantryTop) + 18);

        // (C) Suspended Traffic Signal Heads (one over each lane: Lane 2, 1, 0)
        const laneYs = [-1.6, -4.8, -8.0];
        laneYs.forEach((ly) => {
          const sy = worldToScreenY(ly);
          const headW = Math.max(16, 2.8 * zoom);
          const headH = Math.max(36, 6.2 * zoom);
          const hx = tlScreenX - headW / 2;
          const hy = sy - headH / 2;

          // Housing Box
          ctx.fillStyle = '#0b0f19';
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(hx, hy, headW, headH, 4);
          ctx.fill();
          ctx.stroke();

          // Yellow visor backplate outline
          ctx.strokeStyle = '#eab308';
          ctx.lineWidth = 1;
          ctx.strokeRect(hx - 2, hy - 2, headW + 4, headH + 4);

          // 3 Lamps: Red (top), Yellow (mid), Green (bot)
          const lampRadius = Math.max(2.5, headW * 0.22);
          const lampSpacing = headH / 4;

          const lampConfigs: { color: TrafficSignalColor; activeHex: string; offHex: string; cy: number }[] = [
            { color: 'red', activeHex: '#ef4444', offHex: '#250f11', cy: hy + lampSpacing },
            { color: 'yellow', activeHex: '#f59e0b', offHex: '#20180a', cy: hy + lampSpacing * 2 },
            { color: 'green', activeHex: '#10b981', offHex: '#081a13', cy: hy + lampSpacing * 3 },
          ];

          lampConfigs.forEach((lc) => {
            const isActive = tlState === lc.color;
            ctx.save();
            ctx.beginPath();
            ctx.arc(tlScreenX, lc.cy, lampRadius, 0, Math.PI * 2);

            if (isActive) {
              ctx.shadowColor = lc.activeHex;
              ctx.shadowBlur = Math.max(8, 16 * Math.min(2.5, zoom / 5));
              ctx.fillStyle = lc.activeHex;
              ctx.fill();

              // Bright core reflection
              ctx.beginPath();
              ctx.arc(tlScreenX, lc.cy, lampRadius * 0.45, 0, Math.PI * 2);
              ctx.fillStyle = '#ffffff';
              ctx.fill();
            } else {
              ctx.fillStyle = lc.offHex;
              ctx.fill();
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
            ctx.restore();
          });
        });

        // (D) Floating Signal Status Tag above the Gantry
        const tagY = gantryTop - 18;
        const tagText = `SIGNAL: ${tlState.toUpperCase()} [${trafficLight?.phase_remaining.toFixed(1) ?? '0'}s]`;
        ctx.font = '800 11px JetBrains Mono, monospace';
        const tagMetrics = ctx.measureText(tagText);
        const tagW = tagMetrics.width + 16;
        const tagH = 22;

        ctx.fillStyle = 'rgba(11, 15, 25, 0.85)';
        ctx.strokeStyle = tlColorHex;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(tlScreenX - tagW / 2, tagY - tagH / 2, tagW, tagH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = tlColorHex;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tagText, tlScreenX, tagY);
        ctx.textBaseline = 'alphabetic'; // Reset
      }

      // 6. Render Vehicles with interpolation & rich aesthetics
      const interpMap = interpVehiclesRef.current;
      interpMap.forEach((v, vid) => {
        // Smoothly interpolate towards target
        const lerpFactor = Math.min(1.0, dt * 15);
        v.currentX += (v.targetX - v.currentX) * lerpFactor;
        v.currentY += (v.targetY - v.currentY) * lerpFactor;

        const vx = worldToScreenX(v.currentX);
        const vy = worldToScreenY(v.currentY);

        // Frustum cull vehicles outside screen
        if (vx < -100 || vx > width + 100) return;

        const vLenPx = Math.max(12, v.length * zoom);
        const vWidPx = Math.max(6, v.width * zoom);

        ctx.save();
        ctx.translate(vx, vy);

        // Leader beam if selected or has leader
        if (vid === selectedVehicleId && v.leader_dist && v.leader_dist < 100) {
          const leaderDistPx = v.leader_dist * zoom;
          ctx.strokeStyle = v.leader_dist < 15 ? 'rgba(244, 63, 94, 0.6)' : 'rgba(56, 189, 248, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(vLenPx / 2, 0);
          ctx.lineTo(vLenPx / 2 + leaderDistPx, 0);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Headlight glow projected forward (direction is +X in SUMO straight road)
        if (zoom > 3) {
          const lightLen = Math.min(120, 20 * zoom);
          const lightGrad = ctx.createRadialGradient(
            vLenPx / 2, 0, 2,
            vLenPx / 2 + lightLen * 0.7, 0, lightLen
          );
          lightGrad.addColorStop(0, 'rgba(254, 240, 138, 0.35)');
          lightGrad.addColorStop(0.5, 'rgba(254, 240, 138, 0.1)');
          lightGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');

          ctx.fillStyle = lightGrad;
          ctx.beginPath();
          ctx.moveTo(vLenPx / 2, -vWidPx * 0.4);
          ctx.lineTo(vLenPx / 2 + lightLen, -vWidPx * 1.5);
          ctx.lineTo(vLenPx / 2 + lightLen, vWidPx * 1.5);
          ctx.lineTo(vLenPx / 2, vWidPx * 0.4);
          ctx.closePath();
          ctx.fill();
        }

        // Drop shadow under vehicle
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.roundRect(-vLenPx / 2 + 2, -vWidPx / 2 + 3, vLenPx, vWidPx, 4);
        ctx.fill();

        // Vehicle Body
        ctx.fillStyle = v.color || '#38bdf8';
        ctx.beginPath();
        const cornerRadius = v.type === 'truck' ? 2 : 4;
        ctx.roundRect(-vLenPx / 2, -vWidPx / 2, vLenPx, vWidPx, cornerRadius);
        ctx.fill();

        // Vehicle border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Details based on vehicle type
        if (zoom > 4) {
          // Windshield (dark glass)
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          const wsX = v.type === 'truck' ? vLenPx * 0.2 : vLenPx * 0.1;
          const wsW = vLenPx * 0.2;
          const wsH = vWidPx * 0.75;
          ctx.beginPath();
          ctx.roundRect(wsX - wsW / 2, -wsH / 2, wsW, wsH, 2);
          ctx.fill();

          // Rear window
          if (v.type !== 'truck') {
            const rwX = -vLenPx * 0.25;
            const rwW = vLenPx * 0.15;
            const rwH = vWidPx * 0.7;
            ctx.beginPath();
            ctx.roundRect(rwX - rwW / 2, -rwH / 2, rwW, rwH, 2);
            ctx.fill();
          } else {
            // Truck cargo ribs
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 1.5;
            for (let rx = -vLenPx * 0.35; rx <= vLenPx * 0.1; rx += vLenPx * 0.12) {
              ctx.beginPath();
              ctx.moveTo(rx, -vWidPx * 0.45);
              ctx.lineTo(rx, vWidPx * 0.45);
              ctx.stroke();
            }
          }
        }

        // Taillights (Red LEDs at rear)
        const isBraking = v.acceleration < -0.5;
        const tailColor = isBraking ? '#ef4444' : '#b91c1c';
        const tailGlow = isBraking ? 10 : 4;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = tailGlow;
        ctx.fillStyle = tailColor;

        // Left taillight
        ctx.fillRect(-vLenPx / 2, -vWidPx * 0.4, 2, vWidPx * 0.2);
        // Right taillight
        ctx.fillRect(-vLenPx / 2, vWidPx * 0.2, 2, vWidPx * 0.2);
        ctx.shadowBlur = 0;

        // Front Headlights (Yellow/White)
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(vLenPx / 2 - 2, -vWidPx * 0.4, 2, vWidPx * 0.2);
        ctx.fillRect(vLenPx / 2 - 2, vWidPx * 0.2, 2, vWidPx * 0.2);

        // Selection & Hover reticle
        const isSelected = vid === selectedVehicleId;
        const isHovered = vid === hoveredVehicleIdRef.current;

        if (isSelected || isHovered) {
          ctx.strokeStyle = isSelected ? '#38bdf8' : '#e2e8f0';
          ctx.lineWidth = isSelected ? 2 : 1;
          const reticlePad = 6;
          ctx.strokeRect(
            -vLenPx / 2 - reticlePad,
            -vWidPx / 2 - reticlePad,
            vLenPx + reticlePad * 2,
            vWidPx + reticlePad * 2
          );

          if (isSelected) {
            // Glowing corners
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 8;
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2.5;
            const cornerLen = 6;
            // Top-left
            ctx.beginPath();
            ctx.moveTo(-vLenPx / 2 - reticlePad, -vWidPx / 2 - reticlePad + cornerLen);
            ctx.lineTo(-vLenPx / 2 - reticlePad, -vWidPx / 2 - reticlePad);
            ctx.lineTo(-vLenPx / 2 - reticlePad + cornerLen, -vWidPx / 2 - reticlePad);
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }

        // Floating HUD badge above car
        if (zoom > 3.5 || isSelected) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1;
          const label = `${v.speed_kmh} km/h`;
          ctx.font = '700 10px JetBrains Mono, monospace';
          const textW = ctx.measureText(label).width;
          const badgeW = textW + 10;
          const badgeH = 16;
          const badgeY = -vWidPx / 2 - badgeH - 6;

          ctx.beginPath();
          ctx.roundRect(-badgeW / 2, badgeY, badgeW, badgeH, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isSelected ? '#38bdf8' : '#f8fafc';
          ctx.textAlign = 'center';
          ctx.fillText(label, 0, badgeY + 12);
        }

        ctx.restore();
      });

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [camera, selectedVehicleId, trafficLight]);

  // Pan interaction
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only primary button
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      camX: camera.x,
      camY: camera.y,
    };
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDragging) {
      const dx = (e.clientX - dragStartRef.current.mouseX) / camera.zoom;
      const dy = (e.clientY - dragStartRef.current.mouseY) / camera.zoom;

      setCamera((prev) => ({
        ...prev,
        x: Math.max(0, Math.min(1000, dragStartRef.current.camX - dx)),
        y: Math.max(-15, Math.min(5, dragStartRef.current.camY + dy)),
        followingId: null, // Cancel follow mode on manual pan
      }));
    } else {
      // Check hover
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const worldX = camera.x + (mouseX - cx) / camera.zoom;
      const worldY = camera.y - (mouseY - cy) / camera.zoom;

      let foundId: string | null = null;
      interpVehiclesRef.current.forEach((v, vid) => {
        const halfLen = v.length / 2 + 1;
        const halfWid = v.width / 2 + 1;
        if (
          worldX >= v.currentX - halfLen &&
          worldX <= v.currentX + halfLen &&
          worldY >= v.currentY - halfWid &&
          worldY <= v.currentY + halfWid
        ) {
          foundId = vid;
        }
      });

      hoveredVehicleIdRef.current = foundId;
      if (canvas) {
        canvas.style.cursor = foundId ? 'pointer' : isDragging ? 'grabbing' : 'grab';
      }
    }
  }, [isDragging, camera, setCamera]);

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom interaction
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    setCamera((prev) => {
      const newZoom = Math.max(1.0, Math.min(40.0, prev.zoom * zoomFactor));
      return { ...prev, zoom: newZoom };
    });
  };

  // Vehicle click selection
  const handleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const worldX = camera.x + (mouseX - cx) / camera.zoom;
    const worldY = camera.y - (mouseY - cy) / camera.zoom;

    // Check if clicked on traffic signal at 500m
    const tlWorldX = trafficLight?.x ?? 500.0;
    if (Math.abs(worldX - tlWorldX) < 12 && worldY >= -14 && worldY <= 6) {
      if (onTrafficLightClick) {
        onTrafficLightClick();
        return;
      }
    }

    let clickedId: string | null = null;
    interpVehiclesRef.current.forEach((v, vid) => {
      const halfLen = v.length / 2 + 2;
      const halfWid = v.width / 2 + 2;
      if (
        worldX >= v.currentX - halfLen &&
        worldX <= v.currentX + halfLen &&
        worldY >= v.currentY - halfWid &&
        worldY <= v.currentY + halfWid
      ) {
        clickedId = vid;
      }
    });

    onSelectVehicle(clickedId);
  };

  // Quick preset jump actions
  const jumpTo = (x: number, y: number = -4.8, zoom: number = 10) => {
    setCamera({
      x,
      y,
      zoom,
      followingId: null,
    });
  };

  const fitFullRoad = () => {
    const container = containerRef.current;
    if (!container) return;
    const w = container.clientWidth;
    // 1000m road fitted to screen width with 40px margin
    const fitZoom = Math.max(0.8, (w - 80) / 1000);
    setCamera({
      x: 500,
      y: -4.8,
      zoom: fitZoom,
      followingId: null,
    });
  };

  return (
    <div
      ref={containerRef}
      id="simulation-canvas-container"
      style={{
        position: 'relative',
        flex: 1,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onClick={handleClick}
    >
      <canvas
        ref={canvasRef}
        id="traffic-canvas"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />

      {/* Floating Viewport / Camera Controls */}
      <div
        className="glass-panel"
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          padding: '6px',
          display: 'flex',
          gap: '6px',
          zIndex: 10,
        }}
      >
        <button
          className="btn-icon"
          onClick={() => setCamera((c) => ({ ...c, zoom: Math.min(40, c.zoom * 1.25) }))}
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
        <button
          className="btn-icon"
          onClick={() => setCamera((c) => ({ ...c, zoom: Math.max(1, c.zoom / 1.25) }))}
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>
        <button
          className="btn-icon"
          onClick={fitFullRoad}
          title="Fit 1000m Highway to Screen"
        >
          <Maximize2 size={16} />
        </button>
        <button
          className="btn-icon"
          onClick={() => jumpTo(500, -4.8, 12)}
          title="Center on Highway Midpoint (500m)"
        >
          <Crosshair size={16} />
        </button>
      </div>

      {/* Camera Presets Toolbar (Bottom Left) */}
      <div
        className="glass-panel"
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 10,
          fontSize: '0.78rem',
        }}
      >
        <span style={{ color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Navigation size={13} color="#38bdf8" /> VIEW:
        </span>
        <button
          className="btn-secondary"
          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
          onClick={() => jumpTo(60, -4.8, 14)}
        >
          Start (0m)
        </button>
        <button
          className="btn-secondary"
          style={{
            padding: '4px 8px',
            fontSize: '0.75rem',
            borderColor: 'rgba(56, 189, 248, 0.4)',
            color: '#38bdf8',
          }}
          onClick={() => jumpTo(500, -4.8, 14)}
          title="Jump to Traffic Signal (500m)"
        >
          🚦 Signal (500m)
        </button>
        <button
          className="btn-secondary"
          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
          onClick={() => jumpTo(940, -4.8, 14)}
        >
          Finish (1000m)
        </button>
        <button
          className="btn-secondary"
          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
          onClick={fitFullRoad}
        >
          Full 1000m
        </button>
      </div>

      {/* Follow Mode Indicator */}
      {camera.followingId && (
        <div
          className="glass-panel"
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 10,
            borderColor: 'rgba(56, 189, 248, 0.4)',
            boxShadow: 'var(--glow-cyan)',
          }}
        >
          <LocateFixed size={16} color="#38bdf8" className="pulse-indicator" />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#38bdf8' }}>
            Tracking {camera.followingId}
          </span>
          <button
            className="btn-secondary"
            style={{ padding: '2px 8px', fontSize: '0.7rem' }}
            onClick={() => setCamera((c) => ({ ...c, followingId: null }))}
          >
            Stop
          </button>
        </div>
      )}
    </div>
  );
};
