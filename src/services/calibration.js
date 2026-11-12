// src/services/calibration.js
//
// Pressure calibration, following the firmware's "Calibration Commands
// Specification" (opcode 0x14) and the backend route in calibrationApi.js.
// Pure functions, so the rules are tested once.
//
// Order on the device: START first (the device ACKs it), then linear or
// non-linear increment / decrement steps, then SAVE, which writes everything
// to flash (the device ACKs it). The step size is the firmware's own; the
// website only counts presses.

export const CALIBRATION_METHODS = {
  linear: { label: 'Linear', note: 'One baseline offset/gain for the whole pressure range.' },
  nonlinear: { label: 'Non-linear', note: 'Adjusts the lookup table at one target pressure at a time.' },
};

/** Target pressures the server accepts for non-linear points, in cmH₂O. */
export const NONLINEAR_MIN = 4;
export const NONLINEAR_MAX = 25;

export function validPressure(p) {
  return Number.isInteger(p) && p >= NONLINEAR_MIN && p <= NONLINEAR_MAX;
}

/**
 * The request body for one step.
 * action: 'start' | 'save' | 'increment' | 'decrement'
 */
export function requestFor(action, method, pressure) {
  if (action === 'start' || action === 'save') return { action: action.toUpperCase() };
  if (action !== 'increment' && action !== 'decrement') throw new Error(`Unknown calibration action: ${action}`);
  if (method === 'linear') return { action: action.toUpperCase(), type: 'linear' };
  if (method !== 'nonlinear') throw new Error(`Unknown calibration method: ${method}`);
  if (!validPressure(pressure)) throw new Error(`Pressure must be ${NONLINEAR_MIN}–${NONLINEAR_MAX} cmH₂O.`);
  return { action: action.toUpperCase(), type: 'nonlinear', pressure };
}

// ── press counting, so the screen shows what was sent ──

export const stepKey = (method, pressure) => (method === 'linear' ? 'linear' : `nl:${pressure}`);

/** Net presses per point: { linear: 2, 'nl:4': -1 }. Zero entries are dropped. */
export function recordStep(steps, key, delta) {
  const next = { ...steps, [key]: (steps[key] || 0) + delta };
  if (next[key] === 0) delete next[key];
  return next;
}

/** Points that were touched, for the save summary. */
export function stepSummary(steps) {
  return Object.entries(steps)
    .map(([key, net]) => ({
      key,
      label: key === 'linear' ? 'Linear' : `Non-linear at ${key.slice(3)} cmH₂O`,
      net,
      pressure: key === 'linear' ? null : Number(key.slice(3)),
    }))
    .sort((a, b) => (a.pressure ?? -1) - (b.pressure ?? -1));
}

export const formatSteps = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)} step${Math.abs(n) === 1 ? '' : 's'}`;
