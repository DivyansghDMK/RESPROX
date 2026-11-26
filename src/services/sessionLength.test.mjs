import assert from 'node:assert/strict';
import test from 'node:test';
import { SESSION_MS, sessionLeft, sessionOver } from './sessionLength.js';

const start = Date.UTC(2026, 10, 26, 10, 0);

test('a session lasts exactly 7 days from sign-in', () => {
  assert.equal(sessionOver(start, start + SESSION_MS - 1), false);
  assert.equal(sessionOver(start, start + SESSION_MS), true);
  assert.equal(sessionOver(start, start + 3 * 86400000), false);
});

test('no recorded start never ends the session by itself', () => {
  assert.equal(sessionOver(null, start), false);
  assert.equal(sessionOver('', start), false);
  assert.equal(sessionOver('abc', start), false);
});

test('time left', () => {
  assert.deepEqual(sessionLeft(start, start + 86400000 + 2 * 3600000), { days: 5, hours: 22 });
  assert.deepEqual(sessionLeft(start, start + SESSION_MS + 5), { days: 0, hours: 0 });
  assert.equal(sessionLeft(0, start), null);
});
