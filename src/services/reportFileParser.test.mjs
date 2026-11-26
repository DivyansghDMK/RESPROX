import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReportFile, parseRecordLine, parseReportRows, parseTd1File, parseTd1Record, isTd1Data, steppedPressure, daysFromRecords } from './reportFileParser.js';

const GOOD = 'S,29,3,26,29,3,26,4,352,16,5,0,0,2,0,216,656,0,0,21,55,21,56,2,0,2,0,39,0,0,0,0,0,1,2,2,1,0,4,A,24000425';

test('a well-formed record parses without error', () => {
  assert.equal(parseRecordLine(GOOD, 1).error, undefined);
});

test('non-record and short lines are reported, not guessed', () => {
  assert.match(parseRecordLine('X,1,2', 1).error.reason, /"S" record marker/);
  assert.match(parseRecordLine('S,1,2', 2).error.reason, /fields/);
});

test('a file with no usable records yields no records and keeps the errors', () => {
  const out = parseReportFile('garbage\nS,1,2');
  assert.equal(out.records.length, 0);
  assert.equal(out.errors.length, 2);
});

test('empty input does not throw', () => {
  assert.equal(parseReportFile('').records.length, 0);
  assert.equal(parseReportFile(undefined).records.length, 0);
});

// The same session as GOOD, as a device_reports row from GET /devices/{id}/reports.
const GOOD_ROW = {
  device_id: '24000425', start_day: 29, start_month: 3, start_year: 26, end_day: 29, end_month: 3, end_year: 26,
  mode: 4, volume_transfer: 352, max_pressure: 16, min_pressure: 5, ipap: 0, epap: 0, pressure_change_count: 2,
  session_counter: 0, air_flow: 216, tidal_volume: 656, resp_rate: 0, start_epap: 0, start_hour: 21, start_minute: 55,
  end_hour: 21, end_minute: 56, humidifier: 2, ramp_time: 0, auto_on_off: 2, titration_factor: 0, rate_change_factor: 39,
  csa_count: 0, osa_count: 0, hsa_count: 0, a_flex: 1, a_flex_level: 2, mask_type: 1, leak: 4,
};

test('an API report row gives the same day as the equivalent file line', () => {
  // A day's records keep their source (`raw`): the server row, or the file line.
  const plain = (days) => days.map((d) => ({ ...d, records: d.records.map(({ raw, ...r }) => r) }));
  assert.deepEqual(plain(parseReportRows([GOOD_ROW]).days), plain(parseReportFile(GOOD).days));
});

test('API rows keep decimal pressures and derive AHI from events over usage', () => {
  const row = { ...GOOD_ROW, start_hour: 22, start_minute: 0, end_day: 30, end_hour: 6, end_minute: 0,
    max_pressure: 12.5, min_pressure: 12.5, csa_count: 4, osa_count: 8, hsa_count: 4 };
  const [day] = parseReportRows([row]).days;
  assert.equal(day.usage_hours, 8);
  assert.equal(day.ahi, 2);
  assert.equal(day.pressure_95, 12.5);
});

test('an API row with an impossible date is reported, not counted', () => {
  const out = parseReportRows([{ ...GOOD_ROW, start_month: 13 }]);
  assert.equal(out.records.length, 0);
  assert.equal(out.errors.length, 1);
});

// ── SD card .td1 ──────────────────────────────────────────────────────────────

/** One 43-byte frame with the given byte values, framed and checksummed. */
function td1Frame(values = {}) {
  const b = new Uint8Array(43);
  b[0] = 0xE8;
  Object.assign(b, { 1: 30, 2: 10, 3: 26, 4: 30, 5: 10, 6: 26, 10: 40, 21: 14, 22: 50, 23: 15, 24: 6 }, values);
  b[41] = b.subarray(0, 41).reduce((x, v) => x ^ v, 0);
  b[42] = 0x8E;
  return b;
}
const td1 = (...frames) => Uint8Array.from(frames.flatMap((f) => [...f]));

test('td1: a frame decodes into the same record as a text line', () => {
  const { record, error } = parseTd1Record(td1Frame({ 17: 1, 18: 44, 19: 12, 30: 2, 31: 1, 38: 1, 40: 9 }), 1, 'CVT3000001');
  assert.equal(error, undefined);
  assert.equal(record.startClock, '14:50');
  assert.equal(record.endClock, '15:06');
  assert.equal(record.setPressure, 4);          // 40 = 4.0 cmH₂O
  assert.equal(record.tidalVolume, 300);         // big-endian 0x012C
  assert.equal(record.respRate, 12);
  assert.equal(record.events, 3);
  assert.equal(record.maskType, 'Full Face');
  assert.equal(record.leak, 9);
  assert.equal(record.serial, 'CVT3000001');
});

test('td1: a bad checksum or frame is reported, not decoded', () => {
  const bad = td1Frame();
  bad[41] ^= 0xFF;
  assert.match(parseTd1Record(bad, 3).error.reason, /checksum/);
  const unframed = td1Frame();
  unframed[42] = 0;
  assert.match(parseTd1Record(unframed, 4).error.reason, /E8/);
});

