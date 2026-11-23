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
  // Rounded to the nearest, as in the Rajinder Kaur Ghai sample: 31/38 → 82 %, 6/38 → 16 %.
  assert.equal(pct(31, 38), 82);
  assert.equal(pct(6, 38), 16);
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
  assert.equal(fmtHM(u.avgTotalDaysMin), '02 Hours, 28 Minutes'); // 147.6 min, to the nearest
  assert.equal(fmtHM(u.avgUsedDaysMin), '10 Hours, 40 Minutes'); // 639.7 min, to the nearest
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
  // One session a day: each day's max, 95th and median are that session's
  // pressure, averaged over the 3 days: (19.1 + 14.2 + 10.8) / 3.
  assert.equal(data.pressure.max.toFixed(2), '14.70');
  assert.equal(data.pressure.p95.toFixed(2), '14.70');
  assert.equal(data.pressure.median.toFixed(2), '14.70');
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
  assert.deepEqual(r.pressures, [12, 14]);
  assert.equal(r.setMax, 14); // the day's last session
  assert.equal(r.setMin, 6);
});

test('the report follows the app layout', () => {
  const html = buildTherapyReportHTML({ deviceData: { serial: 'CVT1', settings: { min_pressure: 4, max_pressure: 11, aflex: 3, mask_type: 3 } }, sessions: rows, startDate: '2022-03-06', endDate: '2022-03-18' });
  assert.match(html, /Therapy Report \(06 Mar - 18 Mar\)/);
  assert.match(html, /<span>Mode<\/span><span>AUTO CPAP<\/span>/);
  assert.match(html, /<span>Min Pressure<\/span><span>4<\/span>/);
  assert.match(html, /<span>Max Pressure<\/span><span>11<\/span>/);
  assert.doesNotMatch(html, /<span>Set Pressure<\/span>/);
  assert.match(html, /<span>A-Flex Level<\/span><span>3<\/span>/);
  assert.match(html, /<span>Mask Type<\/span><span>Pillow Mask<\/span>/);
  assert.match(html, /Pressure-cmH2O/);
  assert.match(html, /<td class="ml">AI:<\/td><td class="mv">1\.63<\/td>/);
  assert.match(html, /Set Max Pressure/);
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

test('usage figures of the Rajinder Kaur Ghai sample (15 Mar - 21 Apr 2026)', () => {
  // 37 used days out of 38, 31 of them 4 h or more, 11,961 minutes in all.
  // 6 short days of 200 min; the other 31 share the rest (347 min each, the remainder on one).
  const mins = [...Array(31).fill(347), ...Array(6).fill(200)];
  mins[0] += 11961 - mins.reduce((a, b) => a + b, 0);
  const start = new Date('2026-03-15T00:00:00');
  const rows = mins.map((m, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return day(key, rep(m, 10, 0, 1, 1, [44]));
  });
  const u = buildReportData({ rows, startDate: '2026-03-15', endDate: '2026-04-21' }).usage;
  assert.equal(`${u.usedDays}/${u.totalDays} (${u.usedPct}%)`, '37/38 (97%)');
  assert.equal(`${u.over4hDays} (${u.over4hPct}%)`, '31 (82%)');
  assert.equal(`${u.under4hDays} (${u.under4hPct}%)`, '6 (16%)');
  assert.equal(fmtHM(u.totalMinutes), '199 Hours, 21 Minutes');
  assert.equal(fmtHM(u.avgTotalDaysMin), '05 Hours, 15 Minutes');
  assert.equal(fmtHM(u.avgUsedDaysMin), '05 Hours, 23 Minutes');
});

test('pressure (avg): per-day max, 95th and median of its sessions, averaged over days', () => {
  const d = buildReportData({
    rows: [
      day('2026-04-01', rep(400, 12, 0, 1, 1, [30], { pressures: [8, 10, 12], setMax: 11, setMin: 4 })),
      day('2026-04-02', rep(300, 6, 0, 1, 1, [30], { pressures: [6], setMax: 12, setMin: 5 })),
    ],
  });
  assert.equal(d.pressure.max, 9);      // (12 + 6) / 2
  assert.equal(d.pressure.median, 8);   // (10 + 6) / 2
  assert.equal(d.pressure.p95, 8);      // nearest rank of [8,10,12] is 10; (10 + 6) / 2
  // Settings come from the range's last session, not today's device settings.
  assert.deepEqual(d.set, { max: 12, min: 5 });
});

test('the report shows the settings recorded in the range', () => {
  const rows2 = [day('2026-04-01', rep(400, 10, 0, 1, 1, [30], { pressures: [10], setMax: 11, setMin: 4 }))];
  const html = buildTherapyReportHTML({ deviceData: { serial: 'CVT1', settings: { min_pressure: 6, max_pressure: 15 } }, sessions: rows2, startDate: '2026-04-01', endDate: '2026-04-01' });
  assert.match(html, /<span>Min Pressure<\/span><span>4<\/span>/);
  assert.match(html, /<span>Max Pressure<\/span><span>11<\/span>/);
  assert.match(html, /Set Max Pressure<\/span>\s*<span class="stat-value"[^>]*>11</);
});
