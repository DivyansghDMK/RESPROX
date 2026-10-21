import test from 'node:test';
import assert from 'node:assert/strict';
import { describeError } from './apiError.js';

const httpErr = (status, body = {}) => Object.assign(new Error(body.error || body.message || `HTTP ${status}`), { status, body });

test('a timeout says the server is slow, not that the user is offline', () => {
  const d = describeError(Object.assign(new Error('late'), { code: 'TIMEOUT' }), { action: 'load this device' });
  assert.equal(d.kind, 'timeout');
  assert.equal(d.retryable, true);
});

test('a failed fetch while online is "server unreachable"', () => {
  assert.equal(describeError(new TypeError('Failed to fetch')).kind, 'unreachable');
});

test('a missing API route is told apart from a missing device', () => {
  assert.equal(describeError(httpErr(404, { message: 'Not Found' })).kind, 'unavailable');
  assert.equal(describeError(httpErr(404, { success: false, error: 'Device not found' }), { subject: 'CVT1' }).kind, 'missing');
});

test('gateway errors read as a temporary outage', () => {
  for (const s of [502, 503, 504]) assert.equal(describeError(httpErr(s)).kind, 'server-down');
  assert.equal(describeError(httpErr(500)).kind, 'server');
});

test('401 and 403 are different problems', () => {
  assert.equal(describeError(httpErr(401)).kind, 'auth');
  assert.equal(describeError(httpErr(403)).kind, 'forbidden');
});

test('an unknown error never shows the raw technical text as the message', () => {
  const d = describeError(new Error('Cannot read properties of undefined'));
  assert.equal(d.kind, 'unknown');
  assert.doesNotMatch(d.message, /undefined/);
});
