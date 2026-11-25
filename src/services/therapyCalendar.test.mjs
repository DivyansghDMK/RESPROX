import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarSummary, calendarWindow, dayStatus, shiftKey } from './therapyCalendar.js';

test('shiftKey crosses months', () => {
  assert.equal(shiftKey('2026-11-01', -1), '2026-10-31');
  assert.equal(shiftKey('2026-12-31', 1), '2027-01-01');
});

test('every one of the 30 dates is there, coloured by use', () => {
  const byDay = calendarSummary([
    { dayKey: '2026-11-24', ahi: 6.8, sessionCount: 2, report: { usageMinutes: 399, leak: 28 } },
    { dayKey: '2026-11-20', ahi: 1.2, sessionCount: 1, report: { usageMinutes: 90, leak: 0 } },
    { timestamp: new Date('2026-11-10T22:00:00').getTime(), usage_hours: 5, ahi: 2 },
  ]);
  const w = calendarWindow(byDay, '2026-11-24');
  assert.equal(w.cells.length, 30);
  assert.equal(w.cells[0].key, '2026-10-26');
  assert.equal(w.cells[29].key, '2026-11-24');
  assert.equal(w.cells[29].status, 'met');
  assert.equal(w.cells[29].highAhi, true);
  assert.equal(w.cells.find((c) => c.key === '2026-11-20').status, 'low');
  assert.equal(w.cells.find((c) => c.key === '2026-11-10').status, 'met');
  assert.equal(w.cells.find((c) => c.key === '2026-11-21').status, 'none');
  assert.deepEqual([w.used, w.met, w.low, w.none, w.compliance], [3, 2, 1, 27, 7]);
});

test('a day with no minutes counts as no therapy', () => {
  assert.equal(dayStatus({ minutes: 0 }), 'none');
  assert.equal(dayStatus({ minutes: 240 }), 'met');
});
