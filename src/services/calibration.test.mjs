import { test } from 'node:test';
import assert from 'node:assert/strict';
import { permissionsFor } from './access.js';
import { formatSteps, recordStep, requestFor, stepKey, stepSummary } from './calibration.js';

// Bodies exactly as in the backend's calibration API (2026-11-12).
test('each step sends the body the API expects', () => {
  assert.deepEqual(requestFor('start'), { action: 'START' });
  assert.deepEqual(requestFor('save'), { action: 'SAVE' });
  assert.deepEqual(requestFor('increment', 'linear'), { action: 'INCREMENT', type: 'linear' });
  assert.deepEqual(requestFor('decrement', 'linear', 9), { action: 'DECREMENT', type: 'linear' });
  assert.deepEqual(requestFor('increment', 'nonlinear', 4), { action: 'INCREMENT', type: 'nonlinear', pressure: 4 });
  assert.deepEqual(requestFor('decrement', 'nonlinear', 25), { action: 'DECREMENT', type: 'nonlinear', pressure: 25 });
});

test('non-linear needs a whole pressure from 4 to 25', () => {
  for (const p of [3, 26, 4.5, undefined]) assert.throws(() => requestFor('increment', 'nonlinear', p), /4–25/);
  assert.throws(() => requestFor('increment', undefined, 4), /method/);
  assert.throws(() => requestFor('reset'), /Unknown/);
});

test('presses are counted per point and cancel out', () => {
  let s = recordStep({}, stepKey('linear'), 1);
  s = recordStep(s, stepKey('nonlinear', 12), -1);
  s = recordStep(s, stepKey('nonlinear', 4), 1);
  assert.deepEqual(stepSummary(s).map((x) => [x.label, x.net]), [
    ['Linear', 1], ['Non-linear at 4 cmH₂O', 1], ['Non-linear at 12 cmH₂O', -1],
  ]);
  s = recordStep(s, 'linear', -1);
  assert.equal('linear' in s, false);
  assert.equal(formatSteps(-2), '−2 steps');
  assert.equal(formatSteps(1), '+1 step');
});

test('only admin may calibrate', () => {
  assert.equal(permissionsFor('admin').calibrate, true);
  assert.equal(permissionsFor('dealer', []).calibrate, false);
  assert.equal(permissionsFor('doctor').calibrate, false);
});
