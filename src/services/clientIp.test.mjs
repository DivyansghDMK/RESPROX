import test from 'node:test';
import assert from 'node:assert/strict';
import { pickClientIp } from './clientIp.js';

test('reads the address from /me under any of its names', () => {
  assert.equal(pickClientIp({ ip: '49.36.120.7' }), '49.36.120.7');
  assert.equal(pickClientIp({ source_ip: '103.21.4.250' }), '103.21.4.250');
  assert.equal(pickClientIp({ sourceIp: '2401:4900:1c5a::1' }), '2401:4900:1c5a::1');
});

test('anything that is not an address shows nothing', () => {
  assert.equal(pickClientIp({}), null);
  assert.equal(pickClientIp(null), null);
  assert.equal(pickClientIp({ ip: '<script>' }), null);
  assert.equal(pickClientIp({ ip: '999.1.1.1' }), null);
});
