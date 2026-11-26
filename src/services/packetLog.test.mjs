import test from 'node:test';
import assert from 'node:assert/strict';
import { rebuildPacket, packetSteps } from './packetLog.js';

const xor = (bytes, upTo) => bytes.slice(0, upTo + 1).reduce((x, b) => x ^ b, 0);

// The protocol's CPAP FULL_SYNC example (Rev 3.1), as the server stores it.
// The checksum printed in the PDF (60) is not the XOR of its bytes; the
// rebuilt one is.
const CPAP_HEX = 'E8 01 01 01 64 32 C8 0F 02' + ' 00'.repeat(51) + ' 19 06 19 00 09 1E 00 00';
const CPAP_ROW = {
  id: 7, packet_type: 'FULL_SYNC', device_type: 'CPAP', mode: 'CPAP', server_timestamp: '2025-06-25T04:00:00Z',
  decoded_payload: {
    CPAP: { pressure: 10, ramp: 15 },
    AUTO: { minPressure: 5, maxPressure: 20, ramp: 15, aflex: 2 },
    S: null, ST: null, T: null, VAPS: null,
    COMFORT: { rampTime: 0, humidifierLevel: 0, tubeType: null, maskType: null },
    OPTIONS: { iModeEnabled: false, leakAlertEnabled: false, sleepModeEnabled: false },
    CONFIG: { dateYY: 25, dateMM: 6, dateDD: 25, datePad: 0, timeHH: 9, timeMM: 30, timeSS: 0, reset: false },
  },
};

test('a CPAP FULL_SYNC rebuilds to the 70 bytes the device sent', () => {
  const p = rebuildPacket(CPAP_ROW);
  assert.equal(p.kind, 'FULL_SYNC');
  assert.equal(p.bytes.length, 70);
  assert.equal(p.hex.split(' ').slice(0, 68).join(' '), CPAP_HEX);
  assert.equal(p.bytes[68], xor(p.bytes, 67));
  assert.equal(p.bytes[69], 0x8e);
  assert.equal(p.fields.find((f) => f.byte === '7').decoded, '15 min');
  assert.match(p.fields.find((f) => f.byte === '9–10').decoded, /CPAP machine/);
});

test('a BiPAP FULL_SYNC writes its two-byte fields big-endian', () => {
  const row = {
    ...CPAP_ROW, device_type: 'BIPAP', mode: 'S',
    decoded_payload: { ...CPAP_ROW.decoded_payload, S: { ipap: 16, epap: 10, startEpap: 12, tMin: 0.5, tMax: 1.5, sensitivity: 3, riseTimeMs: 300 } },
  };
  const p = rebuildPacket(row);
  assert.deepEqual(p.bytes.slice(2, 4), [2, 3]);
  assert.deepEqual(p.bytes.slice(9, 19), [0x00, 0xa0, 0x00, 0x64, 0x00, 0x78, 5, 15, 3, 6]);
});

test('an UPDATE rebuilds as the device ACK (the protocol #4_ST example)', () => {
  const p = rebuildPacket({
    packet_type: 'UPDATE', device_type: 'BIPAP', mode: 'ST',
    decoded_payload: { ipap: 18, epap: 11, startEpap: 12.5, backupRate: 12, tMin: 0.5, tMax: 2, sensitivity: 4, riseTimeMs: 400 },
  });
  // The PDF prints checksum 57; the XOR of these bytes is 5B.
  assert.equal(p.hex, 'E8 01 02 02 04 00 B4 00 6E 00 7D 0C 05 14 04 08 5B 8E');
});

test('steps and other rows', () => {
  const steps = Object.fromEntries(packetSteps(CPAP_ROW));
  assert.equal(steps['Date / time (CONFIG)'], '25/06/2025 09:30:00');
  assert.match(steps['Running mode'], /code 1 → CPAP/);
  assert.equal(rebuildPacket({ packet_type: 'SESSION' }), null);
  assert.equal(rebuildPacket({ ...CPAP_ROW, decoded_payload: JSON.stringify(CPAP_ROW.decoded_payload) }).hex, rebuildPacket(CPAP_ROW).hex);
});
