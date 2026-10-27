// src/routes.jsx — route chunk registry.
//
// Two things live here on purpose:
//   1. the raw dynamic importers, so a chunk can be *warmed* (fetched and
//      parsed) before the user navigates, and
//   2. the React.lazy components built from those same importers.
//
// Keeping them together means a prefetch and the eventual render share one
// import() call — the module map dedupes it, so warming is free after the
// first hit and a warmed route mounts without ever showing a fallback.

import { lazy } from 'react';

export const loaders = {
  deviceDashboard:    () => import('./pages/DeviceDashboard'),
  deviceList:         () => import('./pages/DeviceList'),
  therapy:            () => import('./pages/Therapy'),
  trends:             () => import('./pages/Trends'),
  reports:            () => import('./pages/Reports'),
  devices:            () => import('./pages/Devices'),
  maskFit:            () => import('./pages/MaskFit'),
  settings:           () => import('./pages/Settings'),
  preferences:        () => import('./pages/AppPreferences'),
  help:               () => import('./pages/HelpSupport'),
  adminDataUpload:    () => import('./pages/AdminDataUpload'),
  forgotPassword:     () => import('./features/auth/ForgotPasswordPage'),
  doctorSignup:       () => import('./features/auth/DoctorSignupPage'),
};

// ── Prefetching ───────────────────────────────────────────────────────────────

const warmed = new Set();

/** Fetch a route's chunk ahead of time. Safe to call repeatedly. */
export function prefetch(key) {
  const loader = loaders[key];
  if (!loader || warmed.has(key)) return;
  warmed.add(key);
  // A failed prefetch must never surface as an error: the real navigation will
  // retry through Suspense and report properly there.
  loader().catch(() => warmed.delete(key));
}

/** Map a nav destination to the chunk that renders it. */
export function routeKeyForPath(path = '') {
  if (path.startsWith('/device/')) return 'deviceDashboard';
  return {
    '/dashboard': 'deviceDashboard',
    '/devices': 'deviceList',
    '/device-info': 'devices',
    '/therapy': 'therapy',
    '/trends': 'trends',
    '/reports': 'reports',
    '/mask-fit': 'maskFit',
    '/settings': 'settings',
    '/preferences': 'preferences',
    '/help': 'help',
    '/admin/upload': 'adminDataUpload',
    '/forgot-password': 'forgotPassword',
    '/doctor/login': 'doctorSignup',
    '/doctor/signup': 'doctorSignup',
  }[path];
}

const requestIdle = typeof window !== 'undefined' && window.requestIdleCallback
  ? window.requestIdleCallback
  : (cb) => setTimeout(cb, 1);

const cancelIdle = typeof window !== 'undefined' && window.cancelIdleCallback
  ? window.cancelIdleCallback
  : clearTimeout;

/**
 * Warm a set of chunks one at a time while the main thread is idle.
 * Sequential on purpose — firing every import at once competes with the
 * requests the visible page is already making.
 */
export function prefetchWhenIdle(keys) {
  const queue = keys.filter((key) => loaders[key] && !warmed.has(key));
  let handle;
  let cancelled = false;

  const step = () => {
    if (cancelled) return;
    const key = queue.shift();
    if (!key) return;
    prefetch(key);
    handle = requestIdle(step);
  };

  handle = requestIdle(step);
  return () => { cancelled = true; cancelIdle(handle); };
}

// ── Lazy components ───────────────────────────────────────────────────────────

export const DeviceDashboard    = lazy(loaders.deviceDashboard);
export const DeviceList         = lazy(loaders.deviceList);
export const Therapy            = lazy(loaders.therapy);
export const Trends             = lazy(loaders.trends);
export const Reports            = lazy(loaders.reports);
export const Devices            = lazy(loaders.devices);
export const MaskFit            = lazy(loaders.maskFit);
export const Settings           = lazy(loaders.settings);
export const AppPreferences     = lazy(loaders.preferences);
export const HelpSupport        = lazy(loaders.help);
export const AdminDataUpload    = lazy(loaders.adminDataUpload);
export const ForgotPassword     = lazy(loaders.forgotPassword);
export const DoctorSignup       = lazy(loaders.doctorSignup);
