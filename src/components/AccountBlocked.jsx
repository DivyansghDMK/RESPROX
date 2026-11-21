// src/components/AccountBlocked.jsx
//
// Shown instead of the app when GET /me says the signed-in Cognito user is
// disabled (403) or has no user row yet (404). Without it the app would fall
// back to the token's role, and an account in no Cognito group counts as admin.
// No automatic sign-out: dev and team browsers sign themselves back in, which
// would loop. The user signs out, or retries once an admin has fixed the account.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const COPY = {
  disabled: {
    title: 'Account disabled',
    body: 'Your Resprox account has been disabled. Ask your administrator to turn it back on.',
  },
  unprovisioned: {
    title: 'Account not set up yet',
    body: 'You are signed in, but your account has not been added to Resprox yet. Ask your administrator to add it, then try again.',
  },
};

export default function AccountBlocked({ reason, onRetry }) {
  const { logout, loginPath, username } = useAuth();
  const navigate = useNavigate();
  const { title, body } = COPY[reason] || COPY.unprovisioned;

  const signOut = () => {
    const path = loginPath();
    logout();
    navigate(path, { replace: true });
  };

  return (
    <div className="auth-container">
      <div className="auth-glass-panel" role="alert">
        <div className="auth-header">
          <h2 className="auth-title">{title}</h2>
          <p className="auth-subtitle">{body}</p>
          {username && <p className="auth-notice" style={{ overflowWrap: 'anywhere' }}>Signed in as {username}</p>}
        </div>
        <button type="button" className="auth-submit-btn" onClick={signOut}>Sign out</button>
        {onRetry && (
          <button type="button" className="auth-submit-btn" style={{ marginTop: 10, background: 'transparent', color: 'var(--accent)', boxShadow: 'none' }} onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
