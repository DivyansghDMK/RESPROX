import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReportFile, parseRecordLine, parseReportRows, parseTd1File, parseTd1Record, isTd1Data } from './reportFileParser.js';

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
  assert.deepEqual(parseReportRows([GOOD_ROW]).days, parseReportFile(GOOD).days);
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
