import React from 'react';
import { Clock, SkipForward, Crosshair, Zap, RotateCcw } from 'lucide-react';
import type { TrafficLightData, TrafficLightSettings, TrafficSignalColor, TrafficSignalMode } from '../types/simulation';

interface TrafficSignalPanelProps {
  trafficLight?: TrafficLightData;
  onUpdateSettings: (settings: TrafficLightSettings) => void;
  onNextPhase: () => void;
  onFocusSignal: () => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const TrafficSignalPanel: React.FC<TrafficSignalPanelProps> = ({
  trafficLight,
  onUpdateSettings,
  onNextPhase,
  onFocusSignal,
  isOpen,
  onToggleOpen,
}) => {
  if (!trafficLight) return null;

  const {
    state,
    mode,
    green_duration,
    phase_remaining,
    next_state,
  } = trafficLight;

  const handleModeChange = (newMode: TrafficSignalMode) => {
    onUpdateSettings({ mode: newMode });
  };

  const handleForceState = (forceColor: TrafficSignalColor) => {
    onUpdateSettings({ mode: 'manual', state: forceColor });
  };


  const getStateColor = (color: TrafficSignalColor) => {
    if (color === 'green') return '#10b981';
    if (color === 'yellow') return '#f59e0b';
    return '#ef4444';
  };

  const getStateLabel = (color: TrafficSignalColor) => {
    if (color === 'green') return 'PROCEED';
    if (color === 'yellow') return 'CAUTION';
    return 'STOP';
  };

  const activeColorHex = getStateColor(state);

  return (
    <div
      id="traffic-signal-hud-widget"
      style={{
        position: 'absolute',
        top: '16px',
        left: '20px',
        zIndex: 25,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxWidth: isOpen ? '360px' : '220px',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* 1. Header Card / Compact Status Pill */}
      <div
        className="glass-panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          cursor: 'pointer',
          border: `1px solid ${activeColorHex}55`,
          boxShadow: `0 4px 20px rgba(0, 0, 0, 0.5), 0 0 15px ${activeColorHex}33`,
          backdropFilter: 'blur(16px)',
          borderRadius: '12px',
        }}
        onClick={onToggleOpen}
        title="Click to expand/collapse Traffic Signal settings"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Animated 3-Dot Mini Signal Icon */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              padding: '4px 3px',
              backgroundColor: '#0f172a',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: state === 'red' ? '#ef4444' : '#331518',
                boxShadow: state === 'red' ? '0 0 8px #ef4444' : 'none',
              }}
            />
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: state === 'yellow' ? '#f59e0b' : '#302412',
                boxShadow: state === 'yellow' ? '0 0 8px #f59e0b' : 'none',
              }}
            />
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: state === 'green' ? '#10b981' : '#122c22',
                boxShadow: state === 'green' ? '0 0 8px #10b981' : 'none',
              }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  color: activeColorHex,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.5px',
                }}
              >
                {getStateLabel(state)}
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  backgroundColor: mode === 'auto' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: mode === 'auto' ? '#38bdf8' : '#f59e0b',
                  textTransform: 'uppercase',
                }}
              >
                {mode}
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              {mode === 'auto' ? (
                <span>
                  Next: <strong style={{ color: getStateColor(next_state) }}>{next_state.toUpperCase()}</strong> in{' '}
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#f8fafc', fontWeight: 700 }}>
                    {phase_remaining.toFixed(1)}s
                  </span>
                </span>
              ) : (
                <span style={{ color: '#cbd5e1' }}>Manual Hold</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            className="btn-icon"
            style={{ width: '28px', height: '28px' }}
            onClick={(e) => {
              e.stopPropagation();
              onFocusSignal();
            }}
            title="Pan Camera to Traffic Signal (500m)"
          >
            <Crosshair size={14} color="#38bdf8" />
          </button>
          <div
            style={{
              fontSize: '0.75rem',
              color: '#64748b',
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}
          >
            ▼
          </div>
        </div>
      </div>

      {/* 2. Expanded Control Panel */}
      {isOpen && (
        <div
          className="glass-panel"
          style={{
            padding: '16px',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7)',
          }}
        >
          {/* Top Row: Visual Signal Head + Big Timer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            {/* Visual Signal Gantry Light Head */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: '#090d16',
                borderRadius: '10px',
                border: '1px solid #1e293b',
                boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.8)',
              }}
            >
              {/* Red Lamp */}
              <button
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: state === 'red' ? '2px solid #fecaca' : '1px solid #331518',
                  backgroundColor: state === 'red' ? '#ef4444' : '#1c0c0e',
                  boxShadow: state === 'red' ? '0 0 16px #ef4444, 0 0 28px rgba(239, 68, 68, 0.6)' : 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onClick={() => handleForceState('red')}
                title="Force RED Signal"
              >
                {state === 'red' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#fff', opacity: 0.8 }} />}
              </button>

              {/* Yellow Lamp */}
              <button
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: state === 'yellow' ? '2px solid #fef3c7' : '1px solid #302412',
                  backgroundColor: state === 'yellow' ? '#f59e0b' : '#1a140a',
                  boxShadow: state === 'yellow' ? '0 0 16px #f59e0b, 0 0 28px rgba(245, 158, 11, 0.6)' : 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onClick={() => handleForceState('yellow')}
                title="Force YELLOW Signal"
              >
                {state === 'yellow' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#fff', opacity: 0.8 }} />}
              </button>

              {/* Green Lamp */}
              <button
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: state === 'green' ? '2px solid #a7f3d0' : '1px solid #122c22',
                  backgroundColor: state === 'green' ? '#10b981' : '#081711',
                  boxShadow: state === 'green' ? '0 0 16px #10b981, 0 0 28px rgba(16, 185, 129, 0.6)' : 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onClick={() => handleForceState('green')}
                title="Force GREEN Signal"
              >
                {state === 'green' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#fff', opacity: 0.8 }} />}
              </button>
            </div>

            {/* Countdown / Phase Timer Badge */}
            <div style={{ flex: 1, textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                {mode === 'auto' ? 'Phase Timer' : 'Manual Hold'}
              </div>
              <div
                style={{
                  fontSize: '1.6rem',
                  fontWeight: 900,
                  fontFamily: 'var(--font-mono)',
                  color: activeColorHex,
                  lineHeight: 1.1,
                  textShadow: `0 0 12px ${activeColorHex}66`,
                }}
              >
                {mode === 'auto' ? `${phase_remaining.toFixed(1)}s` : 'HOLD'}
              </div>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              padding: '4px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <button
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                backgroundColor: mode === 'auto' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                color: mode === 'auto' ? '#38bdf8' : '#94a3b8',
                transition: 'all 0.15s ease',
              }}
              onClick={() => handleModeChange('auto')}
            >
              <Clock size={13} />
              Auto Cycling
            </button>

            <button
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                backgroundColor: mode === 'manual' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                color: mode === 'manual' ? '#f59e0b' : '#94a3b8',
                transition: 'all 0.15s ease',
              }}
              onClick={() => handleModeChange('manual')}
            >
              <Zap size={13} />
              Manual Override
            </button>
          </div>

          {/* Quick Manual Actions & Skip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
            <button
              className="btn-secondary"
              style={{
                padding: '6px',
                fontSize: '0.72rem',
                fontWeight: 700,
                backgroundColor: state === 'red' ? 'rgba(239, 68, 68, 0.2)' : undefined,
                color: '#ef4444',
                borderColor: 'rgba(239, 68, 68, 0.3)',
              }}
              onClick={() => handleForceState('red')}
            >
              Red
            </button>
            <button
              className="btn-secondary"
              style={{
                padding: '6px',
                fontSize: '0.72rem',
                fontWeight: 700,
                backgroundColor: state === 'yellow' ? 'rgba(245, 158, 11, 0.2)' : undefined,
                color: '#f59e0b',
                borderColor: 'rgba(245, 158, 11, 0.3)',
              }}
              onClick={() => handleForceState('yellow')}
            >
              Yellow
            </button>
            <button
              className="btn-secondary"
              style={{
                padding: '6px',
                fontSize: '0.72rem',
                fontWeight: 700,
                backgroundColor: state === 'green' ? 'rgba(16, 185, 129, 0.2)' : undefined,
                color: '#10b981',
                borderColor: 'rgba(16, 185, 129, 0.3)',
              }}
              onClick={() => handleForceState('green')}
            >
              Green
            </button>
            <button
              className="btn-secondary"
              style={{
                padding: '6px',
                fontSize: '0.72rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}
              onClick={onNextPhase}
              title="Skip to Next Phase"
            >
              <SkipForward size={12} />
              Skip
            </button>
          </div>

          {/* Timing Configuration Section: Green Duration Selection & System-Calculated Red */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              paddingTop: '10px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Green Phase Durations
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                  Amber fixed to 3s • Red calculated automatically
                </div>
              </div>
              <button
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
                onClick={() => {
                  onUpdateSettings({
                    green_duration: 30,
                    green_durations: {
                      main: 30,
                      east_west: 30,
                      north: 30,
                      north_south: 30,
                    },
                  });
                }}
                title="Reset all signals to 30s Green default"
              >
                <RotateCcw size={10} />
                Defaults (30s)
              </button>
            </div>

            {/* Per-Signal / Approach Green Sliders */}
            {trafficLight.signal_groups && trafficLight.signal_groups.length > 0 ? (
              trafficLight.signal_groups.map((group) => (
                <div
                  key={group.id}
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    border: group.is_active_green ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f1f5f9' }}>
                        {group.name}
                      </span>
                      {group.is_active_green && (
                        <span
                          style={{
                            fontSize: '0.6rem',
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: '3px',
                            backgroundColor: 'rgba(16, 185, 129, 0.2)',
                            color: '#10b981',
                            textTransform: 'uppercase',
                          }}
                        >
                          ACTIVE GREEN
                        </span>
                      )}
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 800, fontSize: '0.8rem' }}>
                      {group.green_duration}s Green
                    </span>
                  </div>

                  <input
                    type="range"
                    min="5"
                    max="120"
                    step="1"
                    value={group.green_duration}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onUpdateSettings({
                        green_durations: {
                          ...(trafficLight.signal_groups?.reduce((acc, g) => ({ ...acc, [g.id]: g.green_duration }), {})),
                          [group.id]: val,
                        },
                      });
                    }}
                    style={{ width: '100%', accentColor: '#10b981', cursor: 'pointer' }}
                  />

                  {/* Calculated Timings Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.65rem' }}>
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                      ● Amber: <strong style={{ color: '#fbbf24' }}>3s</strong> (fixed)
                    </span>
                    <span style={{ color: '#94a3b8' }}>
                      Calculated Red:{' '}
                      <strong style={{ color: '#f87171', fontFamily: 'var(--font-mono)' }}>
                        {group.calculated_red_duration}s
                      </strong>
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '4px' }}>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>● Green Duration</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#f8fafc', fontWeight: 700 }}>
                    {green_duration}s
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="120"
                  step="1"
                  value={green_duration}
                  onChange={(e) => onUpdateSettings({ green_duration: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: '#10b981', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.65rem' }}>
                  <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                    ● Amber: <strong style={{ color: '#fbbf24' }}>3s</strong> (fixed)
                  </span>
                  <span style={{ color: '#94a3b8' }}>
                    Calculated Red:{' '}
                    <strong style={{ color: '#f87171', fontFamily: 'var(--font-mono)' }}>
                      {green_duration + 3}s
                    </strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
