import assert from 'node:assert/strict';
import { presetRange } from './reportRange.js';

const one = { start: '2026-10-30', end: '2026-10-30' };
assert.deepEqual(presetRange(1, one), { start: '2026-10-30', end: '2026-10-30' });
assert.deepEqual(presetRange(7, one), { start: '2026-10-24', end: '2026-10-30' });
assert.deepEqual(presetRange(30, one), { start: '2026-10-01', end: '2026-10-30' });
assert.deepEqual(presetRange(90, one), { start: '2026-08-02', end: '2026-10-30' });
assert.deepEqual(presetRange('all', { start: '2026-03-15', end: '2026-04-21' }), { start: '2026-03-15', end: '2026-04-21' });
// Across a month and year boundary.
assert.deepEqual(presetRange(7, { start: '2025-12-01', end: '2026-01-03' }), { start: '2025-12-28', end: '2026-01-03' });
assert.equal(presetRange(7, { start: '', end: '' }), null);
console.log('reportRange: ok');
