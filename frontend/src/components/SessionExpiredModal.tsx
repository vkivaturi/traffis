import React, { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import type { User } from '../types/auth';
import { GoogleSignInModal } from './GoogleSignInModal';

interface SessionExpiredModalProps {
  onSignIn: (user?: Partial<User>) => void;
}

/** Blocking prompt shown when the server rejects the Google session token. */
export const SessionExpiredModal: React.FC<SessionExpiredModalProps> = ({ onSignIn }) => {
  const [isSigningIn, setIsSigningIn] = useState(false);

  return (
    <>
      <div
        role="alertdialog"
        aria-labelledby="session-expired-title"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(3, 7, 18, 0.82)',
          backdropFilter: 'blur(12px)',
          padding: '20px',
        }}
      >
        <div
          className="glass-panel"
          style={{
            width: '100%',
            maxWidth: '400px',
            padding: '28px 26px',
            textAlign: 'center',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '16px',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              margin: '0 auto 14px',
              borderRadius: '12px',
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LockKeyhole size={22} color="#f59e0b" />
          </div>
          <h2 id="session-expired-title" style={{ margin: '0 0 8px', fontSize: '1.1rem', color: '#f8fafc' }}>
            Your sign-in has expired
          </h2>
          <p style={{ margin: '0 0 22px', fontSize: '0.85rem', lineHeight: 1.5, color: '#94a3b8' }}>
            The live simulation connection was closed because your Google session has expired. Sign in again to
            continue.
          </p>
          <button
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => setIsSigningIn(true)}
          >
            Sign in again
          </button>
        </div>
      </div>

      <GoogleSignInModal isOpen={isSigningIn} onClose={() => setIsSigningIn(false)} onSignIn={onSignIn} />
    </>
  );
};
