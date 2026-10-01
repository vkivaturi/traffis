import React, { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  StepForward,
  Gauge,
  Activity,
  Sliders,
  ChevronDown,
  Car,
  Truck,
  Sparkles,
  Crosshair,
  Clock,
  SkipForward,
} from 'lucide-react';
import type {
  SpawnOptions,
  AutoSpawnSettings,
  TrafficLightData,
  TrafficLightSettings,
  SimulationStats,
  Vehicle,
} from '../types/simulation';

interface ControlsProps {
  isRunning: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onStep: () => void;
  onSpawnVehicle: (options: SpawnOptions) => void;
  autoSpawnSettings: AutoSpawnSettings;
  onUpdateAutoSpawn: (settings: AutoSpawnSettings) => void;
  trafficLight?: TrafficLightData;
  onUpdateTrafficLight?: (settings: TrafficLightSettings) => void;
  onNextTrafficLightPhase?: () => void;
  onFocusTrafficSignal?: () => void;
  activeScenarioId?: string;
  stats: SimulationStats;
  vehicles: Vehicle[];
  latencyMs?: number;
  updateRateHz?: number;
  dataExchangedMB?: number;
}

const COLOR_OPTIONS = [
  '#38bdf8', // Sky Blue
  '#f43f5e', // Crimson Rose
  '#10b981', // Emerald
  '#f59e0b', // Amber Gold
  '#8b5cf6', // Cyber Violet
  '#ec4899', // Hot Pink
  '#f8fafc', // Glacier White
  '#475569', // Dark Slate
];

const VEHICLE_TYPES = [
  { id: 'car', label: 'Car', icon: Car, pce: '1.0 PCE', desc: 'Standard passenger car' },
  { id: 'sports', label: 'Sports', icon: Sparkles, pce: '1.0 PCE', desc: 'Fast sports sedan' },
  { id: 'van', label: 'Van', icon: Car, pce: '1.4 PCE', desc: 'Light commercial van' },
  { id: 'truck', label: 'Truck', icon: Truck, pce: '3.0 PCE', desc: 'Heavy freight transport' },
] as const;