test('td1: the copy the device writes twice is counted once', () => {
  const a = td1Frame();
  const b = td1Frame({ 21: 16, 22: 0, 23: 16, 24: 30 });
  const parsed = parseTd1File(td1(a, a, b, b), { fileName: 'CVT3000001.td1' });
  assert.equal(parsed.format, 'td1');
  assert.equal(parsed.summary.records, 2);
  assert.equal(parsed.summary.duplicates, 2);
  assert.equal(parsed.serial, 'CVT3000001');
  assert.equal(parsed.days.length, 1);
  assert.equal(parsed.days[0].usage_hours, round2((16 + 30) / 60));
});

test('td1: detection looks at the framing, not the file name', () => {
  assert.equal(isTd1Data(td1Frame()), true);
  assert.equal(isTd1Data(new TextEncoder().encode('S,29,3,26,29,3,26,4,352,16,5,0,0,2,0,216,656,0,0,21,55')), false);
});

function round2(v) { return Math.round(v * 100) / 100; }

test('an overnight session written with the start date on both ends ends the next morning', () => {
  const f = Array(40).fill('0');
  Object.assign(f, { 0: 'S', 1: '20', 2: '12', 3: '25', 4: '20', 5: '12', 6: '25', 7: '2', 9: '12', 10: '11', 19: '22', 20: '58', 21: '8', 22: '16', 39: 'E' });
  const { records, days } = parseReportFile(f.join(','));
  assert.equal(records[0].durationMinutes, 558);
  assert.equal(records[0].suspect, null);
  assert.equal(records[0].dayKey, '2025-12-20');
  assert.equal(days[0].usage_hours, 9.3); // counted on screen, not only in the PDF
});

test('a therapy day runs noon to noon', () => {
  const at = (day, hour) => ({
    start_day: day, start_month: 11, start_year: 26, start_hour: hour, start_minute: 0,
    end_day: day, end_month: 11, end_year: 26, end_hour: hour, end_minute: 30, mode: 2,
    max_pressure: 12, min_pressure: 4, csa_count: 0, osa_count: 0, hsa_count: 0, leak: 10,
  });
  const { records, days } = parseReportRows([at(20, 23), at(21, 1), at(21, 11), at(21, 12)]);
  // 23:00 on the 20th and 01:00 / 11:00 on the 21st are one night; 12:00 on the 21st starts the next.
  assert.deepEqual(records.map((r) => r.dayKey), ['2026-11-20', '2026-11-20', '2026-11-20', '2026-11-21']);
  assert.deepEqual(days.map((d) => [d.dayKey, d.sessionCount, d.date]), [['2026-11-20', 3, '20 Nov 2026'], ['2026-11-21', 1, '21 Nov 2026']]);
});

test('session pressure from the step counters, kept between min and set max', () => {
  const cases = [
    [4, 20, 20, 10, 9],   // normal
    [4, 20, 5, 12, 4],    // more downs than ups → min
    [4, 20, 60, 10, 20],  // very many ups → set max
    [6, 12, 30, 0, 12],   // set max below 20
  ];
  for (const [minPressure, maxPressure, pressureChangeCount, rateChangeFactor, want] of cases) {
    assert.equal(steppedPressure({ minPressure, maxPressure, pressureChangeCount, rateChangeFactor }), want);
  }
});

test('tidal volume FF FF means not measured, not 65,535 mL', () => {
  const row = (tidal) => ({
    start_day: 25, start_month: 11, start_year: 26, start_hour: 22, start_minute: 0,
    end_day: 26, end_month: 11, end_year: 26, end_hour: 6, end_minute: 0, mode: 2,
    max_pressure: 12, min_pressure: 4, csa_count: 0, osa_count: 0, hsa_count: 0, leak: 10, tidal_volume: tidal, resp_rate: 14,
  });
  const { records, days } = parseReportRows([row(65535), row(500)]);
  assert.equal(records[0].tidalVolume, null);
  assert.equal(days[0].report.tidal, 500);
  assert.equal(days[0].tidalVolume, 500);
});

test('daysFromRecords builds the day from just the chosen sessions', () => {
  const at = (h, m, eh, em, leak) => ({
    start_day: 24, start_month: 11, start_year: 26, start_hour: h, start_minute: m,
    end_day: 24, end_month: 11, end_year: 26, end_hour: eh, end_minute: em, mode: 2,
    max_pressure: 18, min_pressure: 5, csa_count: 0, osa_count: 1, hsa_count: 0, leak,
  });
  const { records } = parseReportRows([at(17, 27, 17, 28, 103), at(22, 34, 23, 34, 31), at(23, 40, 23, 50, 25)]);
  const [day] = daysFromRecords(records.slice(1));
  assert.equal(day.sessionCount, 2);
  assert.equal(day.report.usageMinutes, 70);
  assert.equal(day.report.leak, 31);
});
