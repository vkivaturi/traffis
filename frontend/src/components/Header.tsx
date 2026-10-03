import React from 'react';
import {
  Activity,
  Radio,
  Clock,
  Volume2,
  VolumeX,
  GitFork,
  Milestone,
  ChevronDown,
  ArrowDownUp,
  Home,
  Info,
  LogOut,
  AlertCircle,
} from 'lucide-react';
import type { SimulationState, ScenarioMetadata } from '../types/simulation';
import type { User } from '../types/auth';

interface HeaderProps {
  state: SimulationState;
  connected: boolean;
  updateRateHz: number;
  dataExchangedMB?: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  scenarios: ScenarioMetadata[];
  activeScenarioId: string;
  onSelectScenario: (scenarioId: string) => void;
  user?: User | null;
  onNavigateHome?: () => void;
  onOpenAbout?: () => void;
  onSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  state,
  connected,
  updateRateHz,
  dataExchangedMB = 0,
  soundEnabled,
  onToggleSound,
  scenarios,
  activeScenarioId,
  onSelectScenario,
  user,
  onNavigateHome,
  onOpenAbout,
  onSignOut,
}) => {
  const currentScenario = scenarios.find((s) => s.id === activeScenarioId) || scenarios[0];
  const isIntersection = currentScenario?.type === 'intersection' || activeScenarioId.includes('intersection');

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
      {/* Left: Brand, Home, Road Selection Dropdown & Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Home / Landing Page button */}
        {onNavigateHome && (
          <button
            onClick={onNavigateHome}
            className="btn-secondary"
            style={{
              padding: '6px 12px',
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Return to Main Landing Page"
          >
            <Home size={14} color="#38bdf8" />
            <span>Landing</span>
          </button>
        )}

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
            <Activity size={17} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '1.0rem',
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
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  color: '#f59e0b',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                }}
              >
                🇮🇳 LHT
              </span>
            </div>
          </div>
        </div>

        {/* Road Selection Dropdown */}
        <div
          id="road-selection-container"
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '8px',
            padding: '4px 10px',
            gap: '8px',
            boxShadow: '0 0 10px rgba(56, 189, 248, 0.15)',
          }}
          title="Select Road Network Simulation"
        >
          {isIntersection ? (
            <GitFork size={15} color="#38bdf8" />
          ) : (
            <Milestone size={15} color="#38bdf8" />
          )}

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: '0.6rem',
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                lineHeight: 1,
              }}
            >
              Road Simulation
            </span>
            <select
              id="road-scenario-select"
              value={activeScenarioId}
              onChange={(e) => onSelectScenario(e.target.value)}
              style={{
                background: 'transparent',
                color: '#f8fafc',
                border: 'none',
                outline: 'none',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                paddingRight: '14px',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                appearance: 'none',
              }}
            >
              {scenarios.length > 0 ? (
                scenarios.map((s) => (
                  <option
                    key={s.id}
                    value={s.id}
                    style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}
                  >
                    {s.name}
                  </option>
                ))
              ) : (
                <>
                  <option value="straight_road" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>
                    Straight Road (Highway)
                  </option>
                  <option value="three_way_intersection" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>
                    3-Way Intersection
                  </option>
                  <option value="four_way_intersection" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>
                    4-Way Crossroads
                  </option>
                </>
              )}
            </select>
          </div>
          <ChevronDown
            size={13}
            color="#94a3b8"
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          />
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
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: connected ? '#10b981' : '#f43f5e',
              boxShadow: connected ? '0 0 8px #10b981' : '0 0 8px #f43f5e',
            }}
            className={connected ? 'pulse-indicator' : ''}
          />
          <span style={{ color: connected ? '#34d399' : '#fb7185', fontWeight: 600, fontSize: '0.72rem' }}>
            {connected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
        </div>
      </div>

      {/* Center: Live Telemetry ticker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {(() => {
          const maxSec = state.max_sim_time ?? 300;
          const isLimitReached = !!state.time_limit_reached || state.sim_time >= maxSec;
          const isWarning = state.sim_time >= maxSec - 30 && !isLimitReached;
          const formatTime = (secs: number) => {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            return `${m}:${s.toString().padStart(2, '0')}`;
          };

          return (
            <div
              className="glass-pill"
              title={`Simulation Time: ${state.sim_time.toFixed(1)}s / ${maxSec}s (Hard Limit: 5 Minutes)`}
              style={{
                borderColor: isLimitReached ? 'rgba(244, 63, 94, 0.6)' : isWarning ? 'rgba(245, 158, 11, 0.6)' : undefined,
                backgroundColor: isLimitReached ? 'rgba(244, 63, 94, 0.15)' : isWarning ? 'rgba(245, 158, 11, 0.12)' : undefined,
              }}
            >
              {isLimitReached ? (
                <AlertCircle size={12} color="#f43f5e" />
              ) : (
                <Clock size={12} color={isWarning ? '#f59e0b' : '#94a3b8'} />
              )}
              <span style={{ color: isLimitReached ? '#fb7185' : isWarning ? '#fbbf24' : '#94a3b8', fontWeight: 600 }}>
                {isLimitReached ? '5M LIMIT:' : 'SIM T:'}
              </span>
              <span style={{ color: isLimitReached ? '#f43f5e' : isWarning ? '#f59e0b' : '#f8fafc', fontWeight: 700 }}>
                {formatTime(state.sim_time)} / 5:00
              </span>
              <span style={{ color: '#64748b', fontSize: '0.68rem', marginLeft: '-2px' }}>
                ({state.sim_time.toFixed(1)}s)
              </span>
            </div>
          );
        })()}

        <div className="glass-pill" title="WebSocket Update Frequency">
          <Radio size={12} color="#38bdf8" />
          <span style={{ color: '#94a3b8' }}>RATE:</span>
          <span style={{ color: '#38bdf8', fontWeight: 600 }}>
            {updateRateHz} Hz
          </span>
        </div>

        <div className="glass-pill" title="Cumulative data exchanged between browser and service">
          <ArrowDownUp size={12} color="#a855f7" />
          <span style={{ color: '#94a3b8' }}>DATA:</span>
          <span style={{ color: '#c084fc', fontWeight: 600 }}>
            {dataExchangedMB.toFixed(2)} MB
          </span>
        </div>
      </div>

      {/* Right: Sound toggle, About & User Profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Sound toggle */}
        <button
          id="btn-sound-toggle"
          className="btn-icon"
          onClick={onToggleSound}
          title={soundEnabled ? 'Mute engine audio' : 'Enable engine audio'}
          style={{ width: '32px', height: '32px' }}
        >
          {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>

        {/* About Modal button */}
        {onOpenAbout && (
          <button
            onClick={onOpenAbout}
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}
            title="About Traffis & Contact Details"
          >
            <Info size={14} color="#38bdf8" />
            <span>About</span>
          </button>
        )}

        {/* Signed-in User badge */}
        {user && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(30, 41, 59, 0.7)',
              padding: '3px 8px 3px 4px',
              borderRadius: '24px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
            }}
          >
            <img
              src={user.avatar}
              alt={user.name}
              style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
            />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f8fafc', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name.split(' ')[0]}
            </span>
            {onSignOut && (
              <button
                onClick={onSignOut}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px',
                }}
                title="Sign out"
              >
                <LogOut size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
