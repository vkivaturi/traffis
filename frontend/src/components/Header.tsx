import React from 'react';
import {
  Activity,
  Volume2,
  VolumeX,
  GitFork,
  Milestone,
  RotateCw,
  ChevronDown,
  Home,
  Info,
  LogOut,
} from 'lucide-react';
import type { SimulationState, ScenarioMetadata, ScenarioGroup } from '../types/simulation';
import type { User } from '../types/auth';

interface HeaderProps {
  state: SimulationState;
  connected: boolean;
  updateRateHz: number;
  dataExchangedMB?: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  scenarios: ScenarioMetadata[];
  scenarioGroups?: ScenarioGroup[];
  activeScenarioId: string;
  onSelectScenario: (scenarioId: string) => void;
  user?: User | null;
  onNavigateHome?: () => void;
  onOpenAbout?: () => void;
  onSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  connected,
  soundEnabled,
  onToggleSound,
  scenarios,
  scenarioGroups,
  activeScenarioId,
  onSelectScenario,
  user,
  onNavigateHome,
  onOpenAbout,
  onSignOut,
}) => {
  const currentScenario = scenarios.find((s) => s.id === activeScenarioId) || scenarios[0];
  const isIntersection = currentScenario?.type === 'intersection' || activeScenarioId.includes('intersection');

  // Group scenarios according to backend scenarioGroups or scenario.group metadata
  const groups = React.useMemo(() => {
    if (scenarioGroups && scenarioGroups.length > 0) {
      return scenarioGroups;
    }
    if (scenarios && scenarios.length > 0) {
      // Group by s.group if present
      const map = new Map<string, { id: string; name: string; scenarios: ScenarioMetadata[] }>();
      for (const s of scenarios) {
        const groupName = s.group || 'Other scenarios';
        const groupId =
          s.group_id ||
          (groupName.toLowerCase().includes('nallagandla')
            ? 'nallagandla_tellapur'
            : 'other_scenarios');
        if (!map.has(groupId)) {
          map.set(groupId, { id: groupId, name: groupName, scenarios: [] });
        }
        map.get(groupId)!.scenarios.push(s);
      }
      return Array.from(map.values());
    }
    return [
      {
        id: 'nallagandla_tellapur',
        name: 'Nallagandla Tellapur Junction',
        scenarios: [
          {
            id: 'gnt_circle',
            name: 'GNT Circle (Roundabout)',
            description: '',
            type: 'roundabout',
            bounds: { min_x: 0, max_x: 0, min_y: 0, max_y: 0 },
            default_camera: { x: 0, y: 0, zoom: 1 },
            spawn_origins: [],
          },
          {
            id: 'nallagandla_junction',
            name: 'Nallagandla Junction',
            description: '',
            type: 'intersection',
            bounds: { min_x: 0, max_x: 0, min_y: 0, max_y: 0 },
            default_camera: { x: 0, y: 0, zoom: 1 },
            spawn_origins: [],
          },
        ],
      },
      {
        id: 'other_scenarios',
        name: 'Other scenarios',
        scenarios: [
          {
            id: 'four_way_intersection',
            name: '4-Way Crossroads',
            description: '',
            type: 'intersection',
            bounds: { min_x: 0, max_x: 0, min_y: 0, max_y: 0 },
            default_camera: { x: 0, y: 0, zoom: 1 },
            spawn_origins: [],
          },
          {
            id: 'three_way_intersection',
            name: '3-Way Intersection',
            description: '',
            type: 'intersection',
            bounds: { min_x: 0, max_x: 0, min_y: 0, max_y: 0 },
            default_camera: { x: 0, y: 0, zoom: 1 },
            spawn_origins: [],
          },
          {
            id: 'straight_road',
            name: 'Straight Road (Highway)',
            description: '',
            type: 'straight',
            bounds: { min_x: 0, max_x: 0, min_y: 0, max_y: 0 },
            default_camera: { x: 0, y: 0, zoom: 1 },
            spawn_origins: [],
          },
        ],
      },
    ];
  }, [scenarioGroups, scenarios]);

  return (
    <header
      id="main-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 24px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        boxShadow: 'var(--shadow-sm)',
        zIndex: 20,
      }}
    >
      {/* Left: Home, Brand & Scenario Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {onNavigateHome && (
          <button
            onClick={onNavigateHome}
            className="btn-secondary"
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Return to Main Landing Page"
          >
            <Home size={14} color="#4a2c11" />
            <span>Home</span>
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '7px',
              backgroundColor: '#4a2c11',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(74, 44, 17, 0.25)',
            }}
          >
            <Activity size={16} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span
                style={{
                  fontSize: '0.98rem',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  color: '#0f172a',
                }}
              >
                TRAFFIS
              </span>
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '9999px',
                  backgroundColor: '#fffbeb',
                  color: '#b45309',
                  border: '1px solid #fde68a',
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
            backgroundColor: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '5px 12px',
            gap: '8px',
          }}
          title="Select Road Network to Simulate"
        >
          {currentScenario?.type === 'roundabout' ? (
            <RotateCw size={15} color="#059669" />
          ) : isIntersection ? (
            <GitFork size={15} color="#2563eb" />
          ) : (
            <Milestone size={15} color="#0284c7" />
          )}

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: '0.58rem',
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                lineHeight: 1,
              }}
            >
              Road Network
            </span>
            <select
              id="road-scenario-select"
              value={activeScenarioId}
              onChange={(e) => onSelectScenario(e.target.value)}
              style={{
                background: 'transparent',
                color: '#0f172a',
                border: 'none',
                outline: 'none',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                paddingRight: '16px',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                appearance: 'none',
              }}
            >
              {groups.map((grp) => (
                <optgroup
                  key={grp.id}
                  label={grp.name}
                  style={{
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    fontWeight: 700,
                    fontSize: '0.74rem',
                  }}
                >
                  {grp.scenarios.map((s) => (
                    <option
                      key={s.id}
                      value={s.id}
                      style={{
                        backgroundColor: '#ffffff',
                        color: '#0f172a',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                      }}
                    >
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <ChevronDown
            size={13}
            color="#64748b"
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Live Engine Status Pill */}
        <div
          id="connection-badge"
          style={{
            borderColor: connected ? '#a7f3d0' : '#fecaca',
            backgroundColor: connected ? '#ecfdf5' : '#fef2f2',
            border: '1px solid',
            borderRadius: '9999px',
            padding: '4px 10px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
          title={connected ? 'Traffic engine connected and ready' : 'Connecting to traffic simulation engine...'}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: connected ? '#10b981' : '#dc2626',
            }}
            className={connected ? 'pulse-indicator' : ''}
          />
          <span style={{ color: connected ? '#059669' : '#dc2626', fontWeight: 700, fontSize: '0.72rem' }}>
            {connected ? 'LIVE ENGINE' : 'RECONNECTING'}
          </span>
        </div>
      </div>

      {/* Right: Audio toggle, About & User Profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Audio Alert Toggle */}
        <button
          id="btn-sound-toggle"
          className="btn-icon"
          onClick={onToggleSound}
          title={soundEnabled ? 'Mute traffic sound effects' : 'Enable traffic sound effects (signals, resets)'}
          style={{ width: '32px', height: '32px' }}
        >
          {soundEnabled ? <Volume2 size={15} color="#4a2c11" /> : <VolumeX size={15} />}
        </button>

        {/* About Modal button */}
        {onOpenAbout && (
          <button
            onClick={onOpenAbout}
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}
            title="About Traffis & Traffic Engineering Specs"
          >
            <Info size={14} color="#64748b" />
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
              backgroundColor: '#f8fafc',
              padding: '3px 8px 3px 4px',
              borderRadius: '20px',
              border: '1px solid #e2e8f0',
            }}
          >
            <img
              src={user.avatar}
              alt={user.name}
              style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
            />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0f172a', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name.split(' ')[0]}
            </span>
            {onSignOut && (
              <button
                onClick={onSignOut}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
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

export default Header;
