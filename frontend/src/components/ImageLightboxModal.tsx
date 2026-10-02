import React from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export interface ScreenshotItem {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  tag: string;
  tagColor: string;
  imageSrc: string;
  specs: string[];
}

interface ImageLightboxModalProps {
  isOpen: boolean;
  screenshot: ScreenshotItem | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  screenshot,
  onClose,
  onPrev,
  onNext,
}) => {
  if (!isOpen || !screenshot) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 110,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(3, 7, 18, 0.92)',
        backdropFilter: 'blur(20px)',
        padding: '24px',
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
          maxWidth: '1000px',
          maxHeight: '92vh',
          background: 'rgba(11, 15, 25, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '16px',
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.8), 0 0 50px rgba(56, 189, 248, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '6px',
                backgroundColor: `${screenshot.tagColor}22`,
                color: screenshot.tagColor,
                border: `1px solid ${screenshot.tagColor}44`,
              }}
            >
              {screenshot.tag}
            </span>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
              {screenshot.title}
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={onPrev} className="btn-icon" title="Previous screenshot (Left arrow)">
              <ChevronLeft size={18} />
            </button>
            <button onClick={onNext} className="btn-icon" title="Next screenshot (Right arrow)">
              <ChevronRight size={18} />
            </button>
            <button onClick={onClose} className="btn-icon" title="Close (ESC)">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Image Container */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000000',
            position: 'relative',
            overflow: 'hidden',
            maxHeight: '560px',
          }}
        >
          <img
            src={screenshot.imageSrc}
            alt={screenshot.title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </div>

        {/* Footer info */}
        <div
          style={{
            padding: '16px 24px',
            background: 'rgba(15, 23, 42, 0.95)',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5' }}>
            {screenshot.description}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
            {screenshot.specs.map((spec, i) => (
              <span
                key={i}
                style={{
                  fontSize: '0.72rem',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: '#94a3b8',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                • {spec}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
