// src/pages/AppPreferences.jsx
//
// Account page. It shows only what the app really knows and does: who is signed
// in, and signing out. Earlier preference controls (units, language, theme,
// reminders, device reset) were never saved or sent anywhere, so they were removed
// rather than shown as working.

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import { useAuth } from '../context/AuthContext';
import { useAccess } from '../context/AccessContext';
import { partnersAPI } from '../services/partnersApi';

// On phones the sidebar is hidden, so this page (the "More" tab) links to the
// pages the bottom bar has no room for. Hidden on wider screens.
const MORE_PAGES = [
  { label: 'Dealers', path: '/admin/dealers', show: (a) => a.manageDealers },
  { label: 'Customers', path: '/customers', show: (a) => a.manageCustomers },
  { label: 'Trends', path: '/trends' },
  { label: 'Upload Data', path: '/admin/upload' },
  { label: 'Mask Fit', path: '/mask-fit' },
  { label: 'Settings', path: '/settings' },
  { label: 'Calibration', path: '/calibration', show: (a) => a.calibrate },
  { label: 'Help & Support', path: '/help' },
];

const ROLE_LABEL = { admin: 'Admin', dealer: 'Dealer', doctor: 'Doctor' };

/**
 * `npm run dev` only: see the app as one of the dealers, to check what a
 * dealer can and can't do before dealer logins exist.
 */
function PreviewRoleCard() {
  const access = useAccess();
  const [dealers, setDealers] = useState(null);
  useEffect(() => {
    partnersAPI.listDealers().then(setDealers, () => setDealers([]));
  }, []);

  const value = access.previewRole?.role === 'dealer' ? access.previewRole.dealerId : '';
  const choose = (e) => {
    const dealerId = e.target.value;
    access.setPreviewRole(dealerId ? { role: 'dealer', dealerId } : null);
  };

  return (
    <GlassCard style={{ marginTop: 20 }}>
      <div className="section-title">
        <h2>View as (local dev only)</h2>
      </div>
      <p style={{ margin: '0 0 12px', color: 'var(--muted)', lineHeight: 1.6 }}>
        See the app the way a dealer will. Only in <code>npm run dev</code>; the live site always uses the signed-in account.
      </p>
      <select className="partner-filter" value={value} onChange={choose} aria-label="View the app as">
        <option value="">Admin (you)</option>
        {(dealers || []).map((d) => <option key={d.id} value={d.id}>Dealer: {d.name}</option>)}
      </select>
      {dealers && !dealers.length && (
        <p style={{ margin: '10px 0 0', color: 'var(--muted)', fontSize: 13 }}>Add a dealer on the Dealers page first.</p>
      )}
    </GlassCard>
  );
}

export default function AppPreferences() {
  const { username, logout, loginPath } = useAuth();
  const access = useAccess();
  const navigate = useNavigate();
  const email = localStorage.getItem('adminEmail') || '';

  const signOut = () => {
    const path = loginPath();
    logout();
    navigate(path, { replace: true });
  };

  return (
    <div className="settings-page">
      <GlassCard className="more-pages-card">
        <div className="section-title">
          <h2>More</h2>
        </div>
        <nav className="more-pages">
          {MORE_PAGES.filter((p) => !p.show || p.show(access)).map(({ label, path }) => (
            <Link key={path} to={path} className="more-pages-link">
              <span>{label}</span>
              <span aria-hidden="true">›</span>
            </Link>
          ))}
        </nav>
      </GlassCard>

      <GlassCard>
        <div className="section-title">
          <h2>Account</h2>
        </div>
        <div className="overview-stats-grid">
          <div className="overview-stat">
            <span>Signed in as</span>
            <strong>{email || username || '—'}</strong>
          </div>
          <div className="overview-stat">
            <span>Role</span>
            <strong>{ROLE_LABEL[access.role] || access.role}{access.isDealer && access.dealer ? ` · ${access.dealer.name}` : ''}</strong>
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

      {import.meta.env.DEV && (access.isAdmin || access.previewRole) && <PreviewRoleCard />}
    </div>
  );
}
