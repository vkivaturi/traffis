import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Play,
  RotateCw,
  GitFork,
  CheckCircle2,
  Clock,
  Layers,
  Download,
  AlertCircle,
  BarChart3,
  RefreshCw,
  ChevronRight,
  Check,
  Zap,
} from 'lucide-react';
import type { ScenarioGroup, ScenarioMetadata } from '../types/simulation';
import type { User } from '../types/auth';

export interface ComparisonResult {
  scenario_id: string;
  scenario_name: string;
  scenario_type: string;
  duration: number;
  stats: {
    active_vehicles: number;
    total_spawned: number;
    total_arrived: number;
    avg_speed_kmh: number;
    density_veh_km: number;
    pce_per_hour: number;
    completion_rate: number;
  };
  avg_travel_time_s: number | null;
  avg_delay_s: number | null;
  roundabout_occupancy: number | null;
  uturn_count: number | null;
  teleports: number;
}

interface CompareSimulationsPageProps {
  user: User | null;
  isAuthenticated: boolean;
  onNavigateHome: () => void;
  onLaunchSimulator: (scenarioId?: string) => void;
  onSignInWithGoogle?: (user?: Partial<User>) => void;
  onSignOut?: () => void;
  scenarioGroups?: ScenarioGroup[];
  scenarios?: ScenarioMetadata[];
}

