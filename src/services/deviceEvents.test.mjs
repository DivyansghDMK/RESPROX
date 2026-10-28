import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffDeviceEvents } from './deviceEvents.js';

const base = {
  serial: 'CVT3000001',
  therapy_status: 'STOPPED',
  device_online: true,
  settings: { therapy_mode: 'AUTO CPAP', pressure: 10, min_pressure: 8.5, max_pressure: 16.8, aflex: 2, ramp: 5 },
};
const withChanges = (changes) => ({ ...base, ...changes, settings: { ...base.settings, ...changes.settings } });

test('no events on the first read or for a different device', () => {
  assert.deepEqual(diffDeviceEvents(null, base), []);
  assert.deepEqual(diffDeviceEvents(base, { ...base, serial: 'CVT3000002' }), []);
});

test('no events when nothing changed', () => {
  assert.deepEqual(diffDeviceEvents(base, structuredClone(base)), []);
});

test('therapy started and stopped from the device', () => {
  const [started] = diffDeviceEvents(base, withChanges({ therapy_status: 'RUNNING' }));
  assert.equal(started.kind, 'therapy');
  assert.equal(started.title, 'Therapy started on CVT3000001');
  const [stopped] = diffDeviceEvents(withChanges({ therapy_status: 'running' }), base);
  assert.equal(stopped.title, 'Therapy stopped on CVT3000001');
});

test('connection lost and restored', () => {
  assert.equal(diffDeviceEvents(base, withChanges({ device_online: false }))[0].title, 'CVT3000001 went offline');
  assert.equal(diffDeviceEvents(withChanges({ device_online: false }), base)[0].title, 'CVT3000001 is back online');
});

test('settings changes list every changed value in one event', () => {
  const events = diffDeviceEvents(base, withChanges({ settings: { max_pressure: 15, aflex: 3 } }));
  assert.equal(events.length, 1);
  assert.equal(events[0].detail, 'Max pressure 16.8 → 15, A-Flex 2 → 3. Changed on the device.');
});

test('a value that was missing before is not a change', () => {
  const sparse = withChanges({ settings: { humidifier: null } });
  assert.deepEqual(diffDeviceEvents(sparse, withChanges({ settings: { humidifier: 3 } })), []);
});

test('the phone app taking the device off Wi-Fi is its own event', () => {
  const withPhone = withChanges({ device_online: false, phone_connected: true });
  const [toPhone] = diffDeviceEvents(base, withPhone);
  assert.equal(toPhone.title, 'CVT3000001 connected to the phone app');
  assert.equal(diffDeviceEvents(withPhone, base)[0].title, 'CVT3000001 is back online');
  const [phoneToOffline] = diffDeviceEvents(withPhone, withChanges({ device_online: false }));
  assert.equal(phoneToOffline.title, 'CVT3000001 went offline');
});
