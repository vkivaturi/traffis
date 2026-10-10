import React from 'react';
import { Play, Pause, Square, Gauge, Activity, Clock, AlertCircle } from 'lucide-react';
import type { SimulationStats } from '../types/simulation';

/**
 * Minimal transport dock: Start / Pause / Stop.
 *
 * All simulation parameters (inflow rate, default speed, vehicle mix,
 * signal timings, time limit) are defined per scenario in
 * `backend/sumo_config/scenarios/<id>/scenario.xml` — nothing is tunable from the UI.
 */
interface ControlsProps {
  isRunning: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  stats: SimulationStats;
  simTime?: number;
  maxSimTime?: number;
  timeLimitReached?: boolean;
}

const baseBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '7px',
  padding: '9px 18px',
  fontSize: '0.85rem',
  fontWeight: 800,
  cursor: 'pointer',
};

const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

export const Controls: React.FC<ControlsProps> = ({
  isRunning,
  onPlay,
  onPause,
  onStop,
  stats,
  simTime = 0,
  maxSimTime = 300,
  timeLimitReached = false,
}) => {
  const isLimitReached = !!timeLimitReached || simTime >= maxSimTime;
  const hasStarted = simTime > 0;
  const progress = Math.min(100, (simTime / Math.max(1, maxSimTime)) * 100);

  return (
    <div
      id="simulation-main-dock"
      className="glass-panel"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 18px',
        gap: '16px',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: 20,
      }}
    >
      {/* Transport buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {isRunning ? (
          <button
            id="btn-pause"
            className="btn-secondary"
            onClick={onPause}
            title="Pause simulation [Space]"
            style={{
              ...baseBtn,
              backgroundColor: 'rgba(245, 158, 11, 0.16)',
              borderColor: 'rgba(245, 158, 11, 0.5)',
              color: '#fbbf24',
              boxShadow: '0 0 12px rgba(245, 158, 11, 0.2)',
            }}
          >
            <Pause size={16} />
            <span>PAUSE</span>
          </button>
        ) : (
          <button
            id="btn-start"
            className="btn-primary"
            onClick={onPlay}
            disabled={isLimitReached}
            title={isLimitReached ? 'Time limit reached — press Stop to reset' : hasStarted ? 'Resume simulation [Space]' : 'Start simulation [Space]'}
            style={{
              ...baseBtn,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              borderColor: 'rgba(16, 185, 129, 0.5)',
              boxShadow: '0 0 16px rgba(16, 185, 129, 0.3)',
              opacity: isLimitReached ? 0.45 : 1,
              cursor: isLimitReached ? 'not-allowed' : 'pointer',
            }}
          >
            <Play size={16} fill="currentColor" />
            <span>{hasStarted && !isLimitReached ? 'RESUME' : 'START'}</span>
          </button>
        )}

        <button
          id="btn-stop"
          className="btn-secondary"
          onClick={onStop}
          disabled={!hasStarted && !isRunning}
          title="Stop and reset simulation to t=0 [R]"
          style={{
            ...baseBtn,
            backgroundColor: 'rgba(244, 63, 94, 0.14)',
            borderColor: 'rgba(244, 63, 94, 0.45)',
            color: '#fb7185',
            opacity: !hasStarted && !isRunning ? 0.45 : 1,
            cursor: !hasStarted && !isRunning ? 'not-allowed' : 'pointer',
            boxShadow: isLimitReached ? '0 0 14px rgba(244, 63, 94, 0.35)' : undefined,
          }}
        >
          <Square size={14} fill="currentColor" className={isLimitReached ? 'pulse-indicator' : ''} />
          <span>STOP</span>
        </button>
      </div>

      {/* Simulation clock */}
      <div
        id="metric-sim-time"
        style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '220px', flex: '0 1 320px' }}
      >
        {isLimitReached ? <AlertCircle size={18} color="#f43f5e" /> : <Clock size={18} color="#94a3b8" />}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
            <span>{isLimitReached ? 'Time limit reached' : 'Simulation time'}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#f8fafc' }}>
              {fmtTime(simTime)} / {fmtTime(maxSimTime)}
            </span>
          </div>
          <div style={{ height: '5px', borderRadius: '3px', backgroundColor: 'rgba(255,255,255,0.08)', marginTop: '4px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: isLimitReached ? '#f43f5e' : 'linear-gradient(90deg, #38bdf8, #10b981)',
                transition: 'width 0.2s linear',
              }}
            />
          </div>
        </div>
      </div>

      {/* Read-only telemetry */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <div
          id="metric-avg-speed"
          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 14px', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.25)' }}
        >
          <Gauge size={20} color="#10b981" />
          <div>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Average Speed</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)', lineHeight: 1.1 }}>
              {stats.avg_speed_kmh} <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8' }}>km/h</span>
            </div>
          </div>
        </div>
        <div
          id="metric-pce-flow"
          title="Flow rate in Passenger Car Equivalent per hour (IRC: Car 1.0, Sports 1.0, Van 1.4, Truck 3.0)"
          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 14px', backgroundColor: 'rgba(56, 189, 248, 0.1)', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.25)' }}
        >
          <Activity size={20} color="#38bdf8" />
          <div>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Vehicles / Hour (PCE)</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)', lineHeight: 1.1 }}>
              {Math.round(stats.pce_per_hour ?? 0).toLocaleString()}{' '}
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8' }}>PCE/h</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Controls;
