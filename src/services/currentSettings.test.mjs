import test from 'node:test';
import assert from 'node:assert/strict';
import { currentSettingsRow, telemetryRows } from './currentSettings.js';

const full = {
  id: 1, packet_type: 'FULL_SYNC', mode: 'CPAP', server_timestamp: '2026-11-20T10:00:00Z',
  decoded_payload: { CPAP: { pressure: 4, ramp: 0 }, AUTO: { minPressure: 6, maxPressure: 12, ramp: 0, aflex: 1 }, COMFORT: { maskType: 1, humidifierLevel: 2 } },
};
const update = (id, mode, at, values) => ({ id, packet_type: 'UPDATE', mode, server_timestamp: at, decoded_payload: values });

test('a full sync alone is the current settings', () => {
  const row = currentSettingsRow([full]);
  assert.equal(row.mode, 'CPAP');
  assert.deepEqual(row.decoded_payload, full.decoded_payload);
});

test('a change on the device overrides its group and keeps the others', () => {
  const row = currentSettingsRow([
    update(3, 'AUTO', '2026-11-20T11:00:00Z', { minPressure: 8, maxPressure: 14, ramp: 10, aflex: 2 }),
    full,
  ]);
  assert.equal(row.mode, 'AUTO');
  assert.deepEqual(row.decoded_payload.AUTO, { minPressure: 8, maxPressure: 14, ramp: 10, aflex: 2 });
  assert.deepEqual(row.decoded_payload.CPAP, { pressure: 4, ramp: 0 });
  assert.equal(row.decoded_payload.COMFORT.maskType, 1);
  assert.equal(row.server_timestamp, '2026-11-20T11:00:00Z');
});

test('a comfort change does not become the therapy mode', () => {
  const row = currentSettingsRow([full, update(3, 'COMFORT', '2026-11-20T11:00:00Z', { maskType: 3, humidifierLevel: 2, rampTime: 0, tubeType: 1 })]);
  assert.equal(row.mode, 'CPAP');
  assert.equal(row.decoded_payload.COMFORT.maskType, 3);
});

test('the last change wins, and a newer full sync replaces earlier updates', () => {
  const rows = [
    full,
    update(2, 'CPAP', '2026-11-20T10:30:00Z', { pressure: 9, ramp: 0 }),
    update(3, 'CPAP', '2026-11-20T10:40:00Z', { pressure: 10, ramp: 5 }),
  ];
  assert.equal(currentSettingsRow(rows).decoded_payload.CPAP.pressure, 10);
  const later = { ...full, id: 4, server_timestamp: '2026-11-20T12:00:00Z' };
  assert.equal(currentSettingsRow([...rows, later]).decoded_payload.CPAP.pressure, 4);
});

test('the same row from latest and history counts once; no settings rows gives null', () => {
  const u = update(2, 'CPAP', '2026-11-20T10:30:00Z', { pressure: 9, ramp: 0 });
  assert.equal(currentSettingsRow([full, u, u]).decoded_payload.CPAP.pressure, 9);
  assert.equal(currentSettingsRow([]), null);
});

test('rows are read from the API wrappings', () => {
  assert.equal(telemetryRows({ success: true, data: full }).length, 1);
  assert.equal(telemetryRows({ data: { items: [full, full], pagination: {} } }).length, 2);
  assert.equal(telemetryRows(null).length, 0);
});
