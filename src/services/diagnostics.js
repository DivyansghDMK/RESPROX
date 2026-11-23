// src/services/diagnostics.js
//
// What a DeckMount service engineer needs to report a failure to the backend
// team: which request failed, how, when, on which device, in which build.
//
//   errorReport()      one failure as copyable text
//   recordFailure()    called by the API client for every failed request
//   recentFailures()   the last few, for Help & Support
//
// Kept in memory and in sessionStorage only: it holds request paths and
// serials, never tokens or request bodies.

/* global __APP_BUILD__, __APP_BUILT_AT__ */
export const BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev';
export const BUILT_AT = typeof __APP_BUILT_AT__ !== 'undefined' ? __APP_BUILT_AT__ : '';

const KEY = 'resproxRecentFailures';
const MAX = 25;

function load() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

let failures = load();
const listeners = new Set();

/** One line per failed request: method, path, status or code, message, time. */
export function recordFailure(err) {
  const entry = {
    at: err?.at || new Date().toISOString(),
    method: err?.method || 'GET',
    path: err?.path || '',
    status: err?.status ?? null,
    code: err?.code || null,
    message: String(err?.message || err || '').slice(0, 300),
    page: typeof window !== 'undefined' ? window.location.pathname : '',
  };
  failures = [entry, ...failures].slice(0, MAX);
  try { sessionStorage.setItem(KEY, JSON.stringify(failures)); } catch { /* storage full or blocked */ }
  listeners.forEach((fn) => fn(failures));
}

export function recentFailures() {
  return failures;
}

export function onFailuresChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearFailures() {
  failures = [];
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  listeners.forEach((fn) => fn(failures));
}

function localTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : `${d.toLocaleString('en-GB')} (${d.toISOString()})`;
}

/** How the failure reads in the details list: "HTTP 503", "No answer (timeout)". */
export function failureKind(err) {
  if (err?.status) return `HTTP ${err.status}${err.statusText ? ` ${err.statusText}` : ''}`;
  if (err?.code === 'TIMEOUT') return 'No answer in time (timeout)';
  if (err?.code === 'NETWORK') return 'No connection to the server (network or CORS)';
  if (err?.code) return err.code;
  return err?.name || 'Error';
}

/** The fields shown under "Technical details", in order. */
export function errorFacts(err, { action, subject } = {}) {
  return [
    ['What failed', action || null],
    ['Device', subject || err?.serial || null],
    ['Request', err?.path ? `${err.method || 'GET'} ${err.path}` : null],
    ['Result', failureKind(err)],
    ['Message', err?.message ? String(err.message).slice(0, 300) : null],
    ['When', localTime(err?.at || new Date().toISOString())],
    ['Page', typeof window !== 'undefined' ? window.location.pathname : null],
    ['App build', `${BUILD}${BUILT_AT ? ` (${BUILT_AT})` : ''}`],
  ].filter(([, v]) => v);
}

/** The text "Copy for backend" puts on the clipboard. */
export function errorReport(err, opts = {}) {
  const lines = errorFacts(err, opts).map(([k, v]) => `${k}: ${v}`);
  const online = typeof navigator !== 'undefined' ? (navigator.onLine ? 'yes' : 'no') : 'unknown';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return ['Resprox error report', ...lines, `Browser online: ${online}`, `Browser: ${ua}`].join('\n');
}

/** Copy text; true when it worked. Falls back for browsers without the API. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
