import React, { useState } from 'react';
import { Sliders, ChevronDown, ChevronUp, TrafficCone, ShieldAlert } from 'lucide-react';
import type { ScenarioMetadata, TrafficLightData } from '../types/simulation';

interface ScenarioConfigPanelProps {
  scenario?: ScenarioMetadata | null;
  trafficLight?: TrafficLightData;
  onUpdateOption: (optionId: string, value: boolean) => void;
}

export const ScenarioConfigPanel: React.FC<ScenarioConfigPanelProps> = ({
  scenario,
  trafficLight,
  onUpdateOption,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const options = scenario?.options;
  if (!options || options.length === 0) {
    return null;
  }

  const signalsOption = options.find((o) => o.id === 'roundabout_signals');
  const isSignalsEnabled = Boolean(signalsOption?.value);

  const timeLapseOption = options.find((o) => o.id === 'time_lapse');
  const isTimeLapseEnabled = Boolean(timeLapseOption?.value);

  // Group status if signals active
  const ngGroup = trafficLight?.signal_groups?.find((g) => g.id === 'NG');
  const flTlGroup = trafficLight?.signal_groups?.find((g) => g.id === 'FL_TL');

  const getLampColor = (state?: string) => {
    switch (state) {
      case 'green':
        return '#10b981';
      case 'yellow':
        return '#f59e0b';
      case 'red':
      default:
        return '#ef4444';
    }
  };

  return (
    <div
      id="scenario-config-panel"
      className="glass-panel"
      style={{
        position: 'absolute',
        top: '60px',
        right: '16px',
        width: '320px',
        padding: '12px 14px',
        zIndex: 12,
        fontSize: '0.74rem',
        borderRadius: '12px',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(16px)',
        backgroundColor: 'rgba(15, 23, 42, 0.88)',
      }}
    >
      {/* Header with collapse toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              backgroundColor: isSignalsEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isSignalsEnabled ? '#10b981' : '#38bdf8',
            }}
          >
            <Sliders size={13} />
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#f8fafc', letterSpacing: '0.04em', fontSize: '0.75rem' }}>
              SCENARIO CONFIG
            </div>
            <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>
              {isSignalsEnabled ? 'Signals Active' : 'Unsignalised Merging'}
              {isTimeLapseEnabled ? ' · Time Lapse' : ''}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              padding: '2px 7px',
              borderRadius: '9999px',
              fontSize: '0.6rem',
              fontWeight: 700,
              backgroundColor: isSignalsEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)',
              color: isSignalsEnabled ? '#34d399' : '#94a3b8',
              border: `1px solid ${isSignalsEnabled ? 'rgba(16, 185, 129, 0.4)' : 'rgba(100, 116, 139, 0.3)'}`,
            }}
          >
            {isSignalsEnabled ? 'SIGNALISED' : 'UNSIGNALISED'}
          </span>
          <button
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '2px',
            }}
          >
            {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Roundabout Signals Toggle Card */}
          {signalsOption && (
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '10px 12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.78rem' }}>
                    {signalsOption.label}
                  </div>
                  <div style={{ fontSize: '0.64rem', color: '#64748b', marginTop: '2px' }}>
                    Control roundabout conflicts via traffic lights
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={isSignalsEnabled}
                  onClick={() => onUpdateOption(signalsOption.id, !isSignalsEnabled)}
                  style={{
                    width: '42px',
                    height: '24px',
                    borderRadius: '12px',
                    backgroundColor: isSignalsEnabled ? '#10b981' : '#334155',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    padding: '2px',
                    transition: 'background-color 0.2s ease',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      transform: isSignalsEnabled ? 'translateX(18px)' : 'translateX(0px)',
                      transition: 'transform 0.2s ease',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                    }}
                  />
                </button>
              </div>

              <div
                style={{
                  marginTop: '10px',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: '0.66rem',
                  color: '#94a3b8',
                  lineHeight: 1.45,
                }}
              >
                {isSignalsEnabled ? (
                  <>
                    <div style={{ color: '#38bdf8', fontWeight: 600, marginBottom: '4px' }}>
                      Active Signal Plan:
                    </div>
                    <div>• <b>NG→FL & NG→TL:</b> Share one signal (both green or both red)</div>
                    <div>• <b>FL→TL:</b> Managed ring traffic continuation</div>
                    <div>• <b>TL Free Left:</b> Continuous flow (no signal)</div>
                  </>
                ) : (
                  <div style={{ color: '#94a3b8' }}>
                    All traffic merges according to roundabout priority rules.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Time Lapse Toggle Card */}
          {timeLapseOption && (
            <div
              style={{
                backgroundColor: isTimeLapseEnabled ? 'rgba(56, 189, 248, 0.06)' : 'rgba(255, 255, 255, 0.03)',
                border: `1px solid ${isTimeLapseEnabled ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
                borderRadius: '8px',
                padding: '10px 12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.78rem' }}>
                      {timeLapseOption.label}
                    </span>
                    {isTimeLapseEnabled && (
                      <span
                        style={{
                          fontSize: '0.58rem',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(56, 189, 248, 0.2)',
                          color: '#38bdf8',
                          fontWeight: 700,
                        }}
                      >
                        50s JUMP / 10s STREAM
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.64rem', color: '#64748b', marginTop: '2px' }}>
                    Fast-forward backend, view 10s intervals
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={isTimeLapseEnabled}
                  onClick={() => onUpdateOption(timeLapseOption.id, !isTimeLapseEnabled)}
                  style={{
                    width: '42px',
                    height: '24px',
                    borderRadius: '12px',
                    backgroundColor: isTimeLapseEnabled ? '#0284c7' : '#334155',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    padding: '2px',
                    transition: 'background-color 0.2s ease',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      transform: isTimeLapseEnabled ? 'translateX(18px)' : 'translateX(0px)',
                      transition: 'transform 0.2s ease',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                    }}
                  />
                </button>
              </div>

              <div
                style={{
                  marginTop: '8px',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: '0.66rem',
                  color: isTimeLapseEnabled ? '#7dd3fc' : '#94a3b8',
                  lineHeight: 1.45,
                }}
              >
                {isTimeLapseEnabled
                  ? 'Simulation jumps forward 50s in the background, then streams 10s of events to the UI while updating all screen metrics.'
                  : 'Enable to simulate long durations quickly with alternating 50s jumps and 10s interactive playback.'}
              </div>
            </div>
          )}

          {/* Live Signal Telemetry when enabled */}
          {isSignalsEnabled && trafficLight && (
            <div
              style={{
                marginTop: '10px',
                backgroundColor: 'rgba(16, 185, 129, 0.06)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                borderRadius: '8px',
                padding: '8px 10px',
              }}
            >
              <div
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  color: '#34d399',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginBottom: '6px',
                }}
              >
                <TrafficCone size={11} /> LIVE SIGNAL STATUS · {trafficLight.phase_name || 'Active Phase'}
              </div>

              {/* Group status rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.66rem',
                  }}
                >
                  <span style={{ color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: getLampColor(ngGroup?.state),
                        boxShadow: `0 0 6px ${getLampColor(ngGroup?.state)}`,
                      }}
                    />
                    NG Entry (NG→FL & NG→TL)
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: getLampColor(ngGroup?.state),
                    }}
                  >
                    {ngGroup?.state?.toUpperCase() ?? 'RED'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.66rem',
                  }}
                >
                  <span style={{ color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: getLampColor(flTlGroup?.state),
                        boxShadow: `0 0 6px ${getLampColor(flTlGroup?.state)}`,
                      }}
                    />
                    Ring FL→TL
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: getLampColor(flTlGroup?.state),
                    }}
                  >
                    {flTlGroup?.state?.toUpperCase() ?? 'RED'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.66rem',
                  }}
                >
                  <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#38bdf8',
                      }}
                    />
                    TL Free Left
                  </span>
                  <span style={{ color: '#38bdf8', fontSize: '0.6rem', fontWeight: 600 }}>
                    FREE FLOW
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Restart note */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              marginTop: '8px',
              fontSize: '0.6rem',
              color: '#64748b',
            }}
          >
            <ShieldAlert size={10} />
            <span>Toggling resets simulation clock to t=0 to reconfigure road network.</span>
          </div>
        </div>
      )}
    </div>
  );
};
