import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReportFile, parseRecordLine, parseReportRows } from './reportFileParser.js';

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
