import test from 'node:test';
import assert from 'node:assert/strict';
import { errorFacts, errorReport, failureKind } from './diagnostics.js';
import { describeError } from './apiError.js';

const httpErr = Object.assign(new Error('Internal error'), { status: 503, statusText: 'Service Unavailable', method: 'GET', path: '/devices/CVT1/reports?limit=100&page=1', at: '2026-11-23T10:00:00.000Z' });

test('the report names the request, result, device and build', () => {
  const text = errorReport(httpErr, { action: 'load this device', subject: 'CVT1' });
  assert.match(text, /^Resprox error report/);
  assert.match(text, /What failed: load this device/);
  assert.match(text, /Device: CVT1/);
  assert.match(text, /Request: GET \/devices\/CVT1\/reports\?limit=100&page=1/);
  assert.match(text, /Result: HTTP 503 Service Unavailable/);
  assert.match(text, /App build: /);
});

test('network and timeout failures read as what they are', () => {
  assert.equal(failureKind({ code: 'NETWORK' }), 'No connection to the server (network or CORS)');
  assert.equal(failureKind({ code: 'TIMEOUT' }), 'No answer in time (timeout)');
  assert.deepEqual(errorFacts({}).map(([k]) => k).includes('Request'), false);
});

test('device refusals and bad answers get their own wording', () => {
  assert.equal(describeError(Object.assign(new Error('busy'), { code: 'NACKED' }), { subject: 'CVT1' }).kind, 'rejected');
  assert.equal(describeError(Object.assign(new Error('x'), { code: 'BAD_RESPONSE' })).title, 'The server sent an unexpected answer');
  assert.equal(describeError(Object.assign(new Error('x'), { code: 'ACK_PENDING' })).kind, 'timeout');
});
