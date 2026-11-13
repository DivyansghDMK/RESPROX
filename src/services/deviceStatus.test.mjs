import test from 'node:test';
import assert from 'node:assert/strict';
import { extractStatus } from './deviceStatus.js';

test('ONLINE shows online', () => {
  assert.equal(extractStatus({ status: 'ONLINE', status_reason: null }), 'online');
});

test('OFFLINE with APP_CONNECTED is connected to the app', () => {
  assert.equal(extractStatus({ device_id: 'CVT3000001', status: 'OFFLINE', status_reason: 'APP_CONNECTED' }), 'phone');
});

test('OFFLINE with CONNECTION_LOST or no reason is offline', () => {
  assert.equal(extractStatus({ status: 'OFFLINE', status_reason: 'CONNECTION_LOST' }), 'offline');
  assert.equal(extractStatus({ status: 'OFFLINE', status_reason: null }), 'offline');
  assert.equal(extractStatus({ status: 'OFFLINE' }), 'offline');
});

test('responses without status_reason still work', () => {
  assert.equal(extractStatus({ status: 'APP_CONNECTED' }), 'phone');
  assert.equal(extractStatus({}, { status: 'SYNCED' }), 'online');
  assert.equal(extractStatus({}), 'unknown');
});
