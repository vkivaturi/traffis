import React, { useState } from 'react';
import {
  Activity,
  Play,
  RotateCw,
  GitFork,
  Milestone,
  Info,
  ChevronRight,
  Sliders,
  ExternalLink,
  Mail,
  LogOut,
  Lock,
  Building2,
  MapPin,
  Clock,
  ArrowRight,
  Compass,
  TrafficCone,
} from 'lucide-react';
import type { User } from '../types/auth';
import type { ScenarioMetadata } from '../types/simulation';
import { AboutModal } from './AboutModal';
import { GoogleSignInModal } from './GoogleSignInModal';

interface LandingPageProps {
  user: User | null;
  isAuthenticated: boolean;
  onLaunchSimulator: () => void;
  onSignInWithGoogle: (user?: Partial<User>) => void;
  onSignOut: () => void;
  scenarios?: ScenarioMetadata[];
  activeScenarioId?: string;
  onSelectScenarioAndLaunch?: (scenarioId: string) => void;
  onNavigateCompare?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  user,
  isAuthenticated,
  onLaunchSimulator,
  onSignInWithGoogle,
  onSignOut,
  onSelectScenarioAndLaunch,
  onNavigateCompare,
}) => {
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [pendingScenarioId, setPendingScenarioId] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<'simulator' | 'compare'>('simulator');

  const handleLaunchClick = (scenarioId?: string) => {
    if (isAuthenticated) {
      if (scenarioId && onSelectScenarioAndLaunch) {
        onSelectScenarioAndLaunch(scenarioId);
      } else {
        onLaunchSimulator();
      }
    } else {
      setPendingTarget('simulator');
      if (scenarioId) {
        setPendingScenarioId(scenarioId);
      }
      setIsGoogleModalOpen(true);
    }
  };

  const handleCompareClick = () => {
    if (isAuthenticated) {
      if (onNavigateCompare) {
        onNavigateCompare();
      }
    } else {
      setPendingTarget('compare');
      setIsGoogleModalOpen(true);
    }
  };

  const handleGoogleSuccess = (userData?: Partial<User>) => {
    onSignInWithGoogle(userData);
    setIsGoogleModalOpen(false);
    if (pendingTarget === 'compare') {
      setPendingTarget('simulator');
      if (onNavigateCompare) {
        onNavigateCompare();
        return;
      }
    }
    if (pendingScenarioId && onSelectScenarioAndLaunch) {
      onSelectScenarioAndLaunch(pendingScenarioId);
      setPendingScenarioId(null);
    } else {
      onLaunchSimulator();
    }
  };

  const scenarioCards = [
    {
      id: 'gnt_circle',
      title: 'GNT Circle Roundabout & Bypass',
      location: 'Nallagandla ⇄ Tellapur ⇄ Lingampalli Flyover',
      badge: 'Unsignalised Roundabout',
      badgeColor: '#059669',
      badgeBg: '#ecfdf5',
      badgeBorder: '#a7f3d0',
      icon: <RotateCw size={18} color="#059669" />,
      description:
        'Major suburban traffic hub featuring a clockwise roundabout, a dedicated Tellapur free-left bypass slip, and a bottom-road median U-turn connector.',
      operationalQuestions: [
        'Analyze unsignalised merging conflicts and gap acceptance at the circle',
        'Measure how many vehicles bypass the circle via the Tellapur free-left',
        'Verify if the median U-turn prevents ring gridlock during peak hours',
      ],
      metricsTracked: 'Ring occupancy, arm queue length, U-turn throughput',
      type: 'roundabout',
    },
    {
      id: 'gnt_circle_with_traffic_lights',
      title: 'GNT Circle With Traffic Lights',
      location: 'Nallagandla ⇄ Tellapur ⇄ Lingampalli Flyover',
      badge: 'Signalised Roundabout',
      badgeColor: '#2563eb',
      badgeBg: '#eff6ff',
      badgeBorder: '#bfdbfe',
      icon: <TrafficCone size={18} color="#2563eb" />,
      description:
        'Clockwise roundabout regulated by traffic signals on the Nallagandla entry and Flyover ring continuation, paired with continuous free-left slips and median U-turn.',
      operationalQuestions: [
        'Test signal coordination between Nallagandla entry and Flyover ring traffic',
        'Evaluate how signals prevent circular ring lockups during extreme demand',
        'Measure throughput and delay comparison vs. the unsignalised roundabout baseline',
      ],
      metricsTracked: 'Signal phase splits, ring queue clearance, PCE throughput',
      type: 'roundabout',
    },
    {
      id: 'nallagandla_junction',
      title: 'Simulate GNT Circle with no roundabout',
      location: 'Nallagandla ⇄ Tellapur ⇄ Lingampalli Flyover',
      badge: 'Signalised T-Junction',
      badgeColor: '#4a2c11',
      badgeBg: '#f7f1ea',
      badgeBorder: '#dfd2c4',
      icon: <GitFork size={18} color="#4a2c11" />,
      description:
        'High-density 3-way T-junction with dedicated free-left turns (TL→FL & FL→NG) that bypass the signal, providing direct connectivity to the flyover road.',
      operationalQuestions: [
        'Test 3-phase signal timing plans for morning vs evening peak flows',
        'Ensure free-left slip lanes move continuously without blocking through-traffic',
        'Analyze queue clearance times for Tellapur and Nallagandla approaches',
      ],
      metricsTracked: 'Inflow/outflow counts, delay per arm, phase split efficiency',
      type: 'intersection',
    },
    {
      id: 'four_way_intersection',
      title: '4-Way Urban Crossroads',
      location: 'City Arterial Crossroad (North-South / East-West)',
      badge: '4-Phase Signalized',
      badgeColor: '#b45309',
      badgeBg: '#fffbeb',
      badgeBorder: '#fde68a',
      icon: <GitFork size={18} color="#b45309" />,
      description:
        'Standard 4-arm municipal crossroads with dual-lane approaches, right-turn pockets, and full multi-phase traffic signal scheduling.',
      operationalQuestions: [
        'Balance green phase durations across major arterial and cross-street',
        'Evaluate yellow clearance times to eliminate intersection box blocking',
        'Calculate overall intersection capacity in Passenger Car Units (PCE/hour)',
      ],
      metricsTracked: 'Average vehicle speed, queue buildup, PCE throughput',
      type: 'intersection',
    },
    {
      id: 'three_way_intersection',
      title: '3-Way Priority T-Intersection',
      location: 'Main Highway with Feeder Side Road',
      badge: 'Arterial & Side Road',
      badgeColor: '#5c3a21',
      badgeBg: '#faf5ef',
      badgeBorder: '#e8ddd0',
      icon: <GitFork size={18} color="#5c3a21" />,
      description:
        'High-volume two-way arterial with a perpendicular side street, evaluating right-of-way gap acceptance and signal cycle trade-offs.',
      operationalQuestions: [
        'Determine whether to install a signal or rely on give-way priority',
        'Prevent side-road queue spillbacks onto local neighborhood streets',
        'Minimize main road speed reduction during peak feeder merging',
      ],
      metricsTracked: 'Minor-arm delay, main road flow rate, gap acceptance',
      type: 'intersection',
    },
    {
      id: 'straight_road',
      title: '1000m Dual-Carriageway Highway',
      location: 'Multi-lane Highway Corridor with Signal Gantry',
      badge: 'Arterial Corridor',
      badgeColor: '#0284c7',
      badgeBg: '#f0f9ff',
      badgeBorder: '#bae6fd',
      icon: <Milestone size={18} color="#0284c7" />,
      description:
        '1-kilometer 4-lane divided highway with Indian Left-Hand Traffic (LHT) rules, kerbside slow lanes, median overtaking lanes, and a mid-block signal.',
      operationalQuestions: [
        'Evaluate lane discipline (heavy/slow vehicles in kerb vs. fast median overtaking)',
        'Measure deceleration queues and braking zones before mid-block traffic signals',
        'Determine free-flow highway capacity under mixed traffic conditions',
      ],
      metricsTracked: 'Lane utilization %, speed distribution, stopping distance',
      type: 'corridor',
    },
  ];

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
      {/* 1. STRIPE-STYLE LIGHT TOP NAVBAR */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 36px',
          backgroundColor: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              backgroundColor: '#4a2c11',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(74, 44, 17, 0.25)',
            }}
          >
            <Activity size={18} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '1.12rem',
                  fontWeight: 800,
                  letterSpacing: '0.03em',
                  color: '#0f172a',
                }}
              >
                TRAFFIS
              </span>
              <span
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: '#fffbeb',
                  color: '#b45309',
                  border: '1px solid #fde68a',
                }}
              >
                🇮🇳 Indian Roads (LHT)
              </span>
            </div>
            <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
              Traffic Operations & Junction Simulation Platform
            </span>
          </div>
        </div>

        {/* Center / Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <a
            href="#scenarios-section"
            style={{
              color: '#475569',
              fontSize: '0.86rem',
              fontWeight: 500,
              textDecoration: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
          >
            Scenarios
          </a>

          <a
            href="#use-cases-section"
            style={{
              color: '#475569',
              fontSize: '0.86rem',
              fontWeight: 500,
              textDecoration: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
          >
            Municipal & Police Uses
          </a>

          {onNavigateCompare && (
            <button
              onClick={handleCompareClick}
              className="btn-secondary"
              style={{
                padding: '6px 14px',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#4a2c11',
                backgroundColor: '#f7f1ea',
                borderColor: '#dfd2c4',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title={isAuthenticated ? 'Compare multiple road scenarios side-by-side' : 'Sign in with Google to compare scenarios'}
            >
              {!isAuthenticated && <Lock size={12} color="#8a5323" />}
              <GitFork size={14} color="#4a2c11" />
              <span>Compare Simulations</span>
            </button>
          )}

          <button
            onClick={() => setIsAboutOpen(true)}
            className="btn-secondary"
            style={{
              padding: '6px 14px',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Info size={14} color="#64748b" />
            <span>About</span>
          </button>

          {/* User state / Launch CTA */}
          {isAuthenticated && user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => handleLaunchClick()}
                className="btn-primary"
                style={{ padding: '7px 16px', fontSize: '0.85rem' }}
              >
                <Play size={14} fill="#ffffff" />
                Open Simulator
              </button>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: '#f8fafc',
                  padding: '4px 10px 4px 6px',
                  borderRadius: '24px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <img
                  src={user.avatar}
                  alt={user.name}
                  style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover' }}
                />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}>
                  {user.name}
                </span>
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
                    marginLeft: '2px',
                  }}
                  title="Sign out"
                >
                  <LogOut size={13} />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsGoogleModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#ffffff',
                color: '#1e293b',
                padding: '7px 16px',
                borderRadius: '8px',
                fontSize: '0.84rem',
                fontWeight: 600,
                border: '1px solid #e2e8f0',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f8fafc';
                e.currentTarget.style.borderColor = '#cbd5e1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#ffffff';
                e.currentTarget.style.borderColor = '#e2e8f0';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>Sign In</span>
            </button>
          )}
        </div>
      </nav>

      {/* 2. STRIPE-STYLE HERO SECTION */}
      <section
        style={{
          padding: '72px 28px 64px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          backgroundColor: '#ffffff',
          backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99, 91, 255, 0.08) 0%, rgba(255, 255, 255, 0) 100%)',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        {/* Civic Tag */}
        <div
          style={{
            marginBottom: '20px',
            borderColor: '#dfd2c4',
            backgroundColor: '#f7f1ea',
            border: '1px solid #dfd2c4',
            borderRadius: '9999px',
            padding: '5px 14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Building2 size={13} color="#4a2c11" />
          <span style={{ color: '#4a2c11', fontWeight: 600, fontSize: '0.78rem' }}>
            Decision-Support Tool for Traffic Police & Municipal Road Engineers
          </span>
        </div>

        {/* Headline */}
        <h1
          style={{
            fontSize: 'clamp(2.2rem, 4.4vw, 3.5rem)',
            fontWeight: 800,
            lineHeight: '1.18',
            letterSpacing: '-0.03em',
            maxWidth: '920px',
            marginBottom: '18px',
            color: '#0f172a',
          }}
        >
          Evaluate Road Changes & Signal Plans Before Paving City Streets
        </h1>

        {/* Subtitle in plain, non-technical English */}
        <p
          style={{
            fontSize: 'clamp(0.98rem, 1.5vw, 1.15rem)',
            lineHeight: '1.6',
            color: '#475569',
            maxWidth: '740px',
            marginBottom: '32px',
          }}
        >
          Traffis lets traffic officers and municipal staff test roundabout designs, traffic light
          green times, and free-left slip lanes virtually. Observe real vehicle queues, identify
          bottlenecks, and make evidence-based road decisions with zero disruption to traffic.
        </p>

        {/* CTA Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', justifyContent: 'center', marginBottom: '40px' }}>
          <button
            onClick={() => handleLaunchClick()}
            className="btn-primary"
            style={{
              padding: '12px 28px',
              fontSize: '0.98rem',
              fontWeight: 700,
              borderRadius: '8px',
            }}
          >
            {isAuthenticated ? (
              <>
                <Play size={16} fill="#ffffff" />
                <span>Launch Simulation Studio</span>
              </>
            ) : (
              <>
                <Lock size={16} />
                <span>Sign In to Open Simulator</span>
              </>
            )}
            <ChevronRight size={16} />
          </button>

          <a
            href="#scenarios-section"
            className="btn-secondary"
            style={{
              padding: '12px 24px',
              fontSize: '0.94rem',
              fontWeight: 600,
              textDecoration: 'none',
              borderRadius: '8px',
            }}
          >
            <span>Explore 6 Road Scenarios</span>
            <ChevronRight size={15} color="#64748b" />
          </a>

          {onNavigateCompare && (
            <button
              onClick={handleCompareClick}
              style={{
                padding: '12px 24px',
                fontSize: '0.94rem',
                fontWeight: 700,
                backgroundColor: '#f7f1ea',
                color: '#4a2c11',
                border: '1.5px solid #dfd2c4',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 6px rgba(74, 44, 17, 0.08)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#ede2d5';
                e.currentTarget.style.borderColor = '#4a2c11';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#f7f1ea';
                e.currentTarget.style.borderColor = '#dfd2c4';
              }}
              title={isAuthenticated ? 'Compare multiple road scenarios side-by-side' : 'Sign in with Google to compare scenarios'}
            >
              {!isAuthenticated && <Lock size={15} color="#8a5323" />}
              <GitFork size={16} color="#4a2c11" />
              <span>Compare Simulations</span>
            </button>
          )}
        </div>

        {/* Key Operational Pillars */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '14px',
            width: '100%',
            maxWidth: '980px',
            marginTop: '10px',
          }}
        >
          <div
            className="glass-panel"
            style={{
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              backgroundColor: '#ffffff',
              borderColor: '#e2e8f0',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <Compass size={20} color="#4a2c11" />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                Indian Road Physics (LHT)
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                Left-hand drive, kerb lane discipline
              </div>
            </div>
          </div>

          <div
            className="glass-panel"
            style={{
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              backgroundColor: '#ffffff',
              borderColor: '#e2e8f0',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <RotateCw size={20} color="#059669" />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                Roundabouts vs. Signals
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                Compare circular flow against lights
              </div>
            </div>
          </div>

          <div
            className="glass-panel"
            style={{
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              backgroundColor: '#ffffff',
              borderColor: '#e2e8f0',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <Sliders size={20} color="#d97706" />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                Free-Left & U-Turn Slips
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                Evaluate bottleneck bypass lanes
              </div>
            </div>
          </div>

          <div
            className="glass-panel"
            style={{
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              backgroundColor: '#ffffff',
              borderColor: '#e2e8f0',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <Clock size={20} color="#5c3a21" />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                Zero On-Street Risk
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                Test traffic plans in virtual space
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. SCENARIOS SECTION - Clean Stripe Light Grid */}
      <section
        id="scenarios-section"
        style={{
          padding: '72px 28px 80px',
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div style={{ maxWidth: '1240px', margin: '0 auto', width: '100%' }}>
          <div
            style={{
              marginBottom: '40px',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: '20px',
            }}
          >
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
                Current Road Networks
              </span>
              <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', marginTop: '6px', marginBottom: '10px' }}>
                Select a Scenario to Simulate & Analyze
              </h2>
              <p style={{ color: '#475569', fontSize: '0.96rem', maxWidth: '780px' }}>
                Each scenario is pre-calibrated with realistic traffic volume, vehicle types (cars,
                vans, commercial transport), and road markings. Click any card to launch and inspect
                traffic flow directly.
              </p>
            </div>

            {onNavigateCompare && (
              <button
                onClick={handleCompareClick}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ffffff',
                  color: '#4a2c11',
                  border: '1.5px solid #dfd2c4',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#4a2c11';
                  e.currentTarget.style.backgroundColor = '#f7f1ea';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#dfd2c4';
                  e.currentTarget.style.backgroundColor = '#ffffff';
                }}
                title={isAuthenticated ? 'Compare multiple road scenarios side-by-side' : 'Sign in with Google to compare scenarios'}
              >
                {!isAuthenticated && <Lock size={14} color="#8a5323" />}
                <GitFork size={16} color="#4a2c11" />
                <span>Compare Scenarios Side-by-Side</span>
                <ChevronRight size={15} color="#4a2c11" />
              </button>
            )}
          </div>

          {/* Grid of Scenario Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: '24px',
            }}
          >
            {scenarioCards.map((sc) => (
              <div
                key={sc.id}
                className="glass-panel"
                style={{
                  padding: '26px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease',
                  backgroundColor: '#ffffff',
                  borderColor: '#e2e8f0',
                  boxShadow: 'var(--shadow-sm)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#cbd5e1';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                }}
              >
                <div>
                  {/* Top Badge & Location */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        backgroundColor: sc.badgeBg,
                        border: `1px solid ${sc.badgeBorder}`,
                        color: sc.badgeColor,
                        fontSize: '0.74rem',
                        fontWeight: 700,
                      }}
                    >
                      {sc.icon}
                      <span>{sc.badge}</span>
                    </div>
                  </div>

                  {/* Title & Location */}
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
                    {sc.title}
                  </h3>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '0.78rem',
                      color: '#5c3a21',
                      marginBottom: '14px',
                      fontWeight: 600,
                    }}
                  >
                    <MapPin size={13} />
                    <span>{sc.location}</span>
                  </div>

                  {/* Summary */}
                  <p style={{ fontSize: '0.86rem', color: '#475569', lineHeight: '1.55', marginBottom: '18px' }}>
                    {sc.description}
                  </p>
                </div>

                {/* Card Footer: Launch Button */}
                <div>
                  <button
                    onClick={() => handleLaunchClick(sc.id)}
                    className="btn-primary"
                    style={{
                      width: '100%',
                      justifyContent: 'center',
                      padding: '10px 16px',
                      fontSize: '0.88rem',
                    }}
                  >
                    <Play size={14} fill="#ffffff" />
                    <span>Launch {sc.title.split(' ')[0]} Scenario</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. SIMPLE 3-STEP GUIDE FOR NON-TECHNICAL USERS */}
      <section style={{ padding: '72px 28px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
            How to Use Traffis in 3 Simple Steps
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.94rem' }}>
            No coding or technical expertise required — operate the simulator just like watching a live traffic feed.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '22px' }}>
          <div
            className="glass-panel"
            style={{
              padding: '24px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#f7f1ea',
                color: '#4a2c11',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.9rem',
                marginBottom: '14px',
              }}
            >
              1
            </div>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              Select a Junction or Corridor
            </h4>
            <p style={{ fontSize: '0.84rem', color: '#475569', lineHeight: '1.5' }}>
              Choose from GNT Circle, Nallagandla Junction, or urban crossroads using the top road
              selector dropdown.
            </p>
          </div>

          <div
            className="glass-panel"
            style={{
              padding: '24px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#ecfdf5',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.9rem',
                marginBottom: '14px',
              }}
            >
              2
            </div>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              Press Start & Observe Flow
            </h4>
            <p style={{ fontSize: '0.84rem', color: '#475569', lineHeight: '1.5' }}>
              Click START to begin. Pan, zoom, or click any vehicle to follow its trip and view live
              speed and braking in real time.
            </p>
          </div>

          <div
            className="glass-panel"
            style={{
              padding: '24px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#fffbeb',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.9rem',
                marginBottom: '14px',
              }}
            >
              3
            </div>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              Compare Plans & Metrics
            </h4>
            <p style={{ fontSize: '0.84rem', color: '#475569', lineHeight: '1.5' }}>
              Toggle roundabout signals ON or OFF, inspect waiting vehicle counts, and view average
              delay per arm directly on the dashboard.
            </p>
          </div>
        </div>
      </section>

      {/* 6. CALL TO ACTION BANNER */}
      <section
        style={{
          padding: '48px 24px 64px',
          textAlign: 'center',
          backgroundColor: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
        }}
      >
      </section>

      {/* 7. STRIPE-STYLE LIGHT FOOTER */}
      <footer
        style={{
          marginTop: 'auto',
          padding: '24px 36px',
          backgroundColor: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          fontSize: '0.8rem',
          color: '#64748b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>TRAFFIS</span>
          <span>•</span>
          <span>Traffic Operations Platform for Indian Roads</span>
          <span>•</span>
          <span>Physics Engine: Eclipse SUMO</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <button
            onClick={() => setIsAboutOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#4a2c11',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Info size={14} />
            <span>About Traffis</span>
          </button>

          <a
            href="mailto:contact@traffis.in"
            style={{
              color: '#64748b',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            <Mail size={14} />
            <span>contact@traffis.in</span>
          </a>

          <a
            href="https://eclipse.dev/sumo/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#64748b',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#4a2c11')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            <span>Eclipse SUMO</span>
            <ExternalLink size={12} />
          </a>
        </div>
      </footer>

      {/* MODALS */}
      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />

      <GoogleSignInModal
        isOpen={isGoogleModalOpen}
        onClose={() => setIsGoogleModalOpen(false)}
        onSignIn={handleGoogleSuccess}
      />
    </div>
  );
};
