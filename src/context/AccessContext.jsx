// src/context/AccessContext.jsx
//
// The signed-in user's role and what it allows, for every screen. A dealer's
// device list comes from GET /me; the rules themselves live in services/access.js.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { useTherapy } from './TherapyContext';
import { readTokenClaims } from '../services/respireeAuth';
import { permissionsFor, roleFromClaims, ROLES } from '../services/access';
import { partnersAPI } from '../services/partnersApi';

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
  const [dealer, setDealer] = useState(null);
  const [dealerState, setDealerState] = useState('idle'); // idle | loading | ready | error

  const role = previewRole?.role || roleFromClaims(token ? readTokenClaims(token) : {});

  const loadDealer = useCallback(async () => {
    if (!isAuthenticated || role !== ROLES.DEALER) {
      setDealer(null);
      setDealerState('idle');
      return;
    }
    setDealerState('loading');
    try {
      const me = await partnersAPI.me(previewRole?.dealerId);
      setDealer(me?.dealer || null);
      setDealerState('ready');
    } catch {
      setDealer(null);
      setDealerState('error');
    }
  }, [isAuthenticated, role, previewRole]);

  useEffect(() => { loadDealer(); }, [loadDealer]);

  const permissions = useMemo(
    () => permissionsFor(role, dealer?.device_serials || []),
    [role, dealer],
  );

  // A dealer must not land on a device that isn't theirs through a serial
  // remembered from an earlier session.
  useEffect(() => {
    if (permissions.isDealer && dealerState === 'ready' && adminActiveSerial
      && !permissions.canSeeDevice(adminActiveSerial)) {
      setAdminActiveSerial(null);
    }
  }, [permissions, dealerState, adminActiveSerial, setAdminActiveSerial]);

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
    // A dealer's device list is still loading (or failed): screens wait instead
    // of briefly showing "not your device".
    dealerLoading: permissions.isDealer && (dealerState === 'loading' || dealerState === 'idle'),
    dealerError: permissions.isDealer && dealerState === 'error',
    reloadDealer: loadDealer,
    previewRole,
    setPreviewRole,
  }), [permissions, dealer, dealerState, loadDealer, previewRole, setPreviewRole]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error('useAccess must be used within an AccessProvider');
  return ctx;
}
