// src/services/theme.js
//
// Light or dark, chosen by the person and kept in this browser. Applied as
// <html data-theme="…">; the colours live in styles.css. index.html applies
// the saved choice before the app loads, so a dark page never flashes white.

const KEY = 'resproxTheme';
const listeners = new Set();

export function readTheme() {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function setTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(KEY, next); } catch { /* private mode: this tab only */ }
  listeners.forEach((fn) => fn(next));
}

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
