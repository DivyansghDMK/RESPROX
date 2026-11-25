import test from 'node:test';
import assert from 'node:assert/strict';
import { rebuildRecord, sessionSteps } from './sessionLog.js';
import { parseReportRows, parseTd1Record } from './reportFileParser.js';

// A real device_reports row (CVT3000010, Jan 2024).
const ROW = {
  id: 140, device_id: 'CVT3000010', start_day: 25, start_month: 1, start_year: 24, start_hour: 21, start_minute: 38,
  end_day: 25, end_month: 1, end_year: 24, end_hour: 8, end_minute: 9, mode: 2, ipap: 10, epap: 8, start_epap: 9,
  humidifier: 0, ramp_time: 20, auto_on_off: 0, titration_factor: 9, rate_change_factor: 33, a_flex: 1, a_flex_level: 3,
  mask_type: 1, max_pressure: '15.3', min_pressure: '4.2', pressure_change_count: 6, volume_transfer: 507,
  air_flow: '21.7', tidal_volume: 378, resp_rate: 15, leak: 19, csa_count: 3, osa_count: 7, hsa_count: 1,
  session_counter: 140, created_at: '2026-09-11T11:42:13.480Z',
};

test('the rebuilt 43 bytes decode back to the same session', () => {
  const { bytes, hex, fields } = rebuildRecord(ROW);
  assert.equal(bytes.length, 43);
  assert.equal(bytes[0], 0xe8);
  assert.equal(bytes[42], 0x8e);
  assert.equal(hex.split(' ').length, 43);
  assert.equal(fields.length, 43);
  // Byte 12 / 13 hold IPAP / EPAP as the server stores them (raw, not ÷10).
  assert.equal(bytes[12], 10);
  assert.equal(bytes[13], 8);
  const cpapRow = { ...ROW, ipap: 0, epap: 0 };
  const fromBytes = parseTd1Record(Uint8Array.from(rebuildRecord(cpapRow).bytes), 1).record;
  const fromRow = parseReportRows([cpapRow]).records[0];
  for (const k of ['durationMinutes', 'modeCode', 'maxPressure', 'minPressure', 'pressureChangeCount',
    'rateChangeFactor', 'airFlow', 'tidalVolume', 'respRate', 'csa', 'osa', 'hsa', 'leak', 'maskType', 'aflexLevel', 'sessionPressure', 'dayKey']) {
    assert.equal(fromBytes[k], fromRow[k], k);
  }
});

test('the steps explain the overnight fix, the therapy day and the pressure', () => {
  const r = parseReportRows([{ ...ROW, ipap: 0, epap: 0 }]).records[0];
  const steps = Object.fromEntries(sessionSteps(r));
  assert.match(steps.Length, /^631 min \(the device wrote the start date on both ends/);
  assert.match(steps['Therapy day'], /^25 Jan 2024 — starts at or after 12:00/);
  // 4.2 + max(0, 6 − 33) × 0.5 = 4.2
  assert.match(steps['Session pressure'], /4\.2 \+ max\(0, 6 up − 33 down\) × 0\.5 = 4\.2 → 4\.2 cmH₂O/);
  assert.equal(steps.Mask, 'code 1 → Full Face');
});
