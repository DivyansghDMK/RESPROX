// src/pages/AppPreferences.jsx
//
// Account page. It shows only what the app really knows and does: who is signed
// in, and signing out. Earlier preference controls (units, language, theme,
// reminders, device reset) were never saved or sent anywhere, so they were removed
// rather than shown as working.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import { useAuth } from '../context/AuthContext';

export default function AppPreferences() {
  const { username, logout, loginPath } = useAuth();
  const navigate = useNavigate();
  const email = localStorage.getItem('adminEmail') || '';

  const signOut = () => {
    const path = loginPath();
    logout();
    navigate(path, { replace: true });
  };

  return (
    <div className="settings-page">
      <GlassCard>
        <div className="section-title">
          <h2>Account</h2>
        </div>
        <div className="overview-stats-grid">
          <div className="overview-stat">
            <span>Signed in as</span>
            <strong>{email || username || '—'}</strong>
          </div>
        </div>
        <p style={{ margin: '16px 0 0', color: 'var(--muted)', lineHeight: 1.6 }}>
          Your account is managed by your organisation's sign-in. To change your password, use
          “Forgot password?” on the sign-in page.
        </p>
        <button type="button" className="icon-text-button" style={{ marginTop: 18 }} onClick={signOut}>
          Sign out
        </button>
      </GlassCard>
    </div>
  );
}
