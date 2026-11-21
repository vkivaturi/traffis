import React from 'react';
import { Play, Pause, RotateCcw, Gauge, Activity, Clock } from 'lucide-react';
import type { SimulationStats, ScenarioMetadata, TrafficLightData } from '../types/simulation';
import { ScenarioConfigPanel } from './ScenarioConfigPanel';

interface ControlsProps {
  isRunning: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  stats: SimulationStats;
  simTime?: number;
  maxSimTime?: number;
  timeLimitReached?: boolean;
  scenario?: ScenarioMetadata | null;
  trafficLight?: TrafficLightData;
  onUpdateOption?: (optionId: string, value: boolean) => void;
}

const baseBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '9px 20px',
  fontSize: '0.86rem',
  fontWeight: 700,
  cursor: 'pointer',
  borderRadius: '8px',
  transition: 'all 0.15s ease',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
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
  scenario,
  trafficLight,
  onUpdateOption,
}) => {
  const hasStarted = simTime > 0;
  const limitReached = timeLimitReached || simTime >= maxSimTime;

  return (
    <div
      id="simulation-main-dock"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        gap: '16px',
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.03)',
        zIndex: 20,
      }}
    >
      {/* Transport buttons for Traffic Operators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {isRunning ? (
          <button
            key="btn-pause"
            id="btn-pause"
            onClick={(e) => {
              (e.currentTarget as HTMLButtonElement).blur();
              onPause();
            }}
            title="Pause simulation [Space key]"
            style={{
              ...baseBtn,
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#b45309',
            }}
          >
            <Pause size={16} />
            <span>PAUSE</span>
          </button>
        ) : (
          <button
            key="btn-start"
            id="btn-start"
            disabled={limitReached}
            onClick={(e) => {
              (e.currentTarget as HTMLButtonElement).blur();
              onPlay();
            }}
            title={
              limitReached
                ? `Time limit of ${fmtTime(maxSimTime)} reached. Reset to run again [R key]`
                : hasStarted ? 'Resume simulation [Space key]' : 'Start simulation [Space key]'
            }
            style={{
              ...baseBtn,
              backgroundColor: '#10b981',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              color: '#ffffff',
              opacity: limitReached ? 0.4 : 1,
              cursor: limitReached ? 'not-allowed' : 'pointer',
            }}
          >
            <Play size={16} fill="currentColor" />
            <span>{limitReached ? 'TIME LIMIT REACHED' : hasStarted ? 'RESUME' : 'START SIMULATION'}</span>
          </button>
        )}

        <button
          id="btn-stop"
          onClick={onStop}
          disabled={!hasStarted && !isRunning}
          title="Reset traffic simulation to beginning [R key]"
          style={{
            ...baseBtn,
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            opacity: !hasStarted && !isRunning ? 0.4 : 1,
            cursor: !hasStarted && !isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          <RotateCcw size={15} />
          <span>RESET</span>
        </button>

        {/* Collapsed Scenario Config Button to the right of RESET */}
        {scenario && onUpdateOption && (
          <ScenarioConfigPanel
            scenario={scenario}
            trafficLight={trafficLight}
            onUpdateOption={onUpdateOption}
          />
        )}
      </div>

      {/* Center Group: Simulation elapsed clock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: '0 1 auto', flexWrap: 'wrap' }}>
        <div
          id="metric-sim-time"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '9px',
            padding: '6px 14px',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}
        >
          <Clock size={17} color="#64748b" />
          <div>
            <div
              style={{
                fontSize: '0.62rem',
                color: '#64748b',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                lineHeight: 1,
              }}
            >
              Elapsed Time
            </div>
            <div
              style={{
                fontSize: '0.98rem',
                fontWeight: 800,
                color: '#0f172a',
                fontFamily: 'var(--font-mono)',
                marginTop: '3px',
                lineHeight: 1,
              }}
            >
              {fmtTime(Math.min(simTime, maxSimTime))}
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}> / {fmtTime(maxSimTime)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Non-technical operational telemetry */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div
          id="metric-avg-speed"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '7px 16px',
            backgroundColor: '#ecfdf5',
            borderRadius: '8px',
            border: '1px solid #a7f3d0',
          }}
        >
          <Gauge size={19} color="#059669" />
          <div>
            <div style={{ fontSize: '0.66rem', color: '#047857', textTransform: 'uppercase', fontWeight: 700 }}>
              Average Traffic Speed
            </div>
            <div
              style={{
                fontSize: '1.15rem',
                fontWeight: 800,
                color: '#064e3b',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1.1,
              }}
            >
              {stats.avg_speed_kmh}{' '}
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#047857' }}>km/h</span>
            </div>
          </div>
        </div>

        <div
          id="metric-pce-flow"
          title="Corridor Flow Rate in Passenger Car Equivalent per hour (IRC guidelines)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '7px 16px',
            backgroundColor: '#eff6ff',
            borderRadius: '8px',
            border: '1px solid #bfdbfe',
          }}
        >
          <Activity size={19} color="#2563eb" />
          <div>
            <div style={{ fontSize: '0.66rem', color: '#1d4ed8', textTransform: 'uppercase', fontWeight: 700 }}>
              Traffic Flow (Vehicles / hr)
            </div>
            <div
              style={{
                fontSize: '1.15rem',
                fontWeight: 800,
                color: '#1e40af',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1.1,
              }}
            >
              {Math.round(stats.pce_per_hour ?? 0).toLocaleString()}{' '}
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#1d4ed8' }}>PCE/h</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Controls;
