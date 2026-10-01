import React, { useState } from 'react';
import { Play, Pause, RotateCcw, StepForward, Sparkles, Sliders, Car, Crosshair } from 'lucide-react';
import type { SpawnOptions, AutoSpawnSettings, TrafficLightData } from '../types/simulation';

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
  isTrafficSignalPanelOpen: boolean;
  onToggleTrafficSignalPanel: () => void;
  onFocusTrafficSignal: () => void;
  activeScenarioId?: string;
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
  isTrafficSignalPanelOpen,
  onToggleTrafficSignalPanel,
  onFocusTrafficSignal,
  activeScenarioId = 'straight_road',
}) => {
  const isIntersection = activeScenarioId === 'three_way_intersection';

  // For straight road
  const [selectedDirection, setSelectedDirection] = useState<'east' | 'west' | 'random'>('east');

  // For 3-way intersection
  const [selectedOrigin, setSelectedOrigin] = useState<'west' | 'east' | 'north' | 'random'>('west');
  const [selectedTurn, setSelectedTurn] = useState<'straight' | 'left' | 'right' | 'random'>('random');

  const [selectedLane, setSelectedLane] = useState<number | null>(null); // null = random, 0 = L0 (Slow), 1 = L1 (Fast)
  const [vehicleType, setVehicleType] = useState<'car' | 'sports' | 'truck' | 'van'>('car');
  const [vehicleColor, setVehicleColor] = useState<string>('#38bdf8');
  const [initialSpeed, setInitialSpeed] = useState<number>(isIntersection ? 15 : 25); // m/s (~55 km/h for intersection, 90 km/h for highway)
  const [isSpawnMenuOpen, setIsSpawnMenuOpen] = useState<boolean>(false);

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

  return (
    <div
      id="simulation-controls-panel"
      className="glass-panel"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        margin: '12px 20px',
        gap: '16px',
        zIndex: 15,
      }}
    >
      {/* 1. Main Transport Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {isRunning ? (
          <button
            id="btn-pause"
            className="btn-primary"
            style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              borderColor: 'rgba(245, 158, 11, 0.4)',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)',
            }}
            onClick={onPause}
            title="Pause Simulation [Space]"
          >
            <Pause size={18} />
            <span>PAUSE</span>
          </button>
        ) : (
          <button
            id="btn-play"
            className="btn-primary"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              borderColor: 'rgba(16, 185, 129, 0.4)',
              boxShadow: 'var(--glow-emerald)',
            }}
            onClick={onPlay}
            title="Play Simulation [Space]"
          >
            <Play size={18} />
            <span>PLAY</span>
          </button>
        )}

        <button
          id="btn-step"
          className="btn-secondary"
          onClick={onStep}
          disabled={isRunning}
          style={{ opacity: isRunning ? 0.5 : 1 }}
          title="Single Step (0.05s)"
        >
          <StepForward size={16} />
          <span>Step</span>
        </button>

        <button
          id="btn-reset"
          className="btn-secondary"
          onClick={onReset}
          title="Reset Simulation to t=0 [R]"
        >
          <RotateCcw size={16} />
          <span>Reset</span>
        </button>
      </div>

      {/* 2. Quick Vehicle Spawner Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <button
          id="btn-quick-spawn"
          className="btn-primary"
          onClick={handleSpawn}
          title="Spawn Vehicle with current settings"
        >
          <Car size={16} />
          <span>SPAWN VEHICLE</span>
        </button>

        {/* Direction / Origin Selector Pills */}
        {isIntersection ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'rgba(0,0,0,0.3)',
              padding: '3px',
              borderRadius: '8px',
            }}
          >
            <span style={{ fontSize: '0.72rem', color: '#64748b', padding: '0 6px', fontWeight: 600 }}>
              ARM:
            </span>
            <button
              className={`btn-secondary ${selectedOrigin === 'west' ? 'active' : ''}`}
              style={{
                padding: '4px 8px',
                fontSize: '0.75rem',
                backgroundColor: selectedOrigin === 'west' ? '#0284c7' : 'transparent',
                borderColor: selectedOrigin === 'west' ? '#38bdf8' : 'transparent',
              }}
              onClick={() => setSelectedOrigin('west')}
              title="West Arm: approaches heading East (→)"
            >
              West →
            </button>
            <button
              className={`btn-secondary ${selectedOrigin === 'east' ? 'active' : ''}`}
              style={{
                padding: '4px 8px',
                fontSize: '0.75rem',
                backgroundColor: selectedOrigin === 'east' ? '#0284c7' : 'transparent',
                borderColor: selectedOrigin === 'east' ? '#38bdf8' : 'transparent',
              }}
              onClick={() => setSelectedOrigin('east')}
              title="East Arm: approaches heading West (←)"
            >
              ← East
            </button>
            <button
              className={`btn-secondary ${selectedOrigin === 'north' ? 'active' : ''}`}
              style={{
                padding: '4px 8px',
                fontSize: '0.75rem',
                backgroundColor: selectedOrigin === 'north' ? '#0284c7' : 'transparent',
                borderColor: selectedOrigin === 'north' ? '#38bdf8' : 'transparent',
              }}
              onClick={() => setSelectedOrigin('north')}
              title="North Arm: approaches heading South (↓)"
            >
              ↓ North
            </button>
            <button
              className={`btn-secondary ${selectedOrigin === 'random' ? 'active' : ''}`}
              style={{
                padding: '4px 8px',
                fontSize: '0.75rem',
                backgroundColor: selectedOrigin === 'random' ? '#0284c7' : 'transparent',
                borderColor: selectedOrigin === 'random' ? '#38bdf8' : 'transparent',
              }}
              onClick={() => setSelectedOrigin('random')}
              title="Random Approach Arm"
            >
              ⇄ Any
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'rgba(0,0,0,0.3)',
              padding: '3px',
              borderRadius: '8px',
            }}
          >
            <span style={{ fontSize: '0.72rem', color: '#64748b', padding: '0 6px', fontWeight: 600 }}>
              DIR:
            </span>
            <button
              className={`btn-secondary ${selectedDirection === 'east' ? 'active' : ''}`}
              style={{
                padding: '4px 8px',
                fontSize: '0.75rem',
                backgroundColor: selectedDirection === 'east' ? '#0284c7' : 'transparent',
                borderColor: selectedDirection === 'east' ? '#38bdf8' : 'transparent',
              }}
              onClick={() => setSelectedDirection('east')}
              title="Eastbound: Travels from 0m to 1000m (Right →)"
            >
              East →
            </button>
            <button
              className={`btn-secondary ${selectedDirection === 'west' ? 'active' : ''}`}
              style={{
                padding: '4px 8px',
                fontSize: '0.75rem',
                backgroundColor: selectedDirection === 'west' ? '#0284c7' : 'transparent',
                borderColor: selectedDirection === 'west' ? '#38bdf8' : 'transparent',
              }}
              onClick={() => setSelectedDirection('west')}
              title="Westbound: Travels from 1000m to 0m (Left ←)"
            >
              ← West
            </button>
            <button
              className={`btn-secondary ${selectedDirection === 'random' ? 'active' : ''}`}
              style={{
                padding: '4px 8px',
                fontSize: '0.75rem',
                backgroundColor: selectedDirection === 'random' ? '#0284c7' : 'transparent',
                borderColor: selectedDirection === 'random' ? '#38bdf8' : 'transparent',
              }}
              onClick={() => setSelectedDirection('random')}
              title="Random / Alternating Direction"
            >
              ⇄ Auto
            </button>
          </div>
        )}

        {/* Turn Intent Pills for 3-way intersection */}
        {isIntersection && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'rgba(0,0,0,0.3)',
              padding: '3px',
              borderRadius: '8px',
            }}
          >
            <span style={{ fontSize: '0.72rem', color: '#64748b', padding: '0 6px', fontWeight: 600 }}>
              TURN:
            </span>
            <button
              className={`btn-secondary ${selectedTurn === 'random' ? 'active' : ''}`}
              style={{
                padding: '4px 8px',
                fontSize: '0.75rem',
                backgroundColor: selectedTurn === 'random' ? '#0284c7' : 'transparent',
                borderColor: selectedTurn === 'random' ? '#38bdf8' : 'transparent',
              }}
              onClick={() => setSelectedTurn('random')}
            >
              Auto
            </button>
            <button
              className={`btn-secondary ${selectedTurn === 'straight' ? 'active' : ''}`}
              style={{
                padding: '4px 8px',
                fontSize: '0.75rem',
                backgroundColor: selectedTurn === 'straight' ? '#0284c7' : 'transparent',
                borderColor: selectedTurn === 'straight' ? '#38bdf8' : 'transparent',
              }}
              onClick={() => setSelectedTurn('straight')}
              title="Straight ahead (for West and East approaches)"
            >
              Straight
            </button>
            <button
              className={`btn-secondary ${selectedTurn === 'left' ? 'active' : ''}`}
              style={{
                padding: '4px 8px',
                fontSize: '0.75rem',
                backgroundColor: selectedTurn === 'left' ? '#0284c7' : 'transparent',
                borderColor: selectedTurn === 'left' ? '#38bdf8' : 'transparent',
              }}
              onClick={() => setSelectedTurn('left')}
              title="Turn Left"
            >
              Turn ↰
            </button>
            <button
              className={`btn-secondary ${selectedTurn === 'right' ? 'active' : ''}`}
              style={{
                padding: '4px 8px',
                fontSize: '0.75rem',
                backgroundColor: selectedTurn === 'right' ? '#0284c7' : 'transparent',
                borderColor: selectedTurn === 'right' ? '#38bdf8' : 'transparent',
              }}
              onClick={() => setSelectedTurn('right')}
              title="Turn Right"
            >
              Turn ↱
            </button>
          </div>
        )}

        {/* Lane Selector Pills */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: 'rgba(0,0,0,0.3)',
            padding: '3px',
            borderRadius: '8px',
          }}
        >
          <span style={{ fontSize: '0.72rem', color: '#64748b', padding: '0 6px', fontWeight: 600 }}>
            LANE:
          </span>
          <button
            className={`btn-secondary ${selectedLane === null ? 'active' : ''}`}
            style={{
              padding: '4px 8px',
              fontSize: '0.75rem',
              backgroundColor: selectedLane === null ? '#0284c7' : 'transparent',
              borderColor: selectedLane === null ? '#38bdf8' : 'transparent',
            }}
            onClick={() => setSelectedLane(null)}
          >
            Auto
          </button>
          <button
            className={`btn-secondary ${selectedLane === 0 ? 'active' : ''}`}
            style={{
              padding: '4px 8px',
              fontSize: '0.75rem',
              backgroundColor: selectedLane === 0 ? '#0284c7' : 'transparent',
              borderColor: selectedLane === 0 ? '#38bdf8' : 'transparent',
            }}
            onClick={() => setSelectedLane(0)}
            title="Lane 0 (Right / Slow Lane)"
          >
            L0 (Slow)
          </button>
          <button
            className={`btn-secondary ${selectedLane === 1 ? 'active' : ''}`}
            style={{
              padding: '4px 8px',
              fontSize: '0.75rem',
              backgroundColor: selectedLane === 1 ? '#0284c7' : 'transparent',
              borderColor: selectedLane === 1 ? '#38bdf8' : 'transparent',
            }}
            onClick={() => setSelectedLane(1)}
            title="Lane 1 (Left / Fast Lane)"
          >
            L1 (Fast)
          </button>
        </div>

        {/* Toggle detailed spawner options */}
        <button
          className={`btn-icon ${isSpawnMenuOpen ? 'active' : ''}`}
          onClick={() => setIsSpawnMenuOpen((v) => !v)}
          title="Vehicle Customizer (Type, Color, Speed)"
        >
          <Sliders size={16} />
        </button>
      </div>

      {/* 3. Vehicle Inflow Rate Controller */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={15} color={autoSpawnSettings.enabled ? '#38bdf8' : '#64748b'} />
          <span
            style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              color: autoSpawnSettings.enabled ? '#f8fafc' : '#64748b',
            }}
          >
            INFLOW:
          </span>
          <button
            className="btn-secondary"
            style={{
              padding: '3px 8px',
              fontSize: '0.72rem',
              fontWeight: 700,
              backgroundColor: autoSpawnSettings.enabled ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.4)',
              borderColor: autoSpawnSettings.enabled ? '#38bdf8' : 'rgba(255,255,255,0.1)',
              color: autoSpawnSettings.enabled ? '#38bdf8' : '#94a3b8',
            }}
            onClick={() =>
              onUpdateAutoSpawn({
                ...autoSpawnSettings,
                enabled: !autoSpawnSettings.enabled,
              })
            }
            title="Toggle Vehicle Auto-Inflow"
          >
            {autoSpawnSettings.enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {autoSpawnSettings.enabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="range"
              min="5"
              max="120"
              step="5"
              value={autoSpawnSettings.rate_per_minute}
              onChange={(e) =>
                onUpdateAutoSpawn({
                  ...autoSpawnSettings,
                  rate_per_minute: Number(e.target.value),
                })
              }
              style={{ width: '90px', accentColor: '#38bdf8', cursor: 'pointer' }}
              title={`Inflow Rate: ${autoSpawnSettings.rate_per_minute} vehicles per minute`}
            />

            <span
              style={{
                fontSize: '0.78rem',
                fontFamily: 'var(--font-mono)',
                color: '#38bdf8',
                fontWeight: 800,
                minWidth: '55px',
              }}
            >
              {autoSpawnSettings.rate_per_minute}/m
            </span>

            {/* Quick Inflow Presets */}
            <div style={{ display: 'flex', gap: '3px' }}>
              {[15, 30, 60, 90].map((preset) => (
                <button
                  key={preset}
                  className="btn-secondary"
                  style={{
                    padding: '2px 5px',
                    fontSize: '0.68rem',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: autoSpawnSettings.rate_per_minute === preset ? '#0284c7' : 'transparent',
                    borderColor: autoSpawnSettings.rate_per_minute === preset ? '#38bdf8' : 'rgba(255,255,255,0.1)',
                    color: autoSpawnSettings.rate_per_minute === preset ? '#ffffff' : '#94a3b8',
                  }}
                  onClick={() =>
                    onUpdateAutoSpawn({
                      ...autoSpawnSettings,
                      rate_per_minute: preset,
                    })
                  }
                  title={`Set to ${preset} vehicles/min`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
              (1/{(60 / autoSpawnSettings.rate_per_minute).toFixed(1)}s)
            </span>
          </div>
        )}
      </div>

      {/* 4. Traffic Signal Quick Status & Timings Drawer Trigger */}
      {trafficLight && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            className={`btn-secondary ${isTrafficSignalPanelOpen ? 'active' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '0.78rem',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              borderColor:
                trafficLight.state === 'green'
                  ? 'rgba(16, 185, 129, 0.5)'
                  : trafficLight.state === 'yellow'
                  ? 'rgba(245, 158, 11, 0.5)'
                  : 'rgba(239, 68, 68, 0.5)',
              backgroundColor:
                trafficLight.state === 'green'
                  ? 'rgba(16, 185, 129, 0.1)'
                  : trafficLight.state === 'yellow'
                  ? 'rgba(245, 158, 11, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
            }}
            onClick={onToggleTrafficSignalPanel}
            title="Toggle Traffic Signal Control Panel"
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor:
                  trafficLight.state === 'green'
                    ? '#10b981'
                    : trafficLight.state === 'yellow'
                    ? '#f59e0b'
                    : '#ef4444',
                boxShadow:
                  trafficLight.state === 'green'
                    ? '0 0 8px #10b981'
                    : trafficLight.state === 'yellow'
                    ? '0 0 8px #f59e0b'
                    : '0 0 8px #ef4444',
              }}
            />
            <span
              style={{
                color:
                  trafficLight.state === 'green'
                    ? '#34d399'
                    : trafficLight.state === 'yellow'
                    ? '#fbbf24'
                    : '#f87171',
              }}
            >
              SIGNAL: {trafficLight.state.toUpperCase()}
            </span>
            <span style={{ color: '#94a3b8' }}>[{trafficLight.phase_remaining.toFixed(0)}s]</span>
          </button>

          <button
            className="btn-icon"
            onClick={onFocusTrafficSignal}
            title="Focus Camera on Traffic Signal"
          >
            <Crosshair size={15} />
          </button>
        </div>
      )}

      {/* 5. Dropdown Menu for Detailed Vehicle Customizer */}
      {isSpawnMenuOpen && (
        <div
          className="glass-panel"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            padding: '12px 16px',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            gap: '16px',
            marginTop: '8px',
          }}
        >
          {/* Vehicle Type */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>TYPE:</span>
            {(['car', 'sports', 'truck', 'van'] as const).map((t) => (
              <button
                key={t}
                className={`btn-secondary ${vehicleType === t ? 'active' : ''}`}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  textTransform: 'capitalize',
                  backgroundColor: vehicleType === t ? '#0284c7' : 'transparent',
                  borderColor: vehicleType === t ? '#38bdf8' : 'rgba(255,255,255,0.1)',
                  color: vehicleType === t ? '#ffffff' : '#cbd5e1',
                }}
                onClick={() => setVehicleType(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Color Palette */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>COLOR:</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setVehicleColor(c)}
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: c,
                    border: vehicleColor === c ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.3)',
                    cursor: 'pointer',
                    boxShadow: vehicleColor === c ? `0 0 10px ${c}` : 'none',
                    transform: vehicleColor === c ? 'scale(1.2)' : 'scale(1)',
                    transition: 'all 0.15s ease',
                  }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Initial Speed */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>SPEED:</span>
            <input
              type="range"
              min="10"
              max="45"
              step="1"
              value={initialSpeed}
              onChange={(e) => setInitialSpeed(Number(e.target.value))}
              style={{ width: '100px', accentColor: '#38bdf8', cursor: 'pointer' }}
            />
            <span
              style={{
                fontSize: '0.78rem',
                fontFamily: 'var(--font-mono)',
                color: '#38bdf8',
                fontWeight: 700,
                minWidth: '70px',
              }}
            >
              {(initialSpeed * 3.6).toFixed(0)} km/h
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
