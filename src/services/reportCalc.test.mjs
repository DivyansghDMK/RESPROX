import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportData, fmtHM, pct, percentile } from './reportCalc.js';
import { parseReportRows } from './reportFileParser.js';
import { buildTherapyReportHTML } from './therapyReport.js';

const day = (dayKey, report) => ({ dayKey, timestamp: new Date(`${dayKey}T22:00:00`).getTime(), report });
const rep = (usageMinutes, maxPressure, csa, osa, hsa, leaks, extra = {}) => ({
  usageMinutes, maxPressure, csa, osa, hsa, leak: Math.max(0, ...leaks), leaks, tidal: 0, resp: 0, minuteVent: 0, modeCode: 2, ...extra,
});

// Three used days in a 13-day range, like the sample report (06–18 Mar 2022).
const rows = [
  day('2022-03-06', rep(470, 19.1, 4, 12, 9, [20])),
  day('2022-03-08', rep(989, 14.2, 3, 16, 10, [1])),
  day('2022-03-18', rep(460, 10.8, 5, 12, 14, [8])),
];
const data = buildReportData({ rows, startDate: '2022-03-06', endDate: '2022-03-18' });

test('helpers follow the app', () => {
  assert.equal(fmtHM(450), '07 Hours, 30 Minutes');
  assert.equal(pct(15, 30), 50);
  assert.equal(pct(3, 13), 23);
  assert.equal(percentile([10.8, 14.2, 19.1], 0.95), 14.2);
  assert.ok(Number.isNaN(percentile([], 0.5)));
});

test('usage statistics', () => {
  const u = data.usage;
  assert.equal(data.days.length, 13);
  assert.equal(u.totalDays, 13);
  assert.equal(u.usedDays, 3);
  assert.equal(u.usedPct, 23);
  assert.equal(u.over4hDays, 3);
  assert.equal(u.under4hDays, 0);
  assert.equal(u.totalMinutes, 1919);
  assert.equal(fmtHM(u.totalMinutes), '31 Hours, 59 Minutes');
  assert.equal(fmtHM(u.avgTotalDaysMin), '02 Hours, 27 Minutes');
  assert.equal(fmtHM(u.avgUsedDaysMin), '10 Hours, 39 Minutes');
  assert.equal(fmtHM(u.medianUsedDaysMin), '07 Hours, 50 Minutes');
});

test('event indices are events over total hours, AHI = AI + HI', () => {
  const hours = 1919 / 60;
  const e = data.events;
  assert.equal(e.central.toFixed(3), (12 / hours).toFixed(3));
  assert.equal(e.obstructive.toFixed(3), (40 / hours).toFixed(3));
  assert.equal(e.hi.toFixed(3), (33 / hours).toFixed(3));
  assert.equal(e.ai, e.central + e.obstructive);
  assert.equal(e.ahi, e.ai + e.hi);
  assert.equal(e.unknown, 0);
});

test('pressure percentiles, leak average and empty days', () => {
  assert.deepEqual(data.pressure, { max: 19.1, p95: 14.2, median: 14.2 });
  assert.equal(data.avgLeak.toFixed(1), '9.7');
  const empty = data.days.find((d) => d.key === '2022-03-07');
  assert.equal(empty.hours, 0);
  assert.equal(empty.ahi, 0);
});

test('no usage gives zero indices, not a division by zero', () => {
  const d = buildReportData({ rows: [], startDate: '2022-03-01', endDate: '2022-03-02' });
  assert.equal(d.usage.totalDays, 2);
  assert.equal(d.events.ahi, 0);
});

test('rows without session detail are rebuilt from hours and AHI', () => {
  const d = buildReportData({ rows: [{ timestamp: new Date('2022-03-06T22:00:00').getTime(), usage_hours: 6, ahi: 2, mask_leak: 10, pressure_95: 9 }] });
  assert.equal(d.usage.totalMinutes, 360);
  assert.equal(d.events.ahi, 2);
  assert.ok(Number.isNaN(d.events.ai)); // no CSA/OSA/HSA split
  assert.equal(d.pressure.max, 9);
});

test('the parser adds each day as the report counts it', () => {
  // 23:00 → 06:30 is 450 minutes; leak 130 is a status code, not a reading.
  const row = (o) => ({
    device_id: 'CVT1', start_day: 3, start_month: 7, start_year: 26, start_hour: 23, start_minute: 0,
    end_day: 4, end_month: 7, end_year: 26, end_hour: 6, end_minute: 30, mode: 2, max_pressure: 12, min_pressure: 6,
    ipap: 0, epap: 0, csa_count: 1, osa_count: 2, hsa_count: 3, leak: 20, tidal_volume: 500, resp_rate: 14, ...o,
  });
  const { days } = parseReportRows([row({}), row({ start_hour: 23, start_minute: 50, end_hour: 23, end_minute: 55, leak: 130, max_pressure: 14 })]);
  assert.equal(days.length, 1);
  const r = days[0].report;
  assert.equal(r.usageMinutes, 455);
  assert.equal(r.maxPressure, 14);
  assert.equal(r.leak, 20);
  assert.deepEqual(r.leaks, [20]);
  assert.equal(r.csa + r.osa + r.hsa, 12);
  assert.equal(r.minuteVent, 7);
});

test('the report follows the app layout', () => {
  const html = buildTherapyReportHTML({ deviceData: { serial: 'CVT1', settings: { pressure: 10.8, aflex: 3, mask_type: 1 } }, sessions: rows, startDate: '2022-03-06', endDate: '2022-03-18' });
  assert.match(html, /Therapy Report \(06 Mar 2022 - 18 Mar 2022\)/);
  assert.match(html, /<span>Mode<\/span><span>AUTO<\/span>/);
  assert.match(html, /<span>Set Pressure<\/span><span>10\.8<\/span>/);
  assert.match(html, /<span>A-Flex Level<\/span><span>3<\/span>/);
  assert.match(html, /<span>Mask Type<\/span><span>Full Face<\/span>/);
  assert.match(html, /Usage days<\/span><span>3\/13 Days \(23%\)/);
  assert.doesNotMatch(html, /Compliance|Statistics/);
  const order = ['Pressure (cmH2O)', 'Usage (Hours)', '<h2>Leak', 'AHI (Events/Hour)'].map((t) => html.indexOf(t));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.equal((html.match(/<svg class="chart"/g) || []).length, 4);
});

test('a BiPAP report adds the ventilation page', () => {
  const bipap = rows.map((r) => ({ ...r, report: { ...r.report, modeCode: 4, tidal: 480, resp: 15, minuteVent: 7.2 } }));
  const html = buildTherapyReportHTML({ deviceData: { serial: 'BVT1', settings: { max_pressure: 14, min_pressure: 7 } }, sessions: bipap, startDate: '2022-03-06', endDate: '2022-03-18' });
  assert.match(html, /<span>Mode<\/span><span>BiPAP-ST<\/span>/);
  assert.match(html, /<span>IPAP<\/span><span>14<\/span>/);
  assert.doesNotMatch(html, /Apnea Index/);
  assert.equal((html.match(/<svg class="chart"/g) || []).length, 7);
  assert.ok(html.indexOf('Usage (Hours)') < html.indexOf('Pressure (cmH2O)'));
});