export const Controls: React.FC<ControlsProps> = ({
  isRunning,
  onPlay,
  onPause,
  onReset,
  onStep,
  onSpawnVehicle,
  autoSpawnSettings,
  onUpdateAutoSpawn,
  trafficLight,
  onUpdateTrafficLight,
  onNextTrafficLightPhase,
  onFocusTrafficSignal,
  activeScenarioId = 'straight_road',
  stats,
  vehicles,
  latencyMs = 0,
  updateRateHz = 20,
  dataExchangedMB = 0,
}) => {
  const isIntersection = activeScenarioId === 'three_way_intersection';
  const currentVehPerHour =
    autoSpawnSettings.rate_per_hour ?? Math.round(autoSpawnSettings.rate_per_minute * 60);

  // Expandable Drawer state
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'spawner' | 'signal' | 'telemetry'>('spawner');

  // Spawner states (Left-Hand Traffic oriented)
  const [selectedDirection, setSelectedDirection] = useState<'east' | 'west' | 'random'>('east');
  const [selectedOrigin, setSelectedOrigin] = useState<'west' | 'east' | 'north' | 'random'>('west');
  const [selectedTurn, setSelectedTurn] = useState<'straight' | 'left' | 'right' | 'random'>('random');
  const [selectedLane, setSelectedLane] = useState<number | null>(null); // null = random, 0 = Slow/Kerb, 1 = Fast/Overtake
  const [vehicleType, setVehicleType] = useState<'car' | 'sports' | 'truck' | 'van'>('car');
  const [vehicleColor, setVehicleColor] = useState<string>('#38bdf8');
  const [initialSpeed, setInitialSpeed] = useState<number>(isIntersection ? 15 : 25);

  const handleSpawn = () => {
    if (isIntersection) {
      onSpawnVehicle({
        origin: selectedOrigin,
        direction: selectedOrigin,
        turn: selectedTurn,
        lane: selectedLane,
        type: vehicleType,
        color: vehicleColor,
        speed: initialSpeed,
      });
    } else {
      onSpawnVehicle({
        direction: selectedDirection,
        origin: selectedDirection,
        lane: selectedLane,
        type: vehicleType,
        color: vehicleColor,
        speed: initialSpeed,
      });
    }
  };

  // Compute LHT bidirectional vehicle counts
  let ebCount = 0;
  let wbCount = 0;
  let ebL0 = 0,
    ebL1 = 0,
    wbL0 = 0,
    wbL1 = 0;

  vehicles.forEach((v) => {
    // In LHT: EB is in +Y (top), WB is in -Y (bottom)
    const isEast = v.direction === 'east' || v.y > 0 || (v.angle >= 45 && v.angle <= 135);
    if (isEast) {
      ebCount++;
      if (v.lane_index === 0) ebL0++;
      else ebL1++;
    } else {
      wbCount++;
      if (v.lane_index === 0) wbL0++;
      else wbL1++;
    }
  });

  return (
    <div
      id="simulation-dock-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        margin: '0 20px 14px 20px',
        zIndex: 25,
      }}
    >
      {/* ==================================================== */}
      {/* EXPANDABLE SECTION (Collapsed by default)           */}
      {/* Contains: Spawner, Signal Controls, Deep Diagnostics */}
      {/* ==================================================== */}
      {isExpanded && (
        <div
          id="expandable-control-panel"
          className="glass-panel"
          style={{
            marginBottom: '10px',
            padding: '16px 20px',
            backgroundColor: 'rgba(11, 16, 28, 0.95)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.5)',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          {/* Drawer Navigation Tabs */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              paddingBottom: '12px',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className={`btn-secondary ${activeTab === 'spawner' ? 'active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  backgroundColor: activeTab === 'spawner' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                  borderColor: activeTab === 'spawner' ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)',
                  color: activeTab === 'spawner' ? '#38bdf8' : '#94a3b8',
                }}
                onClick={() => setActiveTab('spawner')}
              >
                <Car size={15} />
                <span>Vehicle Spawner & Customizer</span>
              </button>

              <button
                className={`btn-secondary ${activeTab === 'signal' ? 'active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  backgroundColor: activeTab === 'signal' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                  borderColor: activeTab === 'signal' ? '#f59e0b' : 'rgba(255, 255, 255, 0.1)',
                  color: activeTab === 'signal' ? '#f59e0b' : '#94a3b8',
                }}
                onClick={() => setActiveTab('signal')}
              >
                <Clock size={15} />
                <span>Traffic Signal Configuration</span>
              </button>

              <button
                className={`btn-secondary ${activeTab === 'telemetry' ? 'active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  backgroundColor: activeTab === 'telemetry' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                  borderColor: activeTab === 'telemetry' ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                  color: activeTab === 'telemetry' ? '#10b981' : '#94a3b8',
                }}
                onClick={() => setActiveTab('telemetry')}
              >
                <Activity size={15} />
                <span>Full Telemetry & Diagnostics</span>
              </button>
            </div>

            <button
              onClick={() => setIsExpanded(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
              }}
              title="Close Advanced Panel"
            >
              <ChevronDown size={16} />
              <span>Close</span>
            </button>
          </div>

          {/* TAB 1: VEHICLE SPAWNER */}
          {activeTab === 'spawner' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
              {/* Approach & Turn Selection */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                  {isIntersection ? 'Approach Arm & Turn Intention' : 'Travel Direction (Indian LHT)'}
                </label>
                {isIntersection ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {(['west', 'east', 'north', 'random'] as const).map((arm) => (
                        <button
                          key={arm}
                          className="btn-secondary"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '0.75rem',
                            textTransform: 'capitalize',
                            backgroundColor: selectedOrigin === arm ? '#0284c7' : 'rgba(15, 23, 42, 0.6)',
                            borderColor: selectedOrigin === arm ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)',
                          }}
                          onClick={() => setSelectedOrigin(arm)}
                        >
                          {arm === 'west' ? 'West →' : arm === 'east' ? '← East' : arm === 'north' ? '↓ North' : 'Random'}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {(['straight', 'left', 'right', 'random'] as const).map((t) => (
                        <button
                          key={t}
                          className="btn-secondary"
                          style={{
                            flex: 1,
                            padding: '5px 8px',
                            fontSize: '0.72rem',
                            textTransform: 'capitalize',
                            backgroundColor: selectedTurn === t ? '#3b82f6' : 'rgba(15, 23, 42, 0.4)',
                            borderColor: selectedTurn === t ? '#60a5fa' : 'rgba(255, 255, 255, 0.1)',
                          }}
                          onClick={() => setSelectedTurn(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn-secondary"
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        fontSize: '0.78rem',
                        backgroundColor: selectedDirection === 'east' ? '#0284c7' : 'rgba(15, 23, 42, 0.6)',
                        borderColor: selectedDirection === 'east' ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)',
                      }}
                      onClick={() => setSelectedDirection('east')}
                    >
                      Eastbound (0m → 1000m)
                    </button>
                    <button
                      className="btn-secondary"
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        fontSize: '0.78rem',
                        backgroundColor: selectedDirection === 'west' ? '#0284c7' : 'rgba(15, 23, 42, 0.6)',
                        borderColor: selectedDirection === 'west' ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)',
                      }}
                      onClick={() => setSelectedDirection('west')}
                    >
                      Westbound (1000m → 0m)
                    </button>
                  </div>
                )}

                {/* Lane selection */}
                <div style={{ marginTop: '12px' }}>
                  <label style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, marginBottom: '6px', display: 'block' }}>
                    Departure Lane (Indian Left-Hand Drive)
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn-secondary"
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '0.72rem',
                        backgroundColor: selectedLane === 0 ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                        borderColor: selectedLane === 0 ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)',
                      }}
                      onClick={() => setSelectedLane(0)}
                    >
                      Lane 0 (Slow / Kerbside)
                    </button>
                    <button
                      className="btn-secondary"
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '0.72rem',
                        backgroundColor: selectedLane === 1 ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                        borderColor: selectedLane === 1 ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)',
                      }}
                      onClick={() => setSelectedLane(1)}
                    >
                      Lane 1 (Fast / Overtake)
                    </button>
                    <button
                      className="btn-secondary"
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '0.72rem',
                        backgroundColor: selectedLane === null ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                        borderColor: selectedLane === null ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)',
                      }}
                      onClick={() => setSelectedLane(null)}
                    >
                      Auto
                    </button>
                  </div>
                </div>
              </div>

              {/* Vehicle Type Selection (with IRC Passenger Car Equivalent factors) */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                  Vehicle Class (IRC Passenger Car Equivalent)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {VEHICLE_TYPES.map((vt) => {
                    const isSelected = vehicleType === vt.id;
                    const Icon = vt.icon;
                    return (
                      <button
                        key={vt.id}
                        className="btn-secondary"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 10px',
                          backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.5)',
                          borderColor: isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)',
                          textAlign: 'left',
                        }}
                        onClick={() => setVehicleType(vt.id)}
                      >
                        <Icon size={18} color={isSelected ? '#38bdf8' : '#94a3b8'} />
                        <div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: isSelected ? '#f8fafc' : '#cbd5e1' }}>
                            {vt.label}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 600 }}>
                            {vt.pce}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Initial Speed Slider */}
                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginBottom: '4px' }}>
                    <span>Initial Speed</span>
                    <span style={{ color: '#f8fafc', fontWeight: 700 }}>{Math.round(initialSpeed * 3.6)} km/h</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="40"
                    step="1"
                    value={initialSpeed}
                    onChange={(e) => setInitialSpeed(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#38bdf8' }}
                  />
                </div>
              </div>

              {/* Color & Spawn Action */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                    Vehicle Color Palette
                  </label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setVehicleColor(c)}
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '6px',
                          backgroundColor: c,
                          border: vehicleColor === c ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                          boxShadow: vehicleColor === c ? `0 0 10px ${c}` : 'none',
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </div>
                </div>

                <button
                  className="btn-primary"
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '0.88rem',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    boxShadow: '0 4px 16px rgba(56, 189, 248, 0.3)',
                  }}
                  onClick={handleSpawn}
                >
                  <Car size={18} />
                  <span>SPAWN VEHICLE NOW [S]</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: TRAFFIC SIGNAL CONFIGURATION */}
          {activeTab === 'signal' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
                  Current Signal State
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    marginBottom: '12px',
                  }}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor:
                        trafficLight?.state === 'green'
                          ? '#10b981'
                          : trafficLight?.state === 'yellow'
                          ? '#f59e0b'
                          : '#ef4444',
                      boxShadow: `0 0 12px ${
                        trafficLight?.state === 'green'
                          ? '#10b981'
                          : trafficLight?.state === 'yellow'
                          ? '#f59e0b'
                          : '#ef4444'
                      }`,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase' }}>
                      {trafficLight?.phase_name || trafficLight?.state || 'GREEN'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      Remaining:{' '}
                      <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                        {trafficLight?.phase_remaining.toFixed(1) ?? '0.0'}s
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn-secondary"
                    style={{
                      flex: 1,
                      padding: '8px',
                      fontSize: '0.75rem',
                      backgroundColor: trafficLight?.mode === 'auto' ? '#0284c7' : 'transparent',
                      borderColor: trafficLight?.mode === 'auto' ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)',
                    }}
                    onClick={() => onUpdateTrafficLight?.({ mode: 'auto' })}
                  >
                    Auto Mode
                  </button>
                  <button
                    className="btn-secondary"
                    style={{
                      flex: 1,
                      padding: '8px',
                      fontSize: '0.75rem',
                      backgroundColor: trafficLight?.mode === 'manual' ? '#f59e0b' : 'transparent',
                      borderColor: trafficLight?.mode === 'manual' ? '#fbbf24' : 'rgba(255, 255, 255, 0.1)',
                    }}
                    onClick={() => onUpdateTrafficLight?.({ mode: 'manual' })}
                  >
                    Manual Hold
                  </button>
                </div>
              </div>

              {/* Timing sliders */}
              <div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
                  Phase Durations
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8' }}>
                      <span>Green Light</span>
                      <span style={{ color: '#10b981', fontWeight: 700 }}>{trafficLight?.green_duration ?? 15}s</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      value={trafficLight?.green_duration ?? 15}
                      onChange={(e) => onUpdateTrafficLight?.({ green_duration: Number(e.target.value) })}
                      style={{ width: '100%', accentColor: '#10b981' }}
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8' }}>
                      <span>Yellow Light</span>
                      <span style={{ color: '#f59e0b', fontWeight: 700 }}>{trafficLight?.yellow_duration ?? 3}s</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={trafficLight?.yellow_duration ?? 3}
                      onChange={(e) => onUpdateTrafficLight?.({ yellow_duration: Number(e.target.value) })}
                      style={{ width: '100%', accentColor: '#f59e0b' }}
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8' }}>
                      <span>Red Light</span>
                      <span style={{ color: '#ef4444', fontWeight: 700 }}>{trafficLight?.red_duration ?? 12}s</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      value={trafficLight?.red_duration ?? 12}
                      onChange={(e) => onUpdateTrafficLight?.({ red_duration: Number(e.target.value) })}
                      style={{ width: '100%', accentColor: '#ef4444' }}
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '10px' }}>
                <button
                  className="btn-secondary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                  }}
                  onClick={() => onNextTrafficLightPhase?.()}
                >
                  <SkipForward size={16} color="#f59e0b" />
                  <span>Advance to Next Phase</span>
                </button>

                <button
                  className="btn-secondary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                  }}
                  onClick={() => onFocusTrafficSignal?.()}
                >
                  <Crosshair size={16} color="#38bdf8" />
                  <span>Focus Camera on Signal</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: FULL TELEMETRY & DIAGNOSTICS */}
          {activeTab === 'telemetry' && (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '12px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ padding: '10px 12px', backgroundColor: 'rgba(15, 23, 42, 0.6)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Active Vehicles</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                    {stats.active_vehicles}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                    EB: {ebCount} (L0:{ebL0}, L1:{ebL1}) | WB: {wbCount} (L0:{wbL0}, L1:{wbL1})
                  </div>
                </div>

                <div style={{ padding: '10px 12px', backgroundColor: 'rgba(15, 23, 42, 0.6)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Spatial Density</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                    {stats.density_veh_km}{' '}
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>veh/km</span>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Roadway saturation</div>
                </div>

                <div style={{ padding: '10px 12px', backgroundColor: 'rgba(15, 23, 42, 0.6)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Spawned / Arrived</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                    {stats.total_spawned} / {stats.total_arrived}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Network trips</div>
                </div>

                <div style={{ padding: '10px 12px', backgroundColor: 'rgba(15, 23, 42, 0.6)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>TraCI Tick Rate</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                    {updateRateHz}{' '}
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Hz</span>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{latencyMs}ms roundtrip</div>
                </div>

                <div style={{ padding: '10px 12px', backgroundColor: 'rgba(15, 23, 42, 0.6)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Data Exchanged</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#c084fc', fontFamily: 'var(--font-mono)' }}>
                    {dataExchangedMB.toFixed(2)}{' '}
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>MB</span>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Browser ↔ Backend</div>
                </div>
              </div>

              {/* Maintenance / Step actions */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  className="btn-secondary"
                  onClick={onStep}
                  disabled={isRunning}
                  style={{ opacity: isRunning ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <StepForward size={15} />
                  <span>Step 0.05s</span>
                </button>
                <button
                  className="btn-secondary"
                  onClick={onReset}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f43f5e', borderColor: 'rgba(244, 63, 94, 0.3)' }}
                >
                  <RotateCcw size={15} />
                  <span>Reset Simulation [R]</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* NORMAL VISIBLE SECTION (Minimal, Streamlined)       */}
      {/* Has: Start/Pause, Density Slider, Avg Speed, PCE/hr, */}
      {/* and Expand Button                                   */}
      {/* ==================================================== */}
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
        }}
      >
        {/* 1. START / PAUSE SIMULATION BUTTON */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isRunning ? (
            <button
              id="btn-pause"
              className="btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                fontSize: '0.85rem',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                borderColor: 'rgba(245, 158, 11, 0.5)',
                boxShadow: '0 0 16px rgba(245, 158, 11, 0.3)',
              }}
              onClick={onPause}
              title="Pause Simulation [Space]"
            >
              <Pause size={17} />
              <span>PAUSE</span>
            </button>
          ) : (
            <button
              id="btn-play"
              className="btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                fontSize: '0.85rem',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                borderColor: 'rgba(16, 185, 129, 0.5)',
                boxShadow: '0 0 16px rgba(16, 185, 129, 0.3)',
              }}
              onClick={onPlay}
              title="Start Simulation [Space]"
            >
              <Play size={17} />
              <span>START</span>
            </button>
          )}

          {/* 2. CHANGE VEHICLE DENSITY SLIDER (Up to 20,000 veh/hr) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '6px 14px',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <Sliders size={16} color="#38bdf8" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                  Vehicle Density
                </span>
                <span
                  style={{
                    fontSize: '0.76rem',
                    color: autoSpawnSettings.enabled && currentVehPerHour > 0 ? '#38bdf8' : '#64748b',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {autoSpawnSettings.enabled && currentVehPerHour > 0
                    ? `${currentVehPerHour.toLocaleString()} veh/h`
                    : 'OFF'}
                </span>
              </div>
              <input
                id="slider-vehicle-density"
                type="range"
                min="0"
                max="20000"
                step="250"
                value={autoSpawnSettings.enabled ? currentVehPerHour : 0}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onUpdateAutoSpawn({
                    enabled: val > 0,
                    rate_per_minute: Math.round((val / 60) * 10) / 10,
                    rate_per_hour: val,
                  });
                }}
                style={{ width: '150px', height: '5px', accentColor: '#38bdf8', cursor: 'pointer' }}
                title="Adjust traffic inflow rate (up to 20,000 vehicles per hour)"
              />
            </div>

            {/* Quick Presets up to 20,000/h */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {[
                { label: '2k', val: 2000 },
                { label: '6k', val: 6000 },
                { label: '12k', val: 12000 },
                { label: '20k', val: 20000 },
              ].map((p) => (
                <button
                  key={p.val}
                  type="button"
                  onClick={() =>
                    onUpdateAutoSpawn({
                      enabled: true,
                      rate_per_minute: Math.round((p.val / 60) * 10) / 10,
                      rate_per_hour: p.val,
                    })
                  }
                  style={{
                    fontSize: '0.65rem',
                    padding: '2px 5px',
                    borderRadius: '4px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor:
                      autoSpawnSettings.enabled && Math.abs(currentVehPerHour - p.val) < 200
                        ? 'rgba(56, 189, 248, 0.25)'
                        : 'rgba(255, 255, 255, 0.05)',
                    color:
                      autoSpawnSettings.enabled && Math.abs(currentVehPerHour - p.val) < 200
                        ? '#38bdf8'
                        : '#94a3b8',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                  title={`Set density to ${p.val.toLocaleString()} veh/h`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3. DEFAULT VISUAL TELEMETRY: AVERAGE SPEED & VEHICLES PER HOUR (PCE) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          {/* Metric 1: Average Speed */}
          <div
            id="metric-avg-speed"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 14px',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              borderRadius: '8px',
              border: '1px solid rgba(16, 185, 129, 0.25)',
            }}
          >
            <Gauge size={20} color="#10b981" />
            <div>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                Average Speed
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)', lineHeight: 1.1 }}>
                {stats.avg_speed_kmh}{' '}
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8' }}>km/h</span>
              </div>
            </div>
          </div>

          {/* Metric 2: Vehicles Per Hour (Passenger Car Equivalent - PCE) */}
          <div
            id="metric-pce-flow"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 14px',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              borderRadius: '8px',
              border: '1px solid rgba(56, 189, 248, 0.25)',
            }}
            title="Flow Rate in Passenger Car Equivalent per hour based on Indian IRC standards (Car: 1.0, Sports: 1.0, Van: 1.4, Truck: 3.0)"
          >
            <Activity size={20} color="#38bdf8" />
            <div>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                Vehicles / Hour (PCE)
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)', lineHeight: 1.1 }}>
                {Math.round(stats.pce_per_hour ?? 0).toLocaleString()}{' '}
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8' }}>PCE/h</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. EXPANDABLE SECTION TOGGLE BUTTON */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            id="btn-toggle-expandable-panel"
            className="btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              fontSize: '0.78rem',
              fontWeight: 700,
              backgroundColor: isExpanded ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              borderColor: isExpanded ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)',
              color: isExpanded ? '#38bdf8' : '#f8fafc',
            }}
            onClick={() => setIsExpanded((prev) => !prev)}
            title="Toggle advanced spawner, signal timings, and detailed analytics"
          >
            <span>{isExpanded ? '▲ Hide Advanced Tools' : 'Advanced Tools & Settings ▾'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Controls;
