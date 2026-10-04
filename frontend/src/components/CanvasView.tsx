import React, { useRef, useEffect, useState } from 'react';
import type { Vehicle, CameraState, TrafficLightData, ScenarioMetadata } from '../types/simulation';
import { ZoomIn, ZoomOut, Maximize2, Crosshair } from 'lucide-react';

interface CanvasViewProps {
  vehicles: Vehicle[];
  camera: CameraState;
  setCamera: React.Dispatch<React.SetStateAction<CameraState>>;
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string | null) => void;
  onViewportMetersChange: (meters: number) => void;
  trafficLight?: TrafficLightData;
  onTrafficLightClick?: () => void;
  scenario?: ScenarioMetadata | null;
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
  direction?: 'east' | 'west' | 'north' | 'south';
  type: string;
  color: string;
  length: number;
  width: number;
  lane_index: number;
  leader_id?: string | null;
  leader_dist?: number | null;
}

// ----------------------------------------------------
// SCENARIO 1: STRAIGHT HIGHWAY RENDERER
// ----------------------------------------------------
const renderStraightHighway = (
  ctx: CanvasRenderingContext2D,
  worldToScreenX: (x: number) => number,
  worldToScreenY: (y: number) => number,
  zoom: number,
  width: number,
  trafficLight?: TrafficLightData
) => {
  const roadScreenX1 = worldToScreenX(0);
  const roadScreenX2 = worldToScreenX(1000);
  const roadScreenYTop = worldToScreenY(6.4); // Westbound outer edge (+Y)
  const roadScreenYBottom = worldToScreenY(-6.4); // Eastbound outer edge (-Y)
  const roadScreenHeight = roadScreenYBottom - roadScreenYTop;
  const roadScreenWidth = roadScreenX2 - roadScreenX1;

  // Embankment / Shoulders
  const shoulderH = 4 * zoom;
  ctx.fillStyle = '#111827';
  ctx.fillRect(roadScreenX1 - 20 * zoom, roadScreenYTop - shoulderH, roadScreenWidth + 40 * zoom, shoulderH);
  ctx.fillRect(roadScreenX1 - 20 * zoom, roadScreenYBottom, roadScreenWidth + 40 * zoom, shoulderH);

  // Asphalt base
  const roadGrad = ctx.createLinearGradient(0, roadScreenYTop, 0, roadScreenYBottom);
  roadGrad.addColorStop(0, '#1c2230');
  roadGrad.addColorStop(0.5, '#1e2535');
  roadGrad.addColorStop(1, '#1a202c');
  ctx.fillStyle = roadGrad;
  ctx.fillRect(roadScreenX1, roadScreenYTop, roadScreenWidth, roadScreenHeight);

  // Lane dividers & Highway Median
  const wbDivY = worldToScreenY(3.2);
  const medianY = worldToScreenY(0.0);
  const ebDivY = worldToScreenY(-3.2);

  // Draw dashed lane dividers
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = Math.max(1, 0.2 * zoom);
  ctx.setLineDash([0.8 * zoom, 1.2 * zoom]);

  ctx.beginPath();
  ctx.moveTo(roadScreenX1, wbDivY);
  ctx.lineTo(roadScreenX2, wbDivY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(roadScreenX1, ebDivY);
  ctx.lineTo(roadScreenX2, ebDivY);
  ctx.stroke();

  ctx.setLineDash([]);

  // Center Median: Double Solid Yellow Lines
  const medianOffsetPx = Math.max(1.5, 0.2 * zoom);
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = Math.max(1.5, 0.25 * zoom);

  ctx.beginPath();
  ctx.moveTo(roadScreenX1, medianY - medianOffsetPx);
  ctx.lineTo(roadScreenX2, medianY - medianOffsetPx);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(roadScreenX1, medianY + medianOffsetPx);
  ctx.lineTo(roadScreenX2, medianY + medianOffsetPx);
  ctx.stroke();

  // Road outer edge lines (Solid White)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, 0.25 * zoom);

  ctx.beginPath();
  ctx.moveTo(roadScreenX1, roadScreenYTop);
  ctx.lineTo(roadScreenX2, roadScreenYTop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(roadScreenX1, roadScreenYBottom);
  ctx.lineTo(roadScreenX2, roadScreenYBottom);
  ctx.stroke();

  // Lane direction markings
  const laneH = roadScreenHeight / 4;
  if (zoom > 4) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.font = `700 ${Math.max(10, Math.min(15, 1.1 * zoom))}px Inter, sans-serif`;
    ctx.textAlign = 'left';

    for (let mx = 60; mx <= 940; mx += 160) {
      const sx = worldToScreenX(mx);
      if (sx > -100 && sx < width + 100) {
        ctx.fillText('EB L0 (Slow) →', sx, roadScreenYTop + laneH * 0.65);
        ctx.fillText('EB L1 (Fast) →', sx, roadScreenYTop + laneH * 1.65);
        ctx.fillText('← WB L1 (Fast)', sx, roadScreenYTop + laneH * 2.65);
        ctx.fillText('← WB L0 (Slow)', sx, roadScreenYTop + laneH * 3.65);
      }
    }
  }

  // Distance markers
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

    ctx.fillStyle = isMajor ? '#38bdf8' : '#94a3b8';
    ctx.font = `700 ${isMajor ? 11 : 9}px JetBrains Mono, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${m}m`, mx, roadScreenYBottom + 20);
  }

  // 0m & 1000m Terminus Gates (Left-Hand Traffic: EB Top [+Y], WB Bottom [-Y])
  if (roadScreenX1 > -200 && roadScreenX1 < width + 200) {
    const ebHeight = medianY - roadScreenYTop;
    const wbHeight = roadScreenYBottom - medianY;

    // EB Start (Top half, Green)
    ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
    ctx.fillRect(roadScreenX1 - 4, roadScreenYTop, 8, ebHeight);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.strokeRect(roadScreenX1 - 4, roadScreenYTop, 8, ebHeight);

    // WB Arrival (Bottom half, Rose)
    ctx.fillStyle = 'rgba(244, 63, 94, 0.2)';
    ctx.fillRect(roadScreenX1 - 4, medianY, 8, wbHeight);
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 3;
    ctx.strokeRect(roadScreenX1 - 4, medianY, 8, wbHeight);

    ctx.fillStyle = '#10b981';
    ctx.font = '800 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EB START [0m] →', roadScreenX1, roadScreenYTop - 14);

    ctx.fillStyle = '#f43f5e';
    ctx.fillText('← WB ARRIVAL [0m]', roadScreenX1, roadScreenYBottom + 20);
  }

  if (roadScreenX2 > -200 && roadScreenX2 < width + 200) {
    const ebHeight = medianY - roadScreenYTop;
    const wbHeight = roadScreenYBottom - medianY;

    // EB Arrival (Top half, Rose)
    ctx.fillStyle = 'rgba(244, 63, 94, 0.2)';
    ctx.fillRect(roadScreenX2 - 4, roadScreenYTop, 8, ebHeight);
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 3;
    ctx.strokeRect(roadScreenX2 - 4, roadScreenYTop, 8, ebHeight);

    // WB Start (Bottom half, Green)
    ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
    ctx.fillRect(roadScreenX2 - 4, medianY, 8, wbHeight);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.strokeRect(roadScreenX2 - 4, medianY, 8, wbHeight);

    ctx.fillStyle = '#f43f5e';
    ctx.font = '800 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EB ARRIVAL [1000m] →', roadScreenX2, roadScreenYTop - 14);

    ctx.fillStyle = '#10b981';
    ctx.fillText('← WB START [1000m]', roadScreenX2, roadScreenYBottom + 20);
  }

  // Traffic Signal Gantry at 500m
  const tlX = trafficLight?.x ?? 500.0;
  const tlScreenX = worldToScreenX(tlX);
  const tlState = trafficLight?.state ?? 'green';
  const tlColorHex = tlState === 'green' ? '#10b981' : tlState === 'yellow' ? '#f59e0b' : '#ef4444';

  if (tlScreenX > -250 && tlScreenX < width + 250) {
    // Glow
    if (zoom > 2) {
      const glowGrad = ctx.createRadialGradient(tlScreenX, medianY, 5, tlScreenX, medianY, Math.max(30, 20 * zoom));
      glowGrad.addColorStop(0, tlState === 'green' ? 'rgba(16, 185, 129, 0.26)' : tlState === 'yellow' ? 'rgba(245, 158, 11, 0.32)' : 'rgba(239, 68, 68, 0.38)');
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(tlScreenX - 30 * zoom, roadScreenYTop - 4, 60 * zoom, roadScreenHeight + 8);
    }

    // Stop lines (EB in top half roadScreenYTop to medianY; WB in bottom half medianY to roadScreenYBottom)
    const ebStopLineScreenX = worldToScreenX(tlX - 2.5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ebStopLineScreenX - Math.max(2, 0.3 * zoom), roadScreenYTop, Math.max(3.5, 0.6 * zoom), medianY - roadScreenYTop);

    const wbStopLineScreenX = worldToScreenX(tlX + 2.5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(wbStopLineScreenX - Math.max(2, 0.3 * zoom), medianY, Math.max(3.5, 0.6 * zoom), roadScreenYBottom - medianY);

    // Overhead Gantry Structure
    const gantryTop = roadScreenYTop - 28;
    const gantryBottom = roadScreenYBottom + 12;
    const gantryBeamW = Math.max(5, 0.7 * zoom);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(tlScreenX - gantryBeamW / 2, gantryTop, gantryBeamW, gantryBottom - gantryTop);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tlScreenX - gantryBeamW / 2, gantryTop, gantryBeamW, gantryBottom - gantryTop);

    // Signal Lamps
    const laneCentersY = [
      roadScreenYTop + laneH * 0.5,
      roadScreenYTop + laneH * 1.5,
      roadScreenYTop + laneH * 2.5,
      roadScreenYTop + laneH * 3.5,
    ];

    laneCentersY.forEach((sy) => {
      const headW = 12;
      const headH = 26;
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tlScreenX - headW / 2, sy - headH / 2, headW, headH, 3);
      ctx.fill();
      ctx.stroke();

      const lampRadius = 3;
      // Red
      ctx.fillStyle = tlState === 'red' ? '#ef4444' : '#450a0a';
      ctx.beginPath();
      ctx.arc(tlScreenX, sy - 7, lampRadius, 0, Math.PI * 2);
      ctx.fill();

      // Yellow
      ctx.fillStyle = tlState === 'yellow' ? '#f59e0b' : '#451a03';
      ctx.beginPath();
      ctx.arc(tlScreenX, sy, lampRadius, 0, Math.PI * 2);
      ctx.fill();

      // Green
      ctx.fillStyle = tlState === 'green' ? '#10b981' : '#064e3b';
      ctx.beginPath();
      ctx.arc(tlScreenX, sy + 7, lampRadius, 0, Math.PI * 2);
      ctx.fill();
    });

    // Status tag
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
    ctx.textBaseline = 'alphabetic';
  }
};

