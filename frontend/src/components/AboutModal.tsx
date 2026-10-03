import React, { useState } from 'react';
import {
  X,
  Mail,
  Copy,
  Check,
  ExternalLink,
  Cpu,
  Activity,
  Layers,
  Compass,
  Code2,
  Sparkles,
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
        backgroundColor: 'rgba(3, 7, 18, 0.85)',
        backdropFilter: 'blur(16px)',
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
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.96) 0%, rgba(8, 12, 22, 0.98) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '18px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 40px rgba(56, 189, 248, 0.12)',
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
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(30, 41, 59, 0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 15px rgba(56, 189, 248, 0.4)',
              }}
            >
              <Activity size={20} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '0.04em', color: '#ffffff' }}>
                  About TRAFFIS
                </h2>
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    color: '#38bdf8',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                  }}
                >
                  v2.4 Pro
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                Microscopic Traffic Simulation & Network Intelligence Platform
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-icon"
            style={{ width: '34px', height: '34px' }}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Content with Custom Scrollbar */}
        <div
          style={{
            padding: '24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          {/* Mission & Overview */}
          <div>
            <h4
              style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#38bdf8',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Sparkles size={14} />
              Platform Overview
            </h4>
            <p style={{ fontSize: '0.88rem', lineHeight: '1.6', color: '#cbd5e1' }}>
              <strong>Traffis</strong> is a high-fidelity, real-time microscopic traffic simulation suite
              designed for civil engineers, traffic planners, and smart-city researchers. It simulates individual
              vehicle kinematics, lane changes, signal-controlled intersections, and highway corridors with
              sub-millisecond precision.
            </p>
          </div>

          {/* Architecture Grid */}
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
                borderRadius: '10px',
                background: 'rgba(30, 41, 59, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Cpu size={16} color="#38bdf8" />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                  SUMO + TraCI Physics Engine
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.45' }}>
                Powered by Eclipse SUMO daemon running at 20 Hz, implementing the Krauss car-following model and realistic gap-acceptance algorithms.
              </p>
            </div>

            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: 'rgba(30, 41, 59, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Compass size={16} color="#f59e0b" />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                  Left-Hand Traffic (LHT)
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.45' }}>
                Built natively for Indian & UK road network rules, featuring left-side driving, right-lane median overtakes, and dual carriageway geometry.
              </p>
            </div>

            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: 'rgba(30, 41, 59, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Layers size={16} color="#10b981" />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                  60 FPS Canvas & WebSockets
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.45' }}>
                Hardware-accelerated HTML5 Canvas with sub-frame position lerping, smooth camera follow modes, and low-latency binary state broadcasts.
              </p>
            </div>

            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: 'rgba(30, 41, 59, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Code2 size={16} color="#8b5cf6" />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                  Full Interactive Control
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.45' }}>
                Live vehicle injection, customizable vehicle inflow rates (PCE/hr), signal phase overrides, and microscopic telemetry HUD.
              </p>
            </div>
          </div>

          {/* Contact & Support Section */}
          <div
            style={{
              padding: '18px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.1) 0%, rgba(15, 23, 42, 0.6) 100%)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Mail size={18} color="#38bdf8" />
              <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#ffffff' }}>
                Contact & Inquiries
              </h4>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: '1.5' }}>
              For simulation collaborations, academic research, custom scenario designs, or platform support, feel free to get in touch with our team:
            </p>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
                alignItems: 'center',
              }}
            >
              {/* Primary Contact Email Box */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  flex: 1,
                  minWidth: '220px',
                }}
              >
                <Mail size={15} color="#94a3b8" />
                <a
                  href={`mailto:${contactEmail}`}
                  style={{
                    color: '#38bdf8',
                    textDecoration: 'none',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    flex: 1,
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
                    color: copiedEmail ? '#10b981' : '#94a3b8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.72rem',
                    padding: '3px 6px',
                    borderRadius: '4px',
                  }}
                  title="Copy email address"
                >
                  {copiedEmail ? <Check size={14} /> : <Copy size={14} />}
                  {copiedEmail ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(11, 15, 25, 0.9)',
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
              fontSize: '0.75rem',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#38bdf8')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            <span>Powered by Eclipse SUMO</span>
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
