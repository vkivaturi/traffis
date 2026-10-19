import React, { useState } from 'react';
import {
  X,
  Mail,
  Copy,
  Check,
  ExternalLink,
  Cpu,
  Layers,
  Compass,
  Building2,
  ShieldCheck,
  RotateCw,
} from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const contactEmail = 'contact@traffis.in';

  if (!isOpen) return null;

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        backdropFilter: 'blur(8px)',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '88vh',
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#4a2c11',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(74, 44, 17, 0.25)',
              }}
            >
              <Building2 size={18} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1.18rem', fontWeight: 800, letterSpacing: '0.02em', color: '#0f172a' }}>
                  About TRAFFIS
                </h2>
                <span
                  style={{
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: '#f7f1ea',
                    color: '#4a2c11',
                    border: '1px solid #dfd2c4',
                  }}
                >
                  Municipal Operations
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Evidence-Based Road Engineering & Traffic Control Simulation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-icon"
            style={{ width: '32px', height: '32px' }}
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body Content */}
        <div
          style={{
            padding: '24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          {/* Mission & Purpose */}
          <div>
            <h4
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#4a2c11',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <ShieldCheck size={14} />
              Mission & Purpose
            </h4>
            <p style={{ fontSize: '0.88rem', lineHeight: '1.6', color: '#334155' }}>
              <strong>Traffis</strong> is designed specifically for traffic police departments, municipal road
              authorities, and civic transport engineers. It enables authorities to test road modifications—such
              as converting an intersection into a roundabout, timing traffic signals, or constructing dedicated
              free-left bypass lanes—in a safe virtual environment before executing changes on city streets.
            </p>
          </div>

          {/* Core Capabilities */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '12px',
            }}
          >
            <div
              style={{
                padding: '14px',
                borderRadius: '8px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Compass size={16} color="#2563eb" />
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a' }}>
                  Indian Road Rules (LHT)
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: '1.45' }}>
                Modeled for Left-Hand Traffic (LHT) geometry, kerbside slow lanes, median overtaking lanes, and Indian mixed vehicle flow (cars and delivery vans).
              </p>
            </div>

            <div
              style={{
                padding: '14px',
                borderRadius: '8px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <RotateCw size={16} color="#059669" />
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a' }}>
                  Roundabout & Bypass Analysis
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: '1.45' }}>
                Compare unsignalised roundabout throughput against signalized operations. Measure how many vehicles bypass bottlenecks using free-left slip lanes.
              </p>
            </div>

            <div
              style={{
                padding: '14px',
                borderRadius: '8px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Cpu size={16} color="#d97706" />
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a' }}>
                  Accurate Physics Simulation
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: '1.45' }}>
                Underpinned by Eclipse SUMO daemon running at 20 Hz, calculating real-world car-following kinematics, braking gaps, and queue back-ups.
              </p>
            </div>

            <div
              style={{
                padding: '14px',
                borderRadius: '8px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Layers size={16} color="#7c3aed" />
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a' }}>
                  Zero-Installation Web Access
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: '1.45' }}>
                Runs directly in modern web browsers on standard municipal laptops and control room screens without installing heavy CAD or GIS software.
              </p>
            </div>
          </div>

          {/* Inquiries & Municipal Contact */}
          <div
            style={{
              padding: '16px 18px',
              borderRadius: '8px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Mail size={16} color="#4a2c11" />
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
                Municipal Support & Inquiries
              </h4>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#475569', lineHeight: '1.5' }}>
              For custom junction modeling, corridor feasibility studies, or traffic police department onboarding, contact our engineering support:
            </p>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#ffffff',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                width: 'fit-content',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <Mail size={14} color="#64748b" />
              <a
                href={`mailto:${contactEmail}`}
                style={{
                  color: '#4a2c11',
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                }}
              >
                {contactEmail}
              </a>
              <button
                type="button"
                onClick={() => handleCopyEmail(contactEmail)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: copiedEmail ? '#059669' : '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.74rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  marginLeft: '4px',
                }}
                title="Copy email address"
              >
                {copiedEmail ? <Check size={13} /> : <Copy size={13} />}
                {copiedEmail ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <a
            href="https://eclipse.dev/sumo/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: '#64748b',
              fontSize: '0.76rem',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#4a2c11')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            <span>Simulation Engine: Eclipse SUMO</span>
            <ExternalLink size={12} />
          </a>

          <button onClick={onClose} className="btn-secondary" style={{ padding: '6px 16px', fontSize: '0.8rem' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AboutModal;
