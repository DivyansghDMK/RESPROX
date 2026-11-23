// src/context/AccessContext.jsx
//
// The signed-in user's role and what it allows, for every screen. GET /me is
// read once per sign-in: role, organisation, organisation roles, the dealer's
// devices and the IP the server sees (services/account.js reads every server
// version). The rules themselves live in services/access.js.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { useTherapy } from './TherapyContext';
import { readTokenClaims } from '../services/respireeAuth';
import { permissionsFor, roleFromClaims, ROLES } from '../services/access';
import { partnersAPI } from '../services/partnersApi';
import { request } from '../services/respireeApi';
import { parseMe } from '../services/account';

// `npm run dev` only: view the app as a dealer before dealer logins exist.
const PREVIEW_ROLE_KEY = 'resproxPreviewRole';

function readPreviewRole() {
  if (!import.meta.env.DEV) return null;
  try {
    return JSON.parse(localStorage.getItem(PREVIEW_ROLE_KEY) || 'null');
  } catch {
    return null;
  }
}

const AccessContext = createContext(null);

export function AccessProvider({ children }) {
  const { token, isAuthenticated } = useAuth();
  const { adminActiveSerial, setAdminActiveSerial } = useTherapy();
  const [previewRole, setPreviewRoleState] = useState(readPreviewRole);
  const [me, setMe] = useState(null);
  const [meState, setMeState] = useState('idle'); // idle | loading | ready | error | disabled | unprovisioned

  const tokenRole = roleFromClaims(token ? readTokenClaims(token) : {});

  const [meError, setMeError] = useState(null);
  const loadMe = useCallback(async () => {
    if (!isAuthenticated) {
      setMe(null);
      setMeState('idle');
      return;
    }
    setMeState('loading');
    setMeError(null);
    try {
      // Dev preview of a dealer reads the preview store; everyone else the server.
      setMe(previewRole ? await partnersAPI.me(previewRole.dealerId) : await request('/me'));
      setMeState('ready');
    } catch (err) {
      setMe(null);
      setMeError(err);
      // 403: the user row is disabled. 404: no user row for this Cognito sub.
      // Neither may fall back to the token's role (no group reads as admin).
      setMeState(err?.status === 403 ? 'disabled' : err?.status === 404 && !previewRole ? 'unprovisioned' : 'error');
    }
  }, [isAuthenticated, previewRole]);

  useEffect(() => { loadMe(); }, [loadMe]);

  const account = useMemo(() => parseMe(me, tokenRole), [me, tokenRole]);
  const blocked = meState === 'disabled' || meState === 'unprovisioned' ? meState : null;
  const role = blocked ? null : previewRole?.role || account.role;
  const dealer = role === ROLES.DEALER ? account.dealer : null;

  const permissions = useMemo(
    () => permissionsFor(role, dealer ? dealer.device_serials : []),
    [role, dealer],
  );

  // A dealer must not land on a device that isn't theirs through a serial
  // remembered from an earlier session.
  useEffect(() => {
    if (permissions.isDealer && meState === 'ready' && adminActiveSerial
      && !permissions.canSeeDevice(adminActiveSerial)) {
      setAdminActiveSerial(null);
    }
  }, [permissions, meState, adminActiveSerial, setAdminActiveSerial]);

  const setPreviewRole = useCallback((next) => {
    if (!import.meta.env.DEV) return;
    try {
      if (next) localStorage.setItem(PREVIEW_ROLE_KEY, JSON.stringify(next));
      else localStorage.removeItem(PREVIEW_ROLE_KEY);
    } catch {
      // Storage blocked: the view lasts until the page reloads.
    }
    setPreviewRoleState(next);
  }, []);

  const value = useMemo(() => ({
    ...permissions,
    dealer,
    org: account.org,
    orgRoles: account.orgRoles,
    // A dealer's account is still loading (or failed): screens wait instead
    // of briefly showing "not your device".
    dealerLoading: permissions.isDealer && (meState === 'loading' || meState === 'idle'),
    dealerError: permissions.isDealer && meState === 'error',
    // The account itself couldn't be read (network, server): shown with retry
    // instead of quietly running with no devices.
    accountError: meState === 'error' ? meError : null,
    // Until the account answers once, the app waits rather than running on
    // the role in the sign-in token.
    accountLoading: isAuthenticated && (meState === 'idle' || meState === 'loading') && !me,
    reloadDealer: loadMe,
    previewRole,
    setPreviewRole,
    clientIp: account.ip,
    accountBlocked: blocked,
  }), [permissions, dealer, account, meState, meError, me, isAuthenticated, blocked, loadMe, previewRole, setPreviewRole]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error('useAccess must be used within an AccessProvider');
  return ctx;
}