// ----------------------------------------------------
// SCENARIO 2: 3-WAY T-INTERSECTION RENDERER
// ----------------------------------------------------
const renderThreeWayIntersection = (
  ctx: CanvasRenderingContext2D,
  worldToScreenX: (x: number) => number,
  worldToScreenY: (y: number) => number,
  zoom: number,
  trafficLight?: TrafficLightData
) => {
  const sxWestEnd = worldToScreenX(-250);
  const sxEastEnd = worldToScreenX(250);
  const sxCenter = worldToScreenX(0);
  const sxNorthLeft = worldToScreenX(-6.4);
  const sxNorthRight = worldToScreenX(6.4);

  const syCenter = worldToScreenY(0);
  const syNorthEnd = worldToScreenY(250);
  const syRoadTop = worldToScreenY(6.4);
  const syRoadBottom = worldToScreenY(-6.4);

  // 1. Embankment Shoulders
  const shoulderPx = Math.max(3, 4 * zoom);
  ctx.fillStyle = '#111827';
  ctx.fillRect(sxWestEnd, syRoadTop - shoulderPx, sxNorthLeft - sxWestEnd, shoulderPx);
  ctx.fillRect(sxNorthRight, syRoadTop - shoulderPx, sxEastEnd - sxNorthRight, shoulderPx);
  ctx.fillRect(sxWestEnd, syRoadBottom, sxEastEnd - sxWestEnd, shoulderPx);
  ctx.fillRect(sxNorthLeft - shoulderPx, syNorthEnd, shoulderPx, syRoadTop - syNorthEnd);
  ctx.fillRect(sxNorthRight, syNorthEnd, shoulderPx, syRoadTop - syNorthEnd);

  // 2. Asphalt Base
  const horizGrad = ctx.createLinearGradient(0, syRoadTop, 0, syRoadBottom);
  horizGrad.addColorStop(0, '#1c2230');
  horizGrad.addColorStop(0.5, '#1e2535');
  horizGrad.addColorStop(1, '#1a202c');
  ctx.fillStyle = horizGrad;
  ctx.fillRect(sxWestEnd, syRoadTop, sxEastEnd - sxWestEnd, syRoadBottom - syRoadTop);

  ctx.fillStyle = '#1e2535';
  ctx.fillRect(sxNorthLeft, syNorthEnd, sxNorthRight - sxNorthLeft, syRoadTop - syNorthEnd);

  // 3. Lane dashed dividers
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = Math.max(1, 0.2 * zoom);
  ctx.setLineDash([0.8 * zoom, 1.2 * zoom]);

  const sxWestStop = worldToScreenX(-10.4);
  const syWbDiv = worldToScreenY(3.2);
  const syEbDiv = worldToScreenY(-3.2);

  ctx.beginPath();
  ctx.moveTo(sxWestEnd, syWbDiv);
  ctx.lineTo(sxWestStop, syWbDiv);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxWestEnd, syEbDiv);
  ctx.lineTo(sxWestStop, syEbDiv);
  ctx.stroke();

  const sxEastStop = worldToScreenX(10.4);
  ctx.beginPath();
  ctx.moveTo(sxEastStop, syWbDiv);
  ctx.lineTo(sxEastEnd, syWbDiv);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxEastStop, syEbDiv);
  ctx.lineTo(sxEastEnd, syEbDiv);
  ctx.stroke();

  const syNorthStop = worldToScreenY(10.4);
  const sxNorthDivLeft = worldToScreenX(-3.2);
  const sxNorthDivRight = worldToScreenX(3.2);

  ctx.beginPath();
  ctx.moveTo(sxNorthDivLeft, syNorthEnd);
  ctx.lineTo(sxNorthDivLeft, syNorthStop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxNorthDivRight, syNorthEnd);
  ctx.lineTo(sxNorthDivRight, syNorthStop);
  ctx.stroke();

  ctx.setLineDash([]);

  // 4. Center Medians (Double Solid Yellow Lines)
  const medPx = Math.max(1.5, 0.2 * zoom);
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = Math.max(1.5, 0.25 * zoom);

  ctx.beginPath();
  ctx.moveTo(sxWestEnd, syCenter - medPx);
  ctx.lineTo(sxWestStop, syCenter - medPx);
  ctx.moveTo(sxWestEnd, syCenter + medPx);
  ctx.lineTo(sxWestStop, syCenter + medPx);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxEastStop, syCenter - medPx);
  ctx.lineTo(sxEastEnd, syCenter - medPx);
  ctx.moveTo(sxEastStop, syCenter + medPx);
  ctx.lineTo(sxEastEnd, syCenter + medPx);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxCenter - medPx, syNorthEnd);
  ctx.lineTo(sxCenter - medPx, syNorthStop);
  ctx.moveTo(sxCenter + medPx, syNorthEnd);
  ctx.lineTo(sxCenter + medPx, syNorthStop);
  ctx.stroke();

  // 5. Outer Curbs / Borders (Solid White)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, 0.25 * zoom);

  ctx.beginPath();
  ctx.moveTo(sxWestEnd, syRoadBottom);
  ctx.lineTo(sxEastEnd, syRoadBottom);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxWestEnd, syRoadTop);
  ctx.lineTo(sxWestStop, syRoadTop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxEastStop, syRoadTop);
  ctx.lineTo(sxEastEnd, syRoadTop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxNorthLeft, syNorthEnd);
  ctx.lineTo(sxNorthLeft, syNorthStop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxNorthRight, syNorthEnd);
  ctx.lineTo(sxNorthRight, syNorthStop);
  ctx.stroke();

  // Corner Curb Curves
  ctx.beginPath();
  ctx.moveTo(sxWestStop, syRoadTop);
  ctx.quadraticCurveTo(sxNorthLeft, syRoadTop, sxNorthLeft, syNorthStop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxEastStop, syRoadTop);
  ctx.quadraticCurveTo(sxNorthRight, syRoadTop, sxNorthRight, syNorthStop);
  ctx.stroke();

  // 6. Stop Lines & Crosswalks (Indian Left-Hand Traffic)
  ctx.fillStyle = '#ffffff';
  // West Inbound stop line (Top carriageway: syRoadTop to syCenter)
  ctx.fillRect(sxWestStop - 2, syRoadTop, 4, syCenter - syRoadTop);
  // East Inbound stop line (Bottom carriageway: syCenter to syRoadBottom)
  ctx.fillRect(sxEastStop - 2, syCenter, 4, syRoadBottom - syCenter);
  // North Inbound stop line (Right carriageway: sxCenter to sxNorthRight)
  ctx.fillRect(sxCenter, syNorthStop - 2, sxNorthRight - sxCenter, 4);

  // Zebra crosswalks
  if (zoom > 3) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    const barCount = 4;
    for (let i = 0; i < barCount; i++) {
      const by = syRoadTop + (i + 0.2) * ((syCenter - syRoadTop) / barCount);
      ctx.fillRect(sxWestStop - 8 * (zoom / 4), by, 6 * (zoom / 4), ((syCenter - syRoadTop) / barCount) * 0.6);
    }
    for (let i = 0; i < barCount; i++) {
      const by = syCenter + (i + 0.2) * ((syRoadBottom - syCenter) / barCount);
      ctx.fillRect(sxEastStop + 2 * (zoom / 4), by, 6 * (zoom / 4), ((syRoadBottom - syCenter) / barCount) * 0.6);
    }
    for (let i = 0; i < barCount; i++) {
      const bx = sxCenter + (i + 0.2) * ((sxNorthRight - sxCenter) / barCount);
      ctx.fillRect(bx, syNorthStop + 2 * (zoom / 4), ((sxNorthRight - sxCenter) / barCount) * 0.6, 6 * (zoom / 4));
    }
  }

  // 7. Distance markers along arms
  const drawDistBadge = (sx: number, sy: number, label: string) => {
    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, sx, sy);
  };

  for (let d = -250; d <= -50; d += 50) {
    const mx = worldToScreenX(d);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx, syRoadTop - 4);
    ctx.lineTo(mx, syRoadBottom + 4);
    ctx.stroke();
    drawDistBadge(mx, syRoadBottom + 16, `${d}m`);
  }

  for (let d = 50; d <= 250; d += 50) {
    const mx = worldToScreenX(d);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx, syRoadTop - 4);
    ctx.lineTo(mx, syRoadBottom + 4);
    ctx.stroke();
    drawDistBadge(mx, syRoadBottom + 16, `+${d}m`);
  }

  for (let d = 50; d <= 250; d += 50) {
    const my = worldToScreenY(d);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sxNorthLeft - 4, my);
    ctx.lineTo(sxNorthRight + 4, my);
    ctx.stroke();
    drawDistBadge(sxNorthRight + 22, my + 3, `N+${d}m`);
  }

  // Terminus Gates (LHT: West Inbound Top, East Inbound Bottom, North Inbound Right)
  ctx.fillStyle = '#10b981';
  ctx.font = '800 10px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('WEST INBOUND [-250m] →', sxWestEnd + 70, syRoadTop - 12);
  ctx.fillText('← EAST INBOUND [+250m]', sxEastEnd - 70, syRoadBottom + 26);
  ctx.fillText('↓ NORTH INBOUND [+250m]', sxNorthRight + 40, syNorthEnd - 12);

  // 8. Traffic Signal Lights at Intersection
  const tlState = trafficLight?.state ?? 'green';
  const phaseIdx = trafficLight?.phase_index ?? 0;

  // 3-way phases: 0=EW-Green (Straight + Protected Right), 1=EW-Yellow, 2=North-Green (Left + Protected Right), 3=North-Yellow
  const isWestGreen = phaseIdx === 0;
  const isWestYellow = phaseIdx === 1;
  const isEastGreen = phaseIdx === 0;
  const isEastYellow = phaseIdx === 1;
  const isNorthGreen = phaseIdx === 2;
  const isNorthYellow = phaseIdx === 3;

  const renderSignalHead = (x: number, y: number, r: boolean, yl: boolean, g: boolean, label: string) => {
    const sw = 14;
    const sh = 30;
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - sw / 2, y - sh / 2, sw, sh, 4);
    ctx.fill();
    ctx.stroke();

    const lr = 3.2;
    ctx.fillStyle = r ? '#ef4444' : '#450a0a';
    if (r) {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.arc(x, y - 8, lr, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = yl ? '#f59e0b' : '#451a03';
    if (yl) {
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.arc(x, y, lr, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = g ? '#10b981' : '#064e3b';
    if (g) {
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.arc(x, y + 8, lr, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (zoom > 3) {
      ctx.fillStyle = g ? '#38bdf8' : '#94a3b8';
      ctx.font = '700 8px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, y + sh / 2 + 10);
    }
  };

  renderSignalHead(
    sxWestStop - 14,
    syRoadTop + 14,
    !isWestGreen && !isWestYellow,
    isWestYellow,
    isWestGreen,
    'WEST'
  );

  renderSignalHead(
    sxEastStop + 14,
    syRoadBottom - 14,
    !isEastGreen && !isEastYellow,
    isEastYellow,
    isEastGreen,
    'EAST'
  );

  renderSignalHead(
    sxNorthRight + 14,
    syNorthStop + 14,
    !isNorthGreen && !isNorthYellow,
    isNorthYellow,
    isNorthGreen,
    'NORTH'
  );

  // Intersection Center Glow
  const activeColor =
    isWestGreen || isEastGreen || isNorthGreen ? '#10b981' : isWestYellow || isEastYellow || isNorthYellow ? '#f59e0b' : '#ef4444';
  if (zoom > 2) {
    const juncGlow = ctx.createRadialGradient(sxCenter, syCenter, 5, sxCenter, syCenter, 40 * zoom);
    juncGlow.addColorStop(0, `${activeColor}33`);
    juncGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = juncGlow;
    ctx.fillRect(sxCenter - 40 * zoom, syCenter - 40 * zoom, 80 * zoom, 80 * zoom);
  }

  // Floating Signal Status Tag
  const tagText = trafficLight?.phase_name
    ? `${trafficLight.phase_name.toUpperCase()} [${trafficLight.phase_remaining.toFixed(1)}s]`
    : `SIGNAL: ${tlState.toUpperCase()} [${trafficLight?.phase_remaining.toFixed(1) ?? '0'}s]`;

  ctx.font = '800 11px JetBrains Mono, monospace';
  const tagMetrics = ctx.measureText(tagText);
  const tagW = tagMetrics.width + 16;
  const tagH = 22;
  const tagY = syNorthStop - 24;

  ctx.fillStyle = 'rgba(11, 15, 25, 0.85)';
  ctx.strokeStyle = activeColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(sxCenter - tagW / 2, tagY - tagH / 2, tagW, tagH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = activeColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tagText, sxCenter, tagY);
  ctx.textBaseline = 'alphabetic';
};

// ----------------------------------------------------
// SCENARIO 3: 4-WAY CROSSROADS INTERSECTION RENDERER
// ----------------------------------------------------
const renderFourWayIntersection = (
  ctx: CanvasRenderingContext2D,
  worldToScreenX: (x: number) => number,
  worldToScreenY: (y: number) => number,
  zoom: number,
  trafficLight?: TrafficLightData
) => {
  const sxWestEnd = worldToScreenX(-250);
  const sxEastEnd = worldToScreenX(250);
  const sxCenter = worldToScreenX(0);
  const sxNorthLeft = worldToScreenX(-6.4);
  const sxNorthRight = worldToScreenX(6.4);
  const sxSouthLeft = worldToScreenX(-6.4);
  const sxSouthRight = worldToScreenX(6.4);

  const syCenter = worldToScreenY(0);
  const syNorthEnd = worldToScreenY(250);
  const sySouthEnd = worldToScreenY(-250);
  const syRoadTop = worldToScreenY(6.4);
  const syRoadBottom = worldToScreenY(-6.4);

  // 1. Embankment Shoulders
  const shoulderPx = Math.max(3, 4 * zoom);
  ctx.fillStyle = '#111827';
  // Horizontal arms shoulders
  ctx.fillRect(sxWestEnd, syRoadTop - shoulderPx, sxNorthLeft - sxWestEnd, shoulderPx);
  ctx.fillRect(sxNorthRight, syRoadTop - shoulderPx, sxEastEnd - sxNorthRight, shoulderPx);
  ctx.fillRect(sxWestEnd, syRoadBottom, sxSouthLeft - sxWestEnd, shoulderPx);
  ctx.fillRect(sxSouthRight, syRoadBottom, sxEastEnd - sxSouthRight, shoulderPx);
  // North arm shoulders
  ctx.fillRect(sxNorthLeft - shoulderPx, syNorthEnd, shoulderPx, syRoadTop - syNorthEnd);
  ctx.fillRect(sxNorthRight, syNorthEnd, shoulderPx, syRoadTop - syNorthEnd);
  // South arm shoulders
  ctx.fillRect(sxSouthLeft - shoulderPx, syRoadBottom, shoulderPx, sySouthEnd - syRoadBottom);
  ctx.fillRect(sxSouthRight, syRoadBottom, shoulderPx, sySouthEnd - syRoadBottom);

  // 2. Asphalt Base
  const horizGrad = ctx.createLinearGradient(0, syRoadTop, 0, syRoadBottom);
  horizGrad.addColorStop(0, '#1c2230');
  horizGrad.addColorStop(0.5, '#1e2535');
  horizGrad.addColorStop(1, '#1a202c');
  ctx.fillStyle = horizGrad;
  ctx.fillRect(sxWestEnd, syRoadTop, sxEastEnd - sxWestEnd, syRoadBottom - syRoadTop);

  ctx.fillStyle = '#1e2535';
  ctx.fillRect(sxNorthLeft, syNorthEnd, sxNorthRight - sxNorthLeft, syRoadTop - syNorthEnd);
  ctx.fillRect(sxSouthLeft, syRoadBottom, sxSouthRight - sxSouthLeft, sySouthEnd - syRoadBottom);

  // 3. Lane dashed dividers
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = Math.max(1, 0.2 * zoom);
  ctx.setLineDash([0.8 * zoom, 1.2 * zoom]);

  const sxWestStop = worldToScreenX(-10.4);
  const syWbDiv = worldToScreenY(3.2);
  const syEbDiv = worldToScreenY(-3.2);

  ctx.beginPath();
  ctx.moveTo(sxWestEnd, syWbDiv);
  ctx.lineTo(sxWestStop, syWbDiv);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxWestEnd, syEbDiv);
  ctx.lineTo(sxWestStop, syEbDiv);
  ctx.stroke();

  const sxEastStop = worldToScreenX(10.4);
  ctx.beginPath();
  ctx.moveTo(sxEastStop, syWbDiv);
  ctx.lineTo(sxEastEnd, syWbDiv);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxEastStop, syEbDiv);
  ctx.lineTo(sxEastEnd, syEbDiv);
  ctx.stroke();

  const syNorthStop = worldToScreenY(10.4);
  const sxNorthDivLeft = worldToScreenX(-3.2);
  const sxNorthDivRight = worldToScreenX(3.2);

  ctx.beginPath();
  ctx.moveTo(sxNorthDivLeft, syNorthEnd);
  ctx.lineTo(sxNorthDivLeft, syNorthStop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxNorthDivRight, syNorthEnd);
  ctx.lineTo(sxNorthDivRight, syNorthStop);
  ctx.stroke();

  const sySouthStop = worldToScreenY(-10.4);
  const sxSouthDivLeft = worldToScreenX(-3.2);
  const sxSouthDivRight = worldToScreenX(3.2);

  ctx.beginPath();
  ctx.moveTo(sxSouthDivLeft, sySouthStop);
  ctx.lineTo(sxSouthDivLeft, sySouthEnd);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxSouthDivRight, sySouthStop);
  ctx.lineTo(sxSouthDivRight, sySouthEnd);
  ctx.stroke();

  ctx.setLineDash([]);

  // 4. Center Medians (Double Solid Yellow Lines)
  const medPx = Math.max(1.5, 0.2 * zoom);
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = Math.max(1.5, 0.25 * zoom);

  ctx.beginPath();
  ctx.moveTo(sxWestEnd, syCenter - medPx);
  ctx.lineTo(sxWestStop, syCenter - medPx);
  ctx.moveTo(sxWestEnd, syCenter + medPx);
  ctx.lineTo(sxWestStop, syCenter + medPx);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxEastStop, syCenter - medPx);
  ctx.lineTo(sxEastEnd, syCenter - medPx);
  ctx.moveTo(sxEastStop, syCenter + medPx);
  ctx.lineTo(sxEastEnd, syCenter + medPx);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxCenter - medPx, syNorthEnd);
  ctx.lineTo(sxCenter - medPx, syNorthStop);
  ctx.moveTo(sxCenter + medPx, syNorthEnd);
  ctx.lineTo(sxCenter + medPx, syNorthStop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxCenter - medPx, sySouthStop);
  ctx.lineTo(sxCenter - medPx, sySouthEnd);
  ctx.moveTo(sxCenter + medPx, sySouthStop);
  ctx.lineTo(sxCenter + medPx, sySouthEnd);
  ctx.stroke();

  // 5. Outer Curbs / Borders (Solid White)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, 0.25 * zoom);

  // West Arm
  ctx.beginPath();
  ctx.moveTo(sxWestEnd, syRoadTop);
  ctx.lineTo(sxWestStop, syRoadTop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxWestEnd, syRoadBottom);
  ctx.lineTo(sxWestStop, syRoadBottom);
  ctx.stroke();

  // East Arm
  ctx.beginPath();
  ctx.moveTo(sxEastStop, syRoadTop);
  ctx.lineTo(sxEastEnd, syRoadTop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxEastStop, syRoadBottom);
  ctx.lineTo(sxEastEnd, syRoadBottom);
  ctx.stroke();

  // North Arm
  ctx.beginPath();
  ctx.moveTo(sxNorthLeft, syNorthEnd);
  ctx.lineTo(sxNorthLeft, syNorthStop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxNorthRight, syNorthEnd);
  ctx.lineTo(sxNorthRight, syNorthStop);
  ctx.stroke();

  // South Arm
  ctx.beginPath();
  ctx.moveTo(sxSouthLeft, sySouthStop);
  ctx.lineTo(sxSouthLeft, sySouthEnd);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxSouthRight, sySouthStop);
  ctx.lineTo(sxSouthRight, sySouthEnd);
  ctx.stroke();

  // 4 Corner Curb Curves
  ctx.beginPath();
  ctx.moveTo(sxWestStop, syRoadTop);
  ctx.quadraticCurveTo(sxNorthLeft, syRoadTop, sxNorthLeft, syNorthStop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxEastStop, syRoadTop);
  ctx.quadraticCurveTo(sxNorthRight, syRoadTop, sxNorthRight, syNorthStop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxWestStop, syRoadBottom);
  ctx.quadraticCurveTo(sxSouthLeft, syRoadBottom, sxSouthLeft, sySouthStop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(sxEastStop, syRoadBottom);
  ctx.quadraticCurveTo(sxSouthRight, syRoadBottom, sxSouthRight, sySouthStop);
  ctx.stroke();

  // 6. Stop Lines & Crosswalks (Indian Left-Hand Traffic)
  ctx.fillStyle = '#ffffff';
  // West Inbound stop line (Top carriageway: syRoadTop to syCenter)
  ctx.fillRect(sxWestStop - 2, syRoadTop, 4, syCenter - syRoadTop);
  // East Inbound stop line (Bottom carriageway: syCenter to syRoadBottom)
  ctx.fillRect(sxEastStop - 2, syCenter, 4, syRoadBottom - syCenter);
  // North Inbound stop line (Right carriageway: sxCenter to sxNorthRight)
  ctx.fillRect(sxCenter, syNorthStop - 2, sxNorthRight - sxCenter, 4);
  // South Inbound stop line (Left carriageway: sxSouthLeft to sxCenter)
  ctx.fillRect(sxSouthLeft, sySouthStop - 2, sxCenter - sxSouthLeft, 4);

  // Zebra crosswalks
  if (zoom > 3) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    const barCount = 4;
    for (let i = 0; i < barCount; i++) {
      const by = syRoadTop + (i + 0.2) * ((syCenter - syRoadTop) / barCount);
      ctx.fillRect(sxWestStop - 8 * (zoom / 4), by, 6 * (zoom / 4), ((syCenter - syRoadTop) / barCount) * 0.6);
    }
    for (let i = 0; i < barCount; i++) {
      const by = syCenter + (i + 0.2) * ((syRoadBottom - syCenter) / barCount);
      ctx.fillRect(sxEastStop + 2 * (zoom / 4), by, 6 * (zoom / 4), ((syRoadBottom - syCenter) / barCount) * 0.6);
    }
    for (let i = 0; i < barCount; i++) {
      const bx = sxCenter + (i + 0.2) * ((sxNorthRight - sxCenter) / barCount);
      ctx.fillRect(bx, syNorthStop + 2 * (zoom / 4), ((sxNorthRight - sxCenter) / barCount) * 0.6, 6 * (zoom / 4));
    }
    for (let i = 0; i < barCount; i++) {
      const bx = sxSouthLeft + (i + 0.2) * ((sxCenter - sxSouthLeft) / barCount);
      ctx.fillRect(bx, sySouthStop - 8 * (zoom / 4), ((sxCenter - sxSouthLeft) / barCount) * 0.6, 6 * (zoom / 4));
    }
  }

  // 7. Distance markers along arms
  const drawDistBadge = (sx: number, sy: number, label: string) => {
    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, sx, sy);
  };

  for (let d = -250; d <= -50; d += 50) {
    const mx = worldToScreenX(d);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx, syRoadTop - 4);
    ctx.lineTo(mx, syRoadBottom + 4);
    ctx.stroke();
    drawDistBadge(mx, syRoadBottom + 16, `${d}m`);
  }

  for (let d = 50; d <= 250; d += 50) {
    const mx = worldToScreenX(d);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx, syRoadTop - 4);
    ctx.lineTo(mx, syRoadBottom + 4);
    ctx.stroke();
    drawDistBadge(mx, syRoadBottom + 16, `+${d}m`);
  }

  for (let d = 50; d <= 250; d += 50) {
    const my = worldToScreenY(d);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sxNorthLeft - 4, my);
    ctx.lineTo(sxNorthRight + 4, my);
    ctx.stroke();
    drawDistBadge(sxNorthRight + 22, my + 3, `N+${d}m`);
  }

  for (let d = -250; d <= -50; d += 50) {
    const my = worldToScreenY(d);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sxSouthLeft - 4, my);
    ctx.lineTo(sxSouthRight + 4, my);
    ctx.stroke();
    drawDistBadge(sxSouthLeft - 22, my + 3, `S${d}m`);
  }

  // Terminus Gates
  ctx.fillStyle = '#10b981';
  ctx.font = '800 10px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('WEST INBOUND [-250m] →', sxWestEnd + 70, syRoadTop - 12);
  ctx.fillText('← EAST INBOUND [+250m]', sxEastEnd - 70, syRoadBottom + 26);
  ctx.fillText('↓ NORTH INBOUND [+250m]', sxNorthRight + 40, syNorthEnd - 12);
  ctx.fillText('↑ SOUTH INBOUND [-250m]', sxSouthLeft - 40, sySouthEnd + 20);

  // 8. Traffic Signal Lights at Intersection
  const tlState = trafficLight?.state ?? 'green';
  const phaseIdx = trafficLight?.phase_index ?? 0;

  // 4-way phases:
  // 0: EW Green (Straight & Protected Right), 1: EW Yellow
  // 2: NS Green (Straight & Protected Right), 3: NS Yellow
  const isEwGreen = phaseIdx === 0;
  const isEwYellow = phaseIdx === 1;
  const isNsGreen = phaseIdx === 2;
  const isNsYellow = phaseIdx === 3;

  const renderSignalHead = (x: number, y: number, r: boolean, yl: boolean, g: boolean, label: string) => {
    const sw = 14;
    const sh = 30;
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - sw / 2, y - sh / 2, sw, sh, 4);
    ctx.fill();
    ctx.stroke();

    const lr = 3.2;
    ctx.fillStyle = r ? '#ef4444' : '#450a0a';
    if (r) {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.arc(x, y - 8, lr, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = yl ? '#f59e0b' : '#451a03';
    if (yl) {
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.arc(x, y, lr, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = g ? '#10b981' : '#064e3b';
    if (g) {
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.arc(x, y + 8, lr, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (zoom > 3) {
      ctx.fillStyle = g ? '#38bdf8' : '#94a3b8';
      ctx.font = '700 8px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, y + sh / 2 + 10);
    }
  };

  renderSignalHead(
    sxWestStop - 14,
    syRoadTop + 14,
    !isEwGreen && !isEwYellow,
    isEwYellow,
    isEwGreen,
    'WEST'
  );

  renderSignalHead(
    sxEastStop + 14,
    syRoadBottom - 14,
    !isEwGreen && !isEwYellow,
    isEwYellow,
    isEwGreen,
    'EAST'
  );

  renderSignalHead(
    sxNorthRight + 14,
    syNorthStop + 14,
    !isNsGreen && !isNsYellow,
    isNsYellow,
    isNsGreen,
    'NORTH'
  );

  renderSignalHead(
    sxSouthLeft - 14,
    sySouthStop - 14,
    !isNsGreen && !isNsYellow,
    isNsYellow,
    isNsGreen,
    'SOUTH'
  );

  // Intersection Center Glow
  const activeColor =
    isEwGreen || isNsGreen ? '#10b981' : isEwYellow || isNsYellow ? '#f59e0b' : '#ef4444';
  if (zoom > 2) {
    const juncGlow = ctx.createRadialGradient(sxCenter, syCenter, 5, sxCenter, syCenter, 40 * zoom);
    juncGlow.addColorStop(0, `${activeColor}33`);
    juncGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = juncGlow;
    ctx.fillRect(sxCenter - 40 * zoom, syCenter - 40 * zoom, 80 * zoom, 80 * zoom);
  }

  // Floating Signal Status Tag
  const tagText = trafficLight?.phase_name
    ? `${trafficLight.phase_name.toUpperCase()} [${trafficLight.phase_remaining.toFixed(1)}s]`
    : `SIGNAL: ${tlState.toUpperCase()} [${trafficLight?.phase_remaining.toFixed(1) ?? '0'}s]`;

  ctx.font = '800 11px JetBrains Mono, monospace';
  const tagMetrics = ctx.measureText(tagText);
  const tagW = tagMetrics.width + 16;
  const tagH = 22;
  const tagY = syNorthStop - 24;

  ctx.fillStyle = 'rgba(11, 15, 25, 0.85)';
  ctx.strokeStyle = activeColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(sxCenter - tagW / 2, tagY - tagH / 2, tagW, tagH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = activeColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tagText, sxCenter, tagY);
  ctx.textBaseline = 'alphabetic';
};

export const CanvasView: React.FC<CanvasViewProps> = ({
  vehicles,
  camera,
  setCamera,
  selectedVehicleId,
  onSelectVehicle,
  onViewportMetersChange,
  trafficLight,
  onTrafficLightClick,
  scenario,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isIntersection = scenario?.type === 'intersection' || scenario?.id === 'three_way_intersection';

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; camX: number; camY: number }>({
    mouseX: 0,
    mouseY: 0,
    camX: 0,
    camY: 0,
  });

  const interpVehiclesRef = useRef<Map<string, InterpolatedVehicle>>(new Map());

  // Sync incoming vehicle data into interpolation map
  useEffect(() => {
    const currentMap = interpVehiclesRef.current;
    const incomingIds = new Set<string>();

    for (const v of vehicles) {
      incomingIds.add(v.id);
      const existing = currentMap.get(v.id);
      const dir = v.direction || (v.angle > 225 && v.angle < 315 ? 'west' : v.angle > 135 && v.angle <= 225 ? 'south' : 'east');

      if (existing) {
        existing.targetX = v.x;
        existing.targetY = v.y;
        existing.speed = v.speed;
        existing.speed_kmh = v.speed_kmh;
        existing.acceleration = v.acceleration;
        existing.angle = v.angle;
        existing.direction = dir;
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
          direction: dir,
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
          x: followed.currentX,
          y: followed.currentY,
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
      const worldToScreenY = (wy: number) => cy - (wy - camY) * zoom;

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
        const startGridY = worldToScreenY(Math.floor((camY + height / (2 * zoom)) / 50) * 50);
        for (let gy = startGridY; gy < height + 100; gy += gridSpacingPx) {
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(width, gy);
          ctx.stroke();
        }
      }

      // 2. Render Road Network according to active scenario
      if (scenario?.id === 'four_way_intersection') {
        renderFourWayIntersection(ctx, worldToScreenX, worldToScreenY, zoom, trafficLight);
      } else if (isIntersection || scenario?.id === 'three_way_intersection') {
        renderThreeWayIntersection(ctx, worldToScreenX, worldToScreenY, zoom, trafficLight);
      } else {
        renderStraightHighway(ctx, worldToScreenX, worldToScreenY, zoom, width, trafficLight);
      }

      // 3. Render Vehicles with smooth 60 FPS lerping & rich styling
      const interpMap = interpVehiclesRef.current;
      interpMap.forEach((v, vid) => {
        const lerpFactor = Math.min(1.0, dt * 15);
        v.currentX += (v.targetX - v.currentX) * lerpFactor;
        v.currentY += (v.targetY - v.currentY) * lerpFactor;

        const vx = worldToScreenX(v.currentX);
        const vy = worldToScreenY(v.currentY);

        if (vx < -120 || vx > width + 120 || vy < -120 || vy > height + 120) return;

        const vLenPx = Math.max(12, v.length * zoom);
        const vWidPx = Math.max(6, v.width * zoom);
        const headingRad = (v.angle - 90) * (Math.PI / 180);

        ctx.save();
        ctx.translate(vx, vy);

        ctx.save();
        ctx.rotate(headingRad);

        // Leader beam
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

        // Headlight glow
        if (zoom > 2) {
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

        // Drop shadow
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

        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Windows and lights
        if (zoom > 3) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
          const wsW = vLenPx * 0.22;
          const wsH = vWidPx * 0.75;
          ctx.beginPath();
          ctx.roundRect(vLenPx * 0.1, -wsH / 2, wsW, wsH, 2);
          ctx.fill();

          ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
          const rwW = vLenPx * 0.16;
          const rwH = vWidPx * 0.7;
          ctx.beginPath();
          ctx.roundRect(-vLenPx * 0.38, -rwH / 2, rwW, rwH, 2);
          ctx.fill();

          // Headlights
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(vLenPx / 2 - 2, -vWidPx * 0.45, 2, vWidPx * 0.22);
          ctx.fillRect(vLenPx / 2 - 2, vWidPx * 0.23, 2, vWidPx * 0.22);

          // Brake lights
          const isBraking = v.acceleration < -0.5;
          ctx.fillStyle = isBraking ? '#ff0033' : '#991b1b';
          ctx.fillRect(-vLenPx / 2, -vWidPx * 0.45, 2, vWidPx * 0.22);
          ctx.fillRect(-vLenPx / 2, vWidPx * 0.23, 2, vWidPx * 0.22);

          if (isBraking) {
            ctx.shadowColor = '#ff0033';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#ff1a1a';
            ctx.fillRect(-vLenPx / 2 - 1, -vWidPx * 0.45, 2, vWidPx * 0.22);
            ctx.fillRect(-vLenPx / 2 - 1, vWidPx * 0.23, 2, vWidPx * 0.22);
            ctx.shadowBlur = 0;
          }
        }

        ctx.restore();

        // Selection ring
        if (vid === selectedVehicleId) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(vLenPx, vWidPx) * 0.75 + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Telemetry label
        if (zoom > 4 || vid === selectedVehicleId) {
          const badgeY = -vWidPx - 10;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.beginPath();
          ctx.roundRect(-30, badgeY - 14, 60, 16, 4);
          ctx.fill();
          ctx.strokeStyle = vid === selectedVehicleId ? '#38bdf8' : 'rgba(255,255,255,0.15)';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = '700 9px JetBrains Mono, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${v.speed_kmh.toFixed(0)} km/h`, 0, badgeY - 3);
        }

        ctx.restore();
      });

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [camera, selectedVehicleId, trafficLight, isIntersection, scenario]);

  // Mouse pan/zoom handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      camX: camera.x,
      camY: camera.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.mouseX;
    const dy = e.clientY - dragStartRef.current.mouseY;

    setCamera((prev) => ({
      ...prev,
      x: dragStartRef.current.camX - dx / prev.zoom,
      y: dragStartRef.current.camY + dy / prev.zoom,
      followingId: null,
    }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    setCamera((prev) => ({
      ...prev,
      zoom: Math.max(0.5, Math.min(50, prev.zoom * factor)),
    }));
  };

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

    // Check if clicked near traffic signal center
    const tlWorldX = trafficLight?.x ?? (isIntersection ? 0 : 500);
    const tlWorldY = trafficLight?.y ?? 0;
    if (Math.hypot(worldX - tlWorldX, worldY - tlWorldY) < 18) {
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
  const jumpTo = (x: number, y: number = 0, zoom: number = 10) => {
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
    const h = container.clientHeight;

    if (isIntersection) {
      const fitZoom = Math.max(1.0, Math.min((w - 80) / 520, (h - 80) / 280));
      setCamera({
        x: 0,
        y: 70,
        zoom: fitZoom,
        followingId: null,
      });
    } else {
      const fitZoom = Math.max(0.8, (w - 80) / 1000);
      setCamera({
        x: 500,
        y: 0,
        zoom: fitZoom,
        followingId: null,
      });
    }
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
          onClick={() => setCamera((c) => ({ ...c, zoom: Math.min(50, c.zoom * 1.25) }))}
          title="Zoom In [+]"
        >
          <ZoomIn size={16} />
        </button>

        <button
          className="btn-icon"
          onClick={() => setCamera((c) => ({ ...c, zoom: Math.max(0.5, c.zoom * 0.8) }))}
          title="Zoom Out [-]"
        >
          <ZoomOut size={16} />
        </button>

        <button
          className="btn-icon"
          onClick={fitFullRoad}
          title="Fit Full Road View"
        >
          <Maximize2 size={16} />
        </button>

        <button
          className="btn-icon"
          onClick={() => jumpTo(isIntersection ? 0 : 500, 0, isIntersection ? 10 : 14)}
          title="Focus on Traffic Signal"
        >
          <Crosshair size={16} />
        </button>

        {camera.followingId && (
          <button
            className="btn-secondary active"
            onClick={() => setCamera((c) => ({ ...c, followingId: null }))}
            style={{ fontSize: '0.72rem', padding: '4px 8px' }}
            title="Cancel Follow Mode"
          >
            Unfollow
          </button>
        )}
      </div>

      {/* Quick View Presets for 3-Way Intersection */}
      {isIntersection ? (
        <div
          className="glass-panel"
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            zIndex: 10,
          }}
        >
          <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>VIEW:</span>
          <button
            className="btn-secondary"
            style={{ padding: '3px 8px', fontSize: '0.72rem' }}
            onClick={fitFullRoad}
          >
            Overview
          </button>
          <button
            className="btn-secondary"
            style={{ padding: '3px 8px', fontSize: '0.72rem' }}
            onClick={() => jumpTo(0, 0, 12)}
          >
            Junction
          </button>
          <button
            className="btn-secondary"
            style={{ padding: '3px 8px', fontSize: '0.72rem' }}
            onClick={() => jumpTo(-120, 0, 8)}
          >
            West Arm
          </button>
          <button
            className="btn-secondary"
            style={{ padding: '3px 8px', fontSize: '0.72rem' }}
            onClick={() => jumpTo(120, 0, 8)}
          >
            East Arm
          </button>
          <button
            className="btn-secondary"
            style={{ padding: '3px 8px', fontSize: '0.72rem' }}
            onClick={() => jumpTo(0, 120, 8)}
          >
            North Arm
          </button>
        </div>
      ) : (
        <div
          className="glass-panel"
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            zIndex: 10,
          }}
        >
          <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>VIEW:</span>
          <button
            className="btn-secondary"
            style={{ padding: '3px 8px', fontSize: '0.72rem' }}
            onClick={fitFullRoad}
          >
            Full Road (1000m)
          </button>
          <button
            className="btn-secondary"
            style={{ padding: '3px 8px', fontSize: '0.72rem' }}
            onClick={() => jumpTo(100, 0, 12)}
          >
            West (0m)
          </button>
          <button
            className="btn-secondary"
            style={{ padding: '3px 8px', fontSize: '0.72rem' }}
            onClick={() => jumpTo(500, 0, 14)}
          >
            Signal (500m)
          </button>
          <button
            className="btn-secondary"
            style={{ padding: '3px 8px', fontSize: '0.72rem' }}
            onClick={() => jumpTo(900, 0, 12)}
          >
            East (1000m)
          </button>
        </div>
      )}
    </div>
  );
};
