import React, { useState, useRef, useEffect } from 'react';
import { Sliders, ChevronDown, ChevronUp, TrafficCone, ShieldAlert, X } from 'lucide-react';
import type { ScenarioMetadata, TrafficLightData } from '../types/simulation';

export interface ScenarioConfigPanelProps {
  scenario?: ScenarioMetadata | null;
  trafficLight?: TrafficLightData;
  onUpdateOption: (optionId: string, value: boolean) => void;
}

export const ScenarioConfigPanel: React.FC<ScenarioConfigPanelProps> = ({
  scenario,
  trafficLight,
  onUpdateOption,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [trackedScenarioId, setTrackedScenarioId] = useState(scenario?.id);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close popover when scenario changes without cascading effect renders
  if (scenario?.id !== trackedScenarioId) {
    setTrackedScenarioId(scenario?.id);
    setIsOpen(false);
  }

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const options = scenario?.options;
  if (!options || options.length === 0) {
    return null;
  }

  const signalsOption = options.find((o) => o.id === 'roundabout_signals');
  const isSignalsEnabled = Boolean(signalsOption?.value);

  const timeLapseOption = options.find((o) => o.id === 'time_lapse');
  const isTimeLapseEnabled = Boolean(timeLapseOption?.value);

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
      ref={panelRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {/* Collapsed Button: Sits to the right of RESET button */}
      <button
        id="btn-scenario-config"
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title={isOpen ? 'Collapse scenario configuration' : 'Configure scenario options'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '9px 18px',
          fontSize: '0.86rem',
          fontWeight: 700,
          cursor: 'pointer',
          borderRadius: '8px',
          transition: 'all 0.15s ease',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
          backgroundColor: isOpen ? '#f7f1ea' : '#ffffff',
          border: isOpen ? '1px solid #4a2c11' : '1px solid #cbd5e1',
          color: isOpen ? '#4a2c11' : '#334155',
        }}
      >
        <Sliders size={15} color={isOpen ? '#4a2c11' : '#5c3a21'} />
        <span>CONFIG</span>

        {signalsOption && (
          <span
            style={{
              padding: '1px 6px',
              borderRadius: '9999px',
              fontSize: '0.62rem',
              fontWeight: 700,
              backgroundColor: isSignalsEnabled ? '#ecfdf5' : '#f1f5f9',
              color: isSignalsEnabled ? '#059669' : '#64748b',
              border: `1px solid ${isSignalsEnabled ? '#a7f3d0' : '#e2e8f0'}`,
            }}
          >
            {isSignalsEnabled ? 'SIGNALS' : 'ROUNDABOUT'}
          </span>
        )}

        {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {/* Expanded Popover Panel: Pops upwards directly above the button */}
      {isOpen && (
        <div
          id="scenario-config-panel"
          className="glass-panel"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 10px)',
            left: 0,
            width: '340px',
            maxHeight: 'calc(100vh - 140px)',
            overflowY: 'auto',
            padding: '14px 16px',
            zIndex: 50,
            fontSize: '0.74rem',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            backgroundColor: 'rgba(255, 255, 255, 0.98)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.06)',
          }}
        >
          {/* Popover Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '10px',
              borderBottom: '1px solid #f1f5f9',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '6px',
                  backgroundColor: isSignalsEnabled ? '#ecfdf5' : '#eff6ff',
                  border: `1px solid ${isSignalsEnabled ? '#a7f3d0' : '#bfdbfe'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isSignalsEnabled ? '#059669' : '#2563eb',
                }}
              >
                <Sliders size={14} />
              </div>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a', letterSpacing: '0.04em', fontSize: '0.78rem' }}>
                  SCENARIO CONFIG
                </div>
                <div style={{ fontSize: '0.64rem', color: '#64748b' }}>
                  {signalsOption
                    ? isSignalsEnabled
                      ? 'Signals Active'
                      : 'Unsignalised Merging'
                    : 'Signalised Junction'}
                  {isTimeLapseEnabled ? ' · Time Lapse' : ''}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  backgroundColor:
                    signalsOption && !isSignalsEnabled
                      ? '#f1f5f9'
                      : '#ecfdf5',
                  color: signalsOption && !isSignalsEnabled ? '#475569' : '#059669',
                  border: `1px solid ${
                    signalsOption && !isSignalsEnabled
                      ? '#cbd5e1'
                      : '#a7f3d0'
                  }`,
                }}
              >
                {signalsOption && !isSignalsEnabled ? 'UNSIGNALISED' : 'SIGNALISED'}
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px',
                  borderRadius: '4px',
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Roundabout Signals Toggle Card */}
            {signalsOption && (
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.8rem' }}>
                      {signalsOption.label}
                    </div>
                    <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
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
                      backgroundColor: isSignalsEnabled ? '#10b981' : '#cbd5e1',
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
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
                      }}
                    />
                  </button>
                </div>

                <div
                  style={{
                    marginTop: '10px',
                    paddingTop: '8px',
                    borderTop: '1px solid #e2e8f0',
                    fontSize: '0.68rem',
                    color: '#475569',
                    lineHeight: 1.5,
                  }}
                >
                  {isSignalsEnabled ? (
                    <>
                      <div style={{ color: '#2563eb', fontWeight: 600, marginBottom: '4px' }}>
                        Active Signal Plan:
                      </div>
                      <div>• <b>NG→FL & NG→TL:</b> Share one signal (both green or both red)</div>
                      <div>• <b>FL→TL:</b> Managed ring traffic continuation</div>
                      <div>• <b>TL Free Left:</b> Continuous flow (no signal)</div>
                    </>
                  ) : (
                    <div style={{ color: '#64748b' }}>
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
                  backgroundColor: isTimeLapseEnabled ? '#eff6ff' : '#f8fafc',
                  border: `1px solid ${isTimeLapseEnabled ? '#bfdbfe' : '#e2e8f0'}`,
                  borderRadius: '8px',
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.8rem' }}>
                        {timeLapseOption.label}
                      </span>
                      {isTimeLapseEnabled && (
                        <span
                          style={{
                            fontSize: '0.58rem',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            backgroundColor: '#dbeafe',
                            color: '#1d4ed8',
                            fontWeight: 700,
                          }}
                        >
                          50s JUMP / 10s STREAM
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
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
                      backgroundColor: isTimeLapseEnabled ? '#2563eb' : '#cbd5e1',
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
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
                      }}
                    />
                  </button>
                </div>

                <div
                  style={{
                    marginTop: '8px',
                    paddingTop: '8px',
                    borderTop: '1px solid #e2e8f0',
                    fontSize: '0.68rem',
                    color: isTimeLapseEnabled ? '#1e40af' : '#64748b',
                    lineHeight: 1.5,
                  }}
                >
                  {isTimeLapseEnabled
                    ? 'Simulation jumps forward 50s in the background, then streams 10s of events to the UI while updating all screen metrics.'
                    : 'Enable to simulate long durations quickly with alternating 50s jumps and 10s interactive playback.'}
                </div>
              </div>
            )}

            {/* Live Signal Telemetry when enabled or signalised */}
            {(isSignalsEnabled || (!signalsOption && Boolean(trafficLight?.signal_groups?.length))) && trafficLight && (
              <div
                style={{
                  marginTop: '4px',
                  backgroundColor: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: '8px',
                  padding: '8px 10px',
                }}
              >
                <div
                  style={{
                    fontSize: '0.64rem',
                    fontWeight: 700,
                    color: '#065f46',
                    textTransform: 'uppercase',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginBottom: '6px',
                  }}
                >
                  <TrafficCone size={12} color="#059669" /> LIVE SIGNAL STATUS · {trafficLight.phase_name || 'Active Phase'}
                </div>

                {/* Group status rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {trafficLight.signal_groups && trafficLight.signal_groups.length > 0 ? (
                    trafficLight.signal_groups.map((group) => {
                      const lampColor = getLampColor(group.state);
                      return (
                        <div
                          key={group.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '0.68rem',
                          }}
                        >
                          <span style={{ color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: lampColor,
                              }}
                            />
                            {group.name}
                          </span>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              color: lampColor,
                            }}
                          >
                            {group.state?.toUpperCase() ?? 'RED'}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.68rem',
                      }}
                    >
                      <span style={{ color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: getLampColor(trafficLight.state),
                          }}
                        />
                        Active Signal
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: getLampColor(trafficLight.state),
                        }}
                      >
                        {trafficLight.state?.toUpperCase()}
                      </span>
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.66rem',
                      marginTop: '2px',
                      paddingTop: '4px',
                      borderTop: '1px solid #a7f3d0',
                    }}
                  >
                    <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: '#0284c7',
                        }}
                      />
                      Free Lefts (TL→FL & FL→NG)
                    </span>
                    <span style={{ color: '#0284c7', fontSize: '0.62rem', fontWeight: 700 }}>
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
                marginTop: '4px',
                fontSize: '0.62rem',
                color: '#64748b',
              }}
            >
              <ShieldAlert size={11} />
              <span>Toggling resets simulation clock to t=0 to reconfigure road network.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScenarioConfigPanel;
