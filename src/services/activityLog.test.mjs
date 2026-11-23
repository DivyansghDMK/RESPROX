import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActivity, buildFleetActivity, commandStatus, describeField } from './activityLog.js';

const full = (id, at, cpap = { pressure: 10, ramp: 0 }) => ({
  id, packet_type: 'FULL_SYNC', mode: 'CPAP', server_timestamp: at,
  decoded_payload: { CPAP: cpap, AUTO: { minPressure: 6, maxPressure: 12, ramp: 0, aflex: 1 }, COMFORT: { maskType: 1, humidifierLevel: 2 } },
});
const update = (id, mode, at, values) => ({ id, packet_type: 'UPDATE', mode, server_timestamp: at, decoded_payload: values });

test('a change on the device lists what changed', () => {
  const { events, counts } = buildActivity({
    telemetry: [full(1, '2026-11-21T10:00:00Z'), update(2, 'CPAP', '2026-11-21T12:09:00Z', { pressure: 10, ramp: 10 })],
  });
  const e = events.find((x) => x.kind === 'settings');
  assert.equal(e.source, 'device');
  assert.equal(e.title, 'CPAP settings changed on the device');
  assert.deepEqual(e.changes.map((c) => [c.label, c.from, c.to]), [['Ramp', 'Off', '10 min']]);
  assert.equal(counts.deviceChanges, 1);
  assert.equal(counts.fullSyncs, 1);
});

test('switching to AUTO on the device shows the mode change', () => {
  const { events } = buildActivity({
    telemetry: [full(1, '2026-11-21T10:00:00Z'), update(2, 'AUTO', '2026-11-21T11:00:00Z', { minPressure: 7, maxPressure: 12, ramp: 0, aflex: 1 })],
  });
  const e = events.find((x) => x.kind === 'settings');
  assert.deepEqual(e.changes.map((c) => c.label), ['Mode', 'Min pressure']);
});

test('the device echoing a website change counts as the website\'s', () => {
  const commands = [{ id: 9, mode: 'CPAP', requested_values: { pressure: 12, ramp: 0 }, original_values: { pressure: 10, ramp: 0 }, status: 'ACKED', sent_at: '2026-11-21T11:00:00Z' }];
  const { events, counts } = buildActivity({
    telemetry: [full(1, '2026-11-21T10:00:00Z'), update(2, 'CPAP', '2026-11-21T11:00:40Z', { pressure: 12, ramp: 0 })],
    commands,
  });
  assert.equal(counts.deviceChanges, 0);
  assert.equal(counts.websiteChanges, 1);
  assert.equal(counts.websiteConfirmed, 1);
  const cmd = events.find((x) => x.kind === 'command');
  assert.equal(cmd.source, 'website');
  assert.deepEqual(cmd.changes.map((c) => [c.label, c.from, c.to]), [['Pressure', '10 cmH₂O', '12 cmH₂O']]);
});

test('therapy sessions come from the session records, newest first', () => {
  const rec = (d, h, m) => ({ dayKey: d, start: new Date(`${d}T${h}:00`), startClock: h, endClock: '06:30', durationMinutes: m, lineNo: 1 });
  const { events, counts } = buildActivity({ records: [rec('2026-11-20', '22:00', 510), rec('2026-11-21', '23:15', 435)] });
  assert.equal(counts.therapy, 2);
  assert.equal(events[0].detail, '23:15 – 06:30 · 7h 15m');
});

test('without a commands list the website count is unknown, not zero', () => {
  assert.equal(buildActivity({}).hasCommands, false);
  assert.equal(buildActivity({ commands: [] }).hasCommands, true);
});

test('labels', () => {
  assert.deepEqual(describeField('maskType', 3), { label: 'Mask type', text: 'Pillow' });
  assert.equal(describeField('humidifierLevel', 0).text, 'Off');
  assert.equal(commandStatus('TIMEOUT').key, 'failed');
  assert.equal(commandStatus('PENDING').key, 'pending');
});

test('all devices: weekly counts, latest event, one feed tagged by device', () => {
  const now = new Date('2026-11-23T12:00:00Z').getTime();
  const rec = (d) => ({ dayKey: d, start: new Date(`${d}T22:00:00`), startClock: '22:00', endClock: '06:00', durationMinutes: 480, lineNo: 1 });
  const fleet = buildFleetActivity([
    { device: { serial: 'CVT1', status: 'online' }, telemetry: [full(1, '2026-11-22T10:00:00Z'), update(2, 'CPAP', '2026-11-22T11:00:00Z', { pressure: 12, ramp: 0 })], records: [rec('2026-11-21'), rec('2026-10-01')] },
    { device: { serial: 'CVT2', status: 'offline' }, telemetry: [], records: [] },
  ], now);
  assert.deepEqual(fleet.devices.map((d) => d.serial), ['CVT1', 'CVT2']);
  assert.deepEqual(fleet.devices[0].week, { therapy: 1, deviceChanges: 1, fullSyncs: 1 });
  assert.equal(fleet.devices[0].latest.kind, 'settings');
  assert.equal(fleet.devices[1].latest, null);
  assert.equal(fleet.totals.online, 1);
  assert.equal(fleet.totals.activeThisWeek, 1);
  assert.ok(fleet.feed.every((e) => e.serial === 'CVT1'));
  assert.equal(fleet.feed.length, 4);
});
