// src/services/userActivity.js
//
// Whether someone is actually using this tab. A screen left open on a desk
// still counts as "visible", and polling it every few seconds all day keeps the
// database awake for nobody; live loops slow down once nobody has touched the
// page for a while.

const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
let lastActivity = Date.now();
let listening = false;

function mark() { lastActivity = Date.now(); }

function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  EVENTS.forEach((e) => window.addEventListener(e, mark, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') mark(); });
}

/** No pointer, key or scroll on this tab for `ms`. */
export function idleFor(ms) {
  listen();
  return Date.now() - lastActivity > ms;
}

/** After 5 minutes untouched, live views check once a minute instead of every few seconds. */
export const IDLE_AFTER_MS = 5 * 60_000;
export const IDLE_CHECK_MS = 60_000;
