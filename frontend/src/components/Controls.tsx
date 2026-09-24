import React, { useState } from 'react';
import { Play, Pause, RotateCcw, StepForward, Sparkles, Sliders, Car } from 'lucide-react';
import type { SpawnOptions, AutoSpawnSettings } from '../types/simulation';

interface ControlsProps {
  isRunning: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onStep: () => void;
  onSpawnVehicle: (options: SpawnOptions) => void;
  autoSpawnSettings: AutoSpawnSettings;
  onUpdateAutoSpawn: (settings: AutoSpawnSettings) => void;
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
}) => {
  const [selectedLane, setSelectedLane] = useState<number | null>(null); // null = random
  const [vehicleType, setVehicleType] = useState<'car' | 'sports' | 'truck' | 'van'>('car');
  const [vehicleColor, setVehicleColor] = useState<string>('#38bdf8');
  const [initialSpeed, setInitialSpeed] = useState<number>(25); // m/s (~90 km/h)
  const [isSpawnMenuOpen, setIsSpawnMenuOpen] = useState<boolean>(false);

  const handleSpawn = () => {
    onSpawnVehicle({
      lane: selectedLane,
      type: vehicleType,
      color: vehicleColor,
      speed: initialSpeed,
    });
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          id="btn-quick-spawn"
          className="btn-primary"
          onClick={handleSpawn}
          title="Spawn Vehicle with current settings"
        >
          <Car size={16} />
          <span>SPAWN VEHICLE</span>
        </button>

        {/* Lane Selector Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '8px' }}>
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
            L0 (Right)
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
            title="Lane 1 (Middle Lane)"
          >
            L1 (Mid)
          </button>
          <button
            className={`btn-secondary ${selectedLane === 2 ? 'active' : ''}`}
            style={{
              padding: '4px 8px',
              fontSize: '0.75rem',
              backgroundColor: selectedLane === 2 ? '#0284c7' : 'transparent',
              borderColor: selectedLane === 2 ? '#38bdf8' : 'transparent',
            }}
            onClick={() => setSelectedLane(2)}
            title="Lane 2 (Left / Fast Lane)"
          >
            L2 (Left)
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

      {/* 3. Traffic Flow Generator (Auto-Spawner) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={16} color={autoSpawnSettings.enabled ? '#38bdf8' : '#64748b'} />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: autoSpawnSettings.enabled ? '#f8fafc' : '#64748b' }}>
            Auto Flow:
          </span>
          <button
            className="btn-secondary"
            style={{
              padding: '4px 10px',
              fontSize: '0.75rem',
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
          >
            {autoSpawnSettings.enabled ? 'ACTIVE' : 'OFF'}
          </button>
        </div>

        {autoSpawnSettings.enabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="range"
              min="5"
              max="60"
              step="5"
              value={autoSpawnSettings.rate_per_minute}
              onChange={(e) =>
                onUpdateAutoSpawn({
                  ...autoSpawnSettings,
                  rate_per_minute: Number(e.target.value),
                })
              }
              style={{ width: '80px', accentColor: '#38bdf8', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
              {autoSpawnSettings.rate_per_minute}/min
            </span>
          </div>
        )}
      </div>

      {/* Expanded Customizer Drawer (when open) */}
      {isSpawnMenuOpen && (
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '12px',
            marginTop: '4px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            gap: '16px',
          }}
        >
          {/* Type selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>TYPE:</span>
            {(['car', 'sports', 'truck', 'van'] as const).map((t) => (
              <button
                key={t}
                className="btn-secondary"
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  textTransform: 'capitalize',
                  backgroundColor: vehicleType === t ? 'rgba(56, 189, 248, 0.2)' : undefined,
                  borderColor: vehicleType === t ? '#38bdf8' : undefined,
                  color: vehicleType === t ? '#38bdf8' : undefined,
                }}
                onClick={() => setVehicleType(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Color palette */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>COLOR:</span>
            {COLOR_OPTIONS.map((c) => (
              <div
                key={c}
                onClick={() => setVehicleColor(c)}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: c,
                  cursor: 'pointer',
                  border: vehicleColor === c ? '2px solid #ffffff' : '1px solid rgba(0,0,0,0.5)',
                  boxShadow: vehicleColor === c ? `0 0 10px ${c}` : 'none',
                  transform: vehicleColor === c ? 'scale(1.2)' : 'scale(1)',
                  transition: 'all 0.15s ease',
                }}
              />
            ))}
          </div>

          {/* Speed slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>SPEED:</span>
            <input
              type="range"
              min="15"
              max="45"
              step="1"
              value={initialSpeed}
              onChange={(e) => setInitialSpeed(Number(e.target.value))}
              style={{ width: '100px', accentColor: '#38bdf8', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#f8fafc', minWidth: '70px' }}>
              {Math.round(initialSpeed * 3.6)} km/h
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