export const CompareSimulationsPage: React.FC<CompareSimulationsPageProps> = ({
  user,
  onNavigateHome,
  onLaunchSimulator,
  scenarioGroups = [],
  scenarios = [],
}) => {
  // 1. Group selection
  const [selectedGroupId, setSelectedGroupId] = useState<string>('nallagandla_tellapur');

  // Available groups
  const groups = React.useMemo(() => {
    return scenarioGroups.length > 0 ? scenarioGroups : [
      {
        id: 'nallagandla_tellapur',
        name: 'Nallagandla Tellapur Junction',
        description: 'Suburban arterial junctions connecting Nallagandla, Tellapur, and Lingampalli Flyover.',
        scenarios: scenarios.filter(s => ['gnt_circle', 'gnt_circle_with_traffic_lights', 'nallagandla_junction'].includes(s.id)),
      },
      {
        id: 'other_scenarios',
        name: 'Other scenarios',
        description: 'General road networks and urban intersections.',
        scenarios: scenarios.filter(s => ['straight_road', 'three_way_intersection', 'four_way_intersection'].includes(s.id)),
      },
    ];
  }, [scenarioGroups, scenarios]);

  const groupScenarios = React.useMemo(() => {
    const currentGroup = groups.find(g => g.id === selectedGroupId) || groups[0];
    return currentGroup?.scenarios || [];
  }, [groups, selectedGroupId]);

  // 2. Selected scenario IDs within current group
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>(() => {
    const initGroup = groups.find(g => g.id === 'nallagandla_tellapur') || groups[0];
    return initGroup?.scenarios ? initGroup.scenarios.map(s => s.id) : [];
  });

  // Default selection to all scenarios in the group when group changes
  useEffect(() => {
    if (groupScenarios.length > 0) {
      // oxlint-disable-next-line react/set-state-in-effect
      setSelectedScenarioIds(groupScenarios.map(s => s.id));
    }
  }, [selectedGroupId, groupScenarios]);

  // 3. Execution configuration
  const [durationSeconds, setDurationSeconds] = useState<number>(60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [currentRunningScenarioName, setCurrentRunningScenarioName] = useState<string>('');
  const [completedSteps, setCompletedSteps] = useState<Record<string, 'pending' | 'running' | 'completed' | 'error'>>({});

  // 4. Comparison Results
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Toggle scenario selection
  const handleToggleScenario = (scenarioId: string) => {
    setSelectedScenarioIds(prev => {
      if (prev.includes(scenarioId)) {
        return prev.filter(id => id !== scenarioId);
      } else {
        return [...prev, scenarioId];
      }
    });
  };

  const handleSelectAll = () => {
    setSelectedScenarioIds(groupScenarios.map(s => s.id));
  };

  const handleClearSelection = () => {
    setSelectedScenarioIds([]);
  };

  // Run comparison sequence
  const handleRunComparison = async () => {
    if (selectedScenarioIds.length < 2) return;

    setIsRunning(true);
    setErrorMessage(null);
    setProgressPercent(0);
    setResults([]);

    // Initialize step statuses
    const initialSteps: Record<string, 'pending' | 'running' | 'completed' | 'error'> = {};
    selectedScenarioIds.forEach(id => {
      initialSteps[id] = 'pending';
    });
    setCompletedSteps(initialSteps);

    const capturedResults: ComparisonResult[] = [];
    const totalCount = selectedScenarioIds.length;

    for (let i = 0; i < totalCount; i++) {
      const scenarioId = selectedScenarioIds[i];
      const targetScenario = groupScenarios.find(s => s.id === scenarioId);
      const scenarioName = targetScenario?.name || scenarioId;

      setCurrentRunningScenarioName(scenarioName);
      setCompletedSteps(prev => ({ ...prev, [scenarioId]: 'running' }));

      try {
        const token = user?.token || localStorage.getItem('traffis_auth_token') || '';
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch('/api/simulation/compare-run', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            scenario_id: scenarioId,
            duration: durationSeconds,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || `Server returned error ${response.status}`);
        }

        const data = await response.json();
        if (data.status === 'ok' && data.result) {
          capturedResults.push(data.result);
          setCompletedSteps(prev => ({ ...prev, [scenarioId]: 'completed' }));
        } else {
          throw new Error('Simulation result missing from response');
        }
      } catch (err: any) {
        console.error(`Failed to benchmark scenario ${scenarioId}:`, err);
        setCompletedSteps(prev => ({ ...prev, [scenarioId]: 'error' }));
        setErrorMessage(`Simulation failed on "${scenarioName}": ${err.message || 'Unknown error'}`);
        setIsRunning(false);
        return;
      }

      // Update progress bar
      const newProgress = Math.round(((i + 1) / totalCount) * 100);
      setProgressPercent(newProgress);
    }

    setResults(capturedResults);
    setIsRunning(false);
    setCurrentRunningScenarioName('');
  };

  // Export results as CSV
  const handleExportCSV = () => {
    if (results.length === 0) return;

    const headers = [
      'Scenario ID',
      'Scenario Name',
      'Type',
      'Duration (s)',
      'Avg Speed (km/h)',
      'Throughput (PCE/h)',
      'Traffic Density (veh/km)',
      'Total Departed',
      'Total Arrived',
      'Completion Rate (%)',
      'Avg Travel Time (s)',
      'Avg Delay (s)',
      'Ring Occupancy',
      'U-Turn Throughput',
      'Teleports / Conflicts',
    ];

    const rows = results.map(r => [
      `"${r.scenario_id}"`,
      `"${r.scenario_name}"`,
      `"${r.scenario_type}"`,
      r.duration,
      r.stats.avg_speed_kmh,
      r.stats.pce_per_hour,
      r.stats.density_veh_km,
      r.stats.total_spawned,
      r.stats.total_arrived,
      r.stats.completion_rate,
      r.avg_travel_time_s ?? 'N/A',
      r.avg_delay_s ?? 'N/A',
      r.roundabout_occupancy ?? 'N/A',
      r.uturn_count ?? 'N/A',
      r.teleports,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `traffis_comparison_${selectedGroupId}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Find best values for highlights
  const bestSpeed = results.length > 0 ? Math.max(...results.map(r => r.stats.avg_speed_kmh)) : null;
  const bestPce = results.length > 0 ? Math.max(...results.map(r => r.stats.pce_per_hour)) : null;
  const bestArrivals = results.length > 0 ? Math.max(...results.map(r => r.stats.total_arrived)) : null;
  const bestDelay = results.length > 0
    ? Math.min(...results.filter(r => r.avg_delay_s !== null && r.avg_delay_s !== undefined).map(r => r.avg_delay_s!))
    : null;

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        overflowX: 'hidden',
        overflowY: 'auto',
        backgroundColor: '#ffffff',
        color: '#0f172a',
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 1. TOP NAVBAR */}
      <nav
        style={{
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#ffffff',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: '1240px',
            margin: '0 auto',
            padding: '16px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Brand & Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              onClick={onNavigateHome}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: '0.86rem',
                fontWeight: 600,
                padding: '6px 10px',
                borderRadius: '6px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f1f5f9';
                e.currentTarget.style.color = '#0f172a';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#64748b';
              }}
            >
              <ArrowLeft size={16} />
              <span>Home</span>
            </button>

            <span style={{ color: '#cbd5e1' }}>/</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  backgroundColor: '#f7f1ea',
                  border: '1px solid #4a2c11',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#4a2c11',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                }}
              >
                T
              </div>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                Compare Simulations
              </span>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  backgroundColor: '#ecfdf5',
                  color: '#059669',
                  border: '1px solid #a7f3d0',
                }}
              >
                ANALYTICS
              </span>
            </div>
          </div>

          {/* Right Action: Launch live simulator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => onLaunchSimulator()}
              className="btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: '8px',
              }}
            >
              <Play size={14} fill="#0f172a" />
              <span>Open Live Simulator</span>
            </button>
          </div>
        </div>
      </nav>

      {/* 2. HERO / EXPLANATION HEADER */}
      <header
        style={{
          padding: '40px 28px 32px',
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
            <div>
              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: '#4a2c11',
                  letterSpacing: '0.06em',
                }}
              >
                Automated Benchmarking Suite
              </span>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', marginTop: '6px', marginBottom: '8px' }}>
                Side-by-Side Traffic Performance Comparison
              </h1>
              <p style={{ color: '#475569', fontSize: '0.94rem', maxWidth: '780px', lineHeight: 1.55 }}>
                Select two or more scenarios from a corridor group. Traffis executes each simulation in sequence
                under identical calibrated demand, measures kinematics at 20 Hz, and compiles the comparative results into a structured table.
              </p>
            </div>

            {/* Quick Summary Pill */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 16px',
                borderRadius: '10px',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <Zap size={18} color="#d97706" />
              <div style={{ fontSize: '0.78rem' }}>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>Headless SUMO Accelerated</div>
                <div style={{ color: '#64748b' }}>60s run completes in ~400ms</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 3. MAIN INTERACTION AREA */}
      <main style={{ maxWidth: '1240px', margin: '0 auto', padding: '36px 28px 80px', width: '100%', flex: 1 }}>
        {/* Step 1: Scenario Group Selector */}
        <section style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
                STEP 1: SELECT CORRIDOR GROUP
              </div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                Choose Scenario Group
              </h2>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            {groups.map((grp) => {
              const isSelected = grp.id === selectedGroupId;
              return (
                <div
                  key={grp.id}
                  onClick={() => {
                    if (!isRunning) {
                      setSelectedGroupId(grp.id);
                      setResults([]);
                    }
                  }}
                  className="glass-panel"
                  style={{
                    padding: '18px 20px',
                    borderRadius: '10px',
                    cursor: isRunning ? 'not-allowed' : 'pointer',
                    backgroundColor: isSelected ? '#faf5ef' : '#ffffff',
                    border: isSelected ? '2px solid #4a2c11' : '1px solid #e2e8f0',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Layers size={18} color={isSelected ? '#4a2c11' : '#64748b'} />
                      <span style={{ fontWeight: 800, fontSize: '0.98rem', color: isSelected ? '#4a2c11' : '#0f172a' }}>
                        {grp.name}
                      </span>
                    </div>
                    {isSelected && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          fontSize: '0.64rem',
                          fontWeight: 700,
                          backgroundColor: '#4a2c11',
                          color: '#ffffff',
                        }}
                      >
                        SELECTED
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                    {grp.description || 'Compare operational performance across network variations.'}
                  </p>
                  <div style={{ marginTop: '10px', fontSize: '0.74rem', fontWeight: 600, color: '#475569' }}>
                    {grp.scenarios.length} scenarios available in this group
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Step 2: Scenario Selection Cards */}
        <section style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
                STEP 2: SELECT 2 OR MORE SCENARIOS TO COMPARE
              </div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                Corridor Scenarios ({selectedScenarioIds.length} of {groupScenarios.length} selected)
              </h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                disabled={isRunning}
                onClick={handleSelectAll}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#334155',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                }}
              >
                Select All
              </button>
              <button
                type="button"
                disabled={isRunning}
                onClick={handleClearSelection}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#334155',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {selectedScenarioIds.length < 2 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                color: '#b45309',
                fontSize: '0.8rem',
                fontWeight: 600,
                marginBottom: '16px',
              }}
            >
              <AlertCircle size={16} />
              <span>Please select at least 2 scenarios to trigger a side-by-side comparison.</span>
            </div>
          )}

          {/* Scenario Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            {groupScenarios.map((sc) => {
              const isChecked = selectedScenarioIds.includes(sc.id);
              const stepStatus = completedSteps[sc.id];

              return (
                <div
                  key={sc.id}
                  onClick={() => !isRunning && handleToggleScenario(sc.id)}
                  className="glass-panel"
                  style={{
                    padding: '20px',
                    borderRadius: '10px',
                    cursor: isRunning ? 'not-allowed' : 'pointer',
                    backgroundColor: isChecked ? '#ffffff' : '#f8fafc',
                    border: isChecked ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    transition: 'all 0.15s ease',
                    boxShadow: isChecked ? 'var(--shadow-sm)' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          backgroundColor: sc.type === 'roundabout' ? '#ecfdf5' : '#eff6ff',
                          color: sc.type === 'roundabout' ? '#059669' : '#2563eb',
                          border: `1px solid ${sc.type === 'roundabout' ? '#a7f3d0' : '#bfdbfe'}`,
                        }}
                      >
                        {sc.type === 'roundabout' ? <RotateCw size={12} /> : <GitFork size={12} />}
                        <span>{sc.type.toUpperCase()}</span>
                      </div>

                      {/* Custom Checkbox */}
                      <div
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '6px',
                          backgroundColor: isChecked ? '#2563eb' : '#ffffff',
                          border: isChecked ? '2px solid #2563eb' : '2px solid #cbd5e1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {isChecked && <Check size={14} color="#ffffff" strokeWidth={3} />}
                      </div>
                    </div>

                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
                      {sc.name}
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.5, margin: 0 }}>
                      {sc.description}
                    </p>
                  </div>

                  {/* Step status badge if executing */}
                  {isRunning && stepStatus && (
                    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                      {stepStatus === 'running' && (
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <RefreshCw size={12} className="spin-slow" />
                          Simulating now...
                        </span>
                      )}
                      {stepStatus === 'completed' && (
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle2 size={12} />
                          Completed
                        </span>
                      )}
                      {stepStatus === 'pending' && (
                        <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                          Queued...
                        </span>
                      )}
                      {stepStatus === 'error' && (
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#dc2626' }}>
                          Failed
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Step 3: Simulation Parameters & Trigger Dock */}
        <section
          style={{
            padding: '24px',
            borderRadius: '12px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            marginBottom: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '20px',
          }}
        >
          {/* Duration Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} color="#4a2c11" />
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                  SIMULATION DURATION
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0f172a' }}>
                  Execution Window
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {[
                { label: '30s (Quick)', value: 30 },
                { label: '60s (Recommended)', value: 60 },
                { label: '120s (Extended)', value: 120 },
                { label: '300s (Full 5-Min)', value: 300 },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isRunning}
                  onClick={() => setDurationSeconds(opt.value)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '6px',
                    fontSize: '0.76rem',
                    fontWeight: durationSeconds === opt.value ? 700 : 500,
                    cursor: isRunning ? 'not-allowed' : 'pointer',
                    backgroundColor: durationSeconds === opt.value ? '#4a2c11' : '#ffffff',
                    color: durationSeconds === opt.value ? '#ffffff' : '#334155',
                    border: durationSeconds === opt.value ? '1px solid #4a2c11' : '1px solid #cbd5e1',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Trigger Button */}
          <div>
            <button
              id="btn-run-comparison"
              type="button"
              disabled={isRunning || selectedScenarioIds.length < 2}
              onClick={handleRunComparison}
              className="btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 28px',
                fontSize: '0.94rem',
                fontWeight: 700,
                borderRadius: '8px',
                cursor: (isRunning || selectedScenarioIds.length < 2) ? 'not-allowed' : 'pointer',
                opacity: (isRunning || selectedScenarioIds.length < 2) ? 0.6 : 1,
                boxShadow: 'var(--shadow-md)',
              }}
            >
              {isRunning ? (
                <>
                  <RefreshCw size={16} className="spin-slow" />
                  <span>Executing Scenarios ({progressPercent}%)...</span>
                </>
              ) : (
                <>
                  <Play size={16} fill="#ffffff" />
                  <span>Run Comparison ({selectedScenarioIds.length} Scenarios)</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* 4. EXECUTION PROGRESS BAR */}
        {(isRunning || (progressPercent > 0 && results.length > 0)) && (
          <section
            style={{
              padding: '20px 24px',
              borderRadius: '12px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              boxShadow: 'var(--shadow-sm)',
              marginBottom: '36px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart3 size={18} color="#2563eb" />
                <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>
                  {isRunning ? `Running Batch Execution: ${currentRunningScenarioName}` : 'Execution Completed Successfully'}
                </span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.92rem', color: '#2563eb' }}>
                {progressPercent}%
              </span>
            </div>

            {/* Progress Track */}
            <div
              style={{
                width: '100%',
                height: '10px',
                borderRadius: '5px',
                backgroundColor: '#f1f5f9',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  borderRadius: '5px',
                  backgroundColor: progressPercent === 100 ? '#059669' : '#2563eb',
                  transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  backgroundImage: isRunning
                    ? 'linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)'
                    : 'none',
                  backgroundSize: '20px 20px',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', fontSize: '0.74rem', color: '#64748b' }}>
              <span>
                {results.length} of {selectedScenarioIds.length} scenarios completed
              </span>
              <span>
                {isRunning ? 'Capturing kinematics and junction metrics...' : 'All metrics compiled below'}
              </span>
            </div>
          </section>
        )}

        {/* Error message */}
        {errorMessage && (
          <div
            style={{
              padding: '14px 18px',
              borderRadius: '8px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '0.84rem',
              fontWeight: 600,
              marginBottom: '28px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 5. COMPARISON RESULTS TABLE */}
        {results.length > 0 && (
          <section id="comparison-results-section" style={{ marginTop: '10px' }}>
            {/* Table Header & Export */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#059669', letterSpacing: '0.04em' }}>
                  BENCHMARK RESULTS
                </div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                  Comparative Simulation Performance
                </h2>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Measured over {durationSeconds}.0s simulation window across {results.length} corridor variations.
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="btn-secondary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <Download size={14} />
                  <span>Export CSV</span>
                </button>

                <button
                  type="button"
                  onClick={handleRunComparison}
                  className="btn-secondary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={14} />
                  <span>Rerun</span>
                </button>
              </div>
            </div>

            {/* KPI Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '22px' }}>
              <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                  Highest Throughput (PCE/h)
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803d', marginTop: '4px' }}>
                  {bestPce?.toLocaleString() ?? '-'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#166534', marginTop: '2px' }}>
                  {results.find(r => r.stats.pce_per_hour === bestPce)?.scenario_name}
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase' }}>
                  Highest Average Speed
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1d4ed8', marginTop: '4px' }}>
                  {bestSpeed} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>km/h</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#1e40af', marginTop: '2px' }}>
                  {results.find(r => r.stats.avg_speed_kmh === bestSpeed)?.scenario_name}
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#faf5ef', border: '1px solid #e8ddd0' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#5c3a21', textTransform: 'uppercase' }}>
                  Most Vehicles Completed
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#4a2c11', marginTop: '4px' }}>
                  {bestArrivals} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>vehs</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#5c3a21', marginTop: '2px' }}>
                  {results.find(r => r.stats.total_arrived === bestArrivals)?.scenario_name}
                </div>
              </div>

              {bestDelay !== null && (
                <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#fffbeb', border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase' }}>
                    Lowest Delay per Vehicle
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#b45309', marginTop: '4px' }}>
                    {bestDelay} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>sec</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#92400e', marginTop: '2px' }}>
                    {results.find(r => r.avg_delay_s === bestDelay)?.scenario_name}
                  </div>
                </div>
              )}
            </div>

            {/* Results Table */}
            <div
              style={{
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                overflowX: 'auto',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '0.82rem',
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '14px 18px', fontWeight: 800, color: '#0f172a', minWidth: '220px' }}>
                      Scenario (1st Column)
                    </th>
                    <th style={{ padding: '14px 14px', fontWeight: 700, color: '#334155', minWidth: '130px' }}>
                      Avg Speed
                    </th>
                    <th style={{ padding: '14px 14px', fontWeight: 700, color: '#334155', minWidth: '130px' }}>
                      Throughput
                    </th>
                    <th style={{ padding: '14px 14px', fontWeight: 700, color: '#334155', minWidth: '120px' }}>
                      Density
                    </th>
                    <th style={{ padding: '14px 14px', fontWeight: 700, color: '#334155', minWidth: '110px' }}>
                      Departed
                    </th>
                    <th style={{ padding: '14px 14px', fontWeight: 700, color: '#334155', minWidth: '110px' }}>
                      Arrived
                    </th>
                    <th style={{ padding: '14px 14px', fontWeight: 700, color: '#334155', minWidth: '110px' }}>
                      Completion
                    </th>
                    <th style={{ padding: '14px 14px', fontWeight: 700, color: '#334155', minWidth: '110px' }}>
                      Avg Delay
                    </th>
                    {results.some(r => r.roundabout_occupancy !== null) && (
                      <th style={{ padding: '14px 14px', fontWeight: 700, color: '#334155', minWidth: '120px' }}>
                        Ring Occupancy
                      </th>
                    )}
                    <th style={{ padding: '14px 18px', fontWeight: 700, color: '#334155', minWidth: '140px', textAlign: 'right' }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, idx) => {
                    const isTopSpeed = r.stats.avg_speed_kmh === bestSpeed;
                    const isTopPce = r.stats.pce_per_hour === bestPce;
                    const isLowestDelay = bestDelay !== null && r.avg_delay_s === bestDelay;

                    return (
                      <tr
                        key={r.scenario_id}
                        style={{
                          borderBottom: idx === results.length - 1 ? 'none' : '1px solid #f1f5f9',
                          backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fcfcfd',
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        {/* 1st Column: Scenario Name */}
                        <td style={{ padding: '16px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: isTopPce ? '#10b981' : '#3b82f6',
                              }}
                            />
                            <div>
                              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.88rem' }}>
                                {r.scenario_name}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                {r.scenario_id}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Avg Speed */}
                        <td style={{ padding: '16px 14px', fontFamily: 'var(--font-mono)' }}>
                          <span style={{ fontWeight: 700, color: isTopSpeed ? '#15803d' : '#0f172a' }}>
                            {r.stats.avg_speed_kmh} km/h
                          </span>
                          {isTopSpeed && (
                            <span
                              style={{
                                marginLeft: '6px',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                backgroundColor: '#dcfce7',
                                color: '#15803d',
                              }}
                            >
                              FASTEST
                            </span>
                          )}
                        </td>

                        {/* Throughput */}
                        <td style={{ padding: '16px 14px', fontFamily: 'var(--font-mono)' }}>
                          <span style={{ fontWeight: 700, color: isTopPce ? '#15803d' : '#0f172a' }}>
                            {r.stats.pce_per_hour.toLocaleString()} PCE/h
                          </span>
                          {isTopPce && (
                            <span
                              style={{
                                marginLeft: '6px',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                backgroundColor: '#dcfce7',
                                color: '#15803d',
                              }}
                            >
                              BEST FLOW
                            </span>
                          )}
                        </td>

                        {/* Density */}
                        <td style={{ padding: '16px 14px', fontFamily: 'var(--font-mono)', color: '#475569' }}>
                          {r.stats.density_veh_km} veh/km
                        </td>

                        {/* Total Departed */}
                        <td style={{ padding: '16px 14px', fontFamily: 'var(--font-mono)', color: '#334155' }}>
                          {r.stats.total_spawned}
                        </td>

                        {/* Total Arrived */}
                        <td style={{ padding: '16px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#0f172a' }}>
                          {r.stats.total_arrived}
                        </td>

                        {/* Completion Rate */}
                        <td style={{ padding: '16px 14px', fontFamily: 'var(--font-mono)', color: '#334155' }}>
                          {r.stats.completion_rate}%
                        </td>

                        {/* Avg Delay */}
                        <td style={{ padding: '16px 14px', fontFamily: 'var(--font-mono)' }}>
                          {r.avg_delay_s !== null ? (
                            <span style={{ fontWeight: isLowestDelay ? 700 : 500, color: isLowestDelay ? '#15803d' : '#475569' }}>
                              {r.avg_delay_s} s
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>-</span>
                          )}
                        </td>

                        {/* Roundabout Occupancy (if applicable) */}
                        {results.some(res => res.roundabout_occupancy !== null) && (
                          <td style={{ padding: '16px 14px', fontFamily: 'var(--font-mono)', color: '#475569' }}>
                            {r.roundabout_occupancy !== null ? `${r.roundabout_occupancy} vehs` : '-'}
                          </td>
                        )}

                        {/* Action: Open in Simulator */}
                        <td style={{ padding: '16px 18px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => onLaunchSimulator(r.scenario_id)}
                            className="btn-secondary"
                            style={{
                              padding: '5px 10px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title="Inspect this scenario in live interactive simulator"
                          >
                            <span>Live Sim</span>
                            <ChevronRight size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default CompareSimulationsPage;
