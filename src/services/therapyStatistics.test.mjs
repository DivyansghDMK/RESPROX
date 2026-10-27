import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTherapyStatistics, buildComplianceCheck } from './therapyStatistics.js';

/** A report-session row for `y-m-d`, in the shape respireeApi builds. */
function night(y, m, d, hours, { csa = 0, osa = 0, hsa = 0, leak = 10, pressure = 8 } = {}) {
  const timestamp = new Date(y, m - 1, d, 22, 0).getTime();
  const events = csa + osa + hsa;
  return {
    type: 'REPORT_DAY', timestamp, usage_hours: hours,
    ahi: hours > 0 ? events / hours : 0, mask_leak: leak, pressure_95: pressure,
    raw: { csa, osa, hsa, events },
  };
}

function run(fromDay, count, hoursFor) {
  return Array.from({ length: count }, (_, i) => night(2026, 1, fromDay + i, hoursFor(i)));
}

test('no data yields null rather than zeros', () => {
  assert.equal(buildTherapyStatistics([]), null);
  assert.equal(buildComplianceCheck([]), null);
});

test('indices are pooled over hours, not averaged per night', () => {
  const stats = buildTherapyStatistics([
    night(2026, 1, 1, 8, { osa: 8 }),            // 1 /h over 8 h
    night(2026, 1, 2, 0.5, { osa: 5, csa: 5 }),  // 20 /h over 30 min
  ]);
  const week = stats.periods.find((p) => p.key === 'week');
  assert.equal(week.ahi, 18 / 8.5);
  assert.equal(week.osaIndex, 13 / 8.5);
  assert.equal(week.csaIndex, 5 / 8.5);
  assert.equal(week.hsaIndex, 0);
});

test('periods anchor on the last recorded day and clip to the first', () => {
  const stats = buildTherapyStatistics(run(1, 10, () => 6));
  const month = stats.periods.find((p) => p.key === 'month');
  assert.equal(month.periodDays, 10);
  assert.equal(month.clipped, true);
  assert.equal(month.compliantPct, 100);
  assert.equal(stats.periods.find((p) => p.key === 'week').periodDays, 7);
  assert.equal(stats.periods.find((p) => p.key === 'day').periodDays, 1);
});

test('missing nights inside a period count against compliance', () => {
  const rows = [night(2026, 1, 1, 6), night(2026, 1, 4, 6)];
  const week = buildTherapyStatistics(rows).periods.find((p) => p.key === 'week');
  assert.equal(week.periodDays, 4);
  assert.equal(week.usedDays, 2);
  assert.equal(week.compliantPct, 50);
});

test('the event split is withheld when a night lacks it', () => {
  const live = { type: 'LIVE', timestamp: new Date(2026, 0, 2, 22).getTime(), usage_hours: 5, ahi: 2 };
  const week = buildTherapyStatistics([night(2026, 1, 1, 5, { osa: 5 }), live]).periods.find((p) => p.key === 'week');
  assert.equal(week.ahi, 15 / 10);
  assert.equal(week.osaIndex, null);
});

test('21 compliant nights in a 30-day window meets the rule', () => {
  const check = buildComplianceCheck(run(1, 30, (i) => (i < 21 ? 5 : 2)));
  assert.equal(check.initial.status, 'met');
  assert.equal(check.initial.bestWindow.compliantNights, 21);
});

test('20 nights is still in progress before day 90', () => {
  const check = buildComplianceCheck(run(1, 30, (i) => (i < 20 ? 5 : 2)));
  assert.equal(check.initial.status, 'in-progress');
});

test('not met once 90 days pass without a passing window', () => {
  // Every third night compliant: at most 10 in any 30-day window.
  const rows = Array.from({ length: 90 }, (_, i) => night(2026, 1, 1 + i, i % 3 === 0 ? 5 : 1));
  const check = buildComplianceCheck(rows);
  assert.equal(check.initial.status, 'not-met');
  assert.equal(check.initial.bestWindow.compliantNights, 10);
  assert.equal(check.recent.met, false);
});
