import React, { useState } from 'react';
import {
  Activity,
  Play,
  Layers,
  Cpu,
  Compass,
  Zap,
  Info,
  ChevronRight,
  Gauge,
  Sliders,
  Sparkles,
  ExternalLink,
  Mail,
  LogOut,
  Lock,
} from 'lucide-react';
import type { User } from '../types/auth';
import { AboutModal } from './AboutModal';
import { GoogleSignInModal } from './GoogleSignInModal';

interface LandingPageProps {
  user: User | null;
  isAuthenticated: boolean;
  onLaunchSimulator: () => void;
  onSignInWithGoogle: (user?: Partial<User>) => void;
  onSignOut: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  user,
  isAuthenticated,
  onLaunchSimulator,
  onSignInWithGoogle,
  onSignOut,
}) => {
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);

  const handleLaunchClick = () => {
    if (isAuthenticated) {
      onLaunchSimulator();
    } else {
      setIsGoogleModalOpen(true);
    }
  };

  const handleGoogleSuccess = (userData?: Partial<User>) => {
    onSignInWithGoogle(userData);
    setIsGoogleModalOpen(false);
    // After logging in, automatically transition to simulator
    onLaunchSimulator();
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        overflowX: 'hidden',
        overflowY: 'auto',
        backgroundColor: '#070a12',
        color: '#f8fafc',
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 1. TOP NAVBAR */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 28px',
          backgroundColor: 'rgba(7, 10, 18, 0.85)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(56, 189, 248, 0.4)',
            }}
          >
            <Activity size={20} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '1.2rem',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  background: 'linear-gradient(90deg, #ffffff 0%, #cbd5e1 100%)',
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
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  color: '#f59e0b',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                }}
              >
                🇮🇳 Indian Roads (LHT)
              </span>
            </div>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
              Microscopic Traffic Simulation & Analytics Engine
            </span>
          </div>
        </div>

        {/* Center / Right Navigation Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* About Button */}
          <button
            onClick={() => setIsAboutOpen(true)}
            className="btn-secondary"
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Info size={16} color="#38bdf8" />
            <span>About</span>
          </button>

          <a
            href="#features-section"
            style={{
              color: '#94a3b8',
              fontSize: '0.85rem',
              fontWeight: 500,
              textDecoration: 'none',
              padding: '8px 12px',
              borderRadius: '8px',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            Features
          </a>

          {/* Google Sign In / User Profile */}
          {isAuthenticated && user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={onLaunchSimulator}
                className="btn-primary"
                style={{ padding: '8px 18px', fontSize: '0.85rem' }}
              >
                <Play size={15} fill="#ffffff" />
                Launch Simulator
              </button>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(30, 41, 59, 0.7)',
                  padding: '4px 10px 4px 6px',
                  borderRadius: '30px',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                }}
              >
                <img
                  src={user.avatar}
                  alt={user.name}
                  style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc' }}>
                  {user.name}
                </span>
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
                    marginLeft: '4px',
                  }}
                  title="Sign out"
                >
                  <LogOut size={14} />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsGoogleModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                background: '#ffffff',
                color: '#1f2937',
                padding: '8px 18px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2), 0 0 15px rgba(255, 255, 255, 0.15)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(255, 255, 255, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2), 0 0 15px rgba(255, 255, 255, 0.15)';
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
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
              <span>Sign In with Google</span>
            </button>
          )}
        </div>
      </nav>

      {/* 2. HERO SECTION */}
      <section
        style={{
          position: 'relative',
          padding: '70px 24px 60px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(2, 132, 199, 0.25) 0%, rgba(7, 10, 18, 0) 100%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        {/* Scenario Pill */}
        <div
          className="glass-pill"
          style={{
            marginBottom: '20px',
            borderColor: 'rgba(56, 189, 248, 0.3)',
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            padding: '6px 16px',
          }}
        >
          <Sparkles size={14} color="#38bdf8" />
          <span style={{ color: '#38bdf8', fontWeight: 600, fontSize: '0.8rem' }}>
            Eclipse SUMO Physics Daemon • 20 Hz Real-Time TraCI Integration
          </span>
        </div>

        {/* Main Headline */}
        <h1
          style={{
            fontSize: 'clamp(2.4rem, 5vw, 4rem)',
            fontWeight: 900,
            lineHeight: '1.15',
            letterSpacing: '-0.02em',
            maxWidth: '960px',
            marginBottom: '20px',
            background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 50%, #38bdf8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Microscopic Traffic Simulation & Highway Intelligence
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: 'clamp(1rem, 1.8vw, 1.2rem)',
            lineHeight: '1.6',
            color: '#94a3b8',
            maxWidth: '780px',
            marginBottom: '36px',
          }}
        >
          Experience sub-millisecond vehicle kinematics, Left-Hand Traffic (LHT) Indian road networks,
          adaptive traffic signal controls, and high-frequency WebSocket streaming visualized in 60 FPS Canvas.
        </p>

        {/* Hero CTAs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center', marginBottom: '40px' }}>
          <button
            onClick={handleLaunchClick}
            style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
              color: '#ffffff',
              border: '1px solid rgba(56, 189, 248, 0.5)',
              padding: '14px 32px',
              borderRadius: '12px',
              fontSize: '1.05rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 10px 30px rgba(2, 132, 199, 0.4), 0 0 20px rgba(56, 189, 248, 0.3)',
              transition: 'all 0.25s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 14px 36px rgba(2, 132, 199, 0.5), 0 0 30px rgba(56, 189, 248, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 10px 30px rgba(2, 132, 199, 0.4), 0 0 20px rgba(56, 189, 248, 0.3)';
            }}
          >
            {isAuthenticated ? (
              <>
                <Play size={18} fill="#ffffff" />
                <span>Launch Simulation Studio</span>
              </>
            ) : (
              <>
                <Lock size={18} />
                <span>Sign In with Google to Enter Simulator</span>
              </>
            )}
            <ChevronRight size={18} />
          </button>

          <button
            onClick={() => setIsAboutOpen(true)}
            className="btn-secondary"
            style={{
              padding: '14px 28px',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: 600,
            }}
          >
            <Info size={18} color="#38bdf8" />
            <span>Platform Overview & Details</span>
          </button>
        </div>

        {/* Feature Badges Grid */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '12px',
            maxWidth: '900px',
          }}
        >
          <div className="glass-pill" style={{ padding: '6px 14px' }}>
            <Cpu size={14} color="#38bdf8" />
            <span>20 Hz SUMO TraCI Loop</span>
          </div>
          <div className="glass-pill" style={{ padding: '6px 14px' }}>
            <Compass size={14} color="#f59e0b" />
            <span>Left-Hand Traffic (LHT) Geometry</span>
          </div>
          <div className="glass-pill" style={{ padding: '6px 14px' }}>
            <Layers size={14} color="#10b981" />
            <span>60 FPS Lerp Canvas Viewport</span>
          </div>
          <div className="glass-pill" style={{ padding: '6px 14px' }}>
            <Gauge size={14} color="#8b5cf6" />
            <span>PCE/Hour Flow Calibration</span>
          </div>
        </div>
      </section>

      {/* 3. CORE FEATURES SECTION */}
      <section
        id="features-section"
        style={{
          padding: '60px 28px 80px',
          backgroundColor: 'rgba(11, 15, 25, 0.6)',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', marginBottom: '8px' }}>
              Engineered for Scientific Accuracy & Real-time Speed
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
              Built with industry-standard microscopic modeling tools and modern web graphics.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '20px',
            }}
          >
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                }}
              >
                <Cpu size={22} color="#38bdf8" />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
                SUMO & TraCI Daemon
              </h3>
              <p style={{ fontSize: '0.84rem', color: '#94a3b8', lineHeight: '1.5' }}>
                Runs Eclipse SUMO in headless daemon mode with TraCI controlling vehicle injection, speed limits,
                and signal changes at 20 Hz (50ms ticks).
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '24px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                }}
              >
                <Compass size={22} color="#f59e0b" />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
                Indian Road Physics (LHT)
              </h3>
              <p style={{ fontSize: '0.84rem', color: '#94a3b8', lineHeight: '1.5' }}>
                Left-Hand Traffic rules with slow traffic in left kerb lanes and fast overtaking in right median lanes,
                accurately reflecting Indian highway guidelines.
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '24px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                }}
              >
                <Sliders size={22} color="#10b981" />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
                Interactive Traffic Light HUD
              </h3>
              <p style={{ fontSize: '0.84rem', color: '#94a3b8', lineHeight: '1.5' }}>
                Adjust green, yellow, and red phase timing sliders on the fly. Trigger immediate phase transitions or switch
                to manual green-wave overrides.
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '24px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'rgba(139, 92, 246, 0.15)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                }}
              >
                <Zap size={22} color="#8b5cf6" />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
                Compressed WebSocket Stream
              </h3>
              <p style={{ fontSize: '0.84rem', color: '#94a3b8', lineHeight: '1.5' }}>
                Compact vehicle kinematic tuples broadcast at 10 Hz with client-side 60 FPS sub-frame lerp interpolation,
                reducing bandwidth by over 88%.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. CALL TO ACTION BANNER */}
      <section
        style={{
          padding: '70px 24px',
          textAlign: 'center',
          background: 'linear-gradient(180deg, rgba(7, 10, 18, 0) 0%, rgba(2, 132, 199, 0.15) 100%)',
        }}
      >
        <div
          className="glass-panel"
          style={{
            maxWidth: '800px',
            margin: '0 auto',
            padding: '40px 32px',
            borderRadius: '20px',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(56, 189, 248, 0.2)',
          }}
        >
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ffffff', marginBottom: '12px' }}>
            Ready to Analyze Microscopic Traffic Flows?
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', maxWidth: '560px', margin: '0 auto 28px' }}>
            {isAuthenticated
              ? `You are signed in as ${user?.name}. Jump straight into the simulation dashboard with full controls.`
              : 'Sign in with your Google account to unlock full simulator access, vehicle spawner tools, and telemetry analytics.'}
          </p>

          <button
            onClick={handleLaunchClick}
            style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
              color: '#ffffff',
              border: 'none',
              padding: '14px 36px',
              borderRadius: '12px',
              fontSize: '1.05rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 8px 24px rgba(2, 132, 199, 0.4)',
            }}
          >
            {isAuthenticated ? (
              <>
                <Play size={18} fill="#ffffff" />
                <span>Launch Simulator Workspace</span>
              </>
            ) : (
              <>
                <Lock size={18} />
                <span>Sign In with Google to Enter</span>
              </>
            )}
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      {/* 6. FOOTER */}
      <footer
        style={{
          marginTop: 'auto',
          padding: '24px 28px',
          backgroundColor: '#04070e',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          fontSize: '0.8rem',
          color: '#64748b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontWeight: 700, color: '#f8fafc' }}>TRAFFIS</span>
          <span>•</span>
          <span>Simulation platform built on Eclipse SUMO TraCI</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => setIsAboutOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#38bdf8',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Info size={14} />
            About & Contact Details
          </button>

          <a
            href="mailto:contact@traffis.in"
            style={{
              color: '#94a3b8',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            <Mail size={14} />
            contact@traffis.in
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
            onMouseEnter={(e) => (e.currentTarget.style.color = '#38bdf8')}
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
