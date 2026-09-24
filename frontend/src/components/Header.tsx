import React from 'react';
import { Activity, Radio, Cpu, Clock, Zap, Volume2, VolumeX } from 'lucide-react';
import type { SimulationState } from '../types/simulation';

interface HeaderProps {
  state: SimulationState;
  connected: boolean;
  latencyMs: number;
  updateRateHz: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  state,
  connected,
  latencyMs,
  updateRateHz,
  soundEnabled,
  onToggleSound,
}) => {
  return (
    <header
      id="main-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        backgroundColor: 'rgba(11, 15, 25, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        zIndex: 20,
      }}
    >
      {/* Left: Brand & Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px rgba(56, 189, 248, 0.4)',
            }}
          >
            <Activity size={18} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  background: 'linear-gradient(90deg, #ffffff, #94a3b8)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                TRAFFIS
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  letterSpacing: '0.04em',
                }}
              >
                SUMO Microscopic
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
              1000m Straight Highway • 3 Lanes • TraCI 20Hz
            </div>
          </div>
        </div>

        {/* Connection status pill */}
        <div
          id="connection-badge"
          className="glass-pill"
          style={{
            borderColor: connected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)',
            backgroundColor: connected ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)',
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: connected ? '#10b981' : '#f43f5e',
              boxShadow: connected ? '0 0 8px #10b981' : '0 0 8px #f43f5e',
            }}
            className={connected ? 'pulse-indicator' : ''}
          />
          <span style={{ color: connected ? '#34d399' : '#fb7185', fontWeight: 600 }}>
            {connected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
        </div>
      </div>

      {/* Center: Live Telemetry ticker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div className="glass-pill" title="Simulation Time">
          <Clock size={13} color="#94a3b8" />
          <span style={{ color: '#94a3b8' }}>SIM T:</span>
          <span style={{ color: '#f8fafc', fontWeight: 600 }}>
            {state.sim_time.toFixed(2)}s
          </span>
        </div>

        <div className="glass-pill" title="Simulation Step (50ms increments)">
          <Cpu size={13} color="#94a3b8" />
          <span style={{ color: '#94a3b8' }}>STEP:</span>
          <span style={{ color: '#f8fafc', fontWeight: 600 }}>
            {state.step}
          </span>
        </div>

        <div className="glass-pill" title="WebSocket Update Frequency">
          <Radio size={13} color="#38bdf8" />
          <span style={{ color: '#94a3b8' }}>RATE:</span>
          <span style={{ color: '#38bdf8', fontWeight: 600 }}>
            {updateRateHz} Hz
          </span>
        </div>

        <div className="glass-pill" title="Packet roundtrip estimate">
          <Zap size={13} color="#10b981" />
          <span style={{ color: '#94a3b8' }}>PING:</span>
          <span style={{ color: '#10b981', fontWeight: 600 }}>
            {latencyMs}ms
          </span>
        </div>
      </div>

      {/* Right: Sound toggle & Links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          id="btn-sound-toggle"
          className="btn-icon"
          onClick={onToggleSound}
          title={soundEnabled ? 'Mute engine audio' : 'Enable engine audio'}
        >
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>

        <a
          href="/api/health"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary"
          style={{ textDecoration: 'none', padding: '6px 12px', fontSize: '0.78rem' }}
        >
          API Status
        </a>
      </div>
    </header>
  );
};
