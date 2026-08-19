// src/services/bleProtocol.js
//
// CPAP / BiPAP BLE hex protocol — Rev 3.1 (DeckMount Electronics / ResproX).
//
// Builds and parses the three packet types on the wire:
//
//   FULL_SYNC  E8 + type + deviceType + MODE + 64 data bytes + CK + 8E   (70 B)
//   UPDATE     E8 + DIR + type + deviceType + modeId + payload + CK + 8E (9-21 B)
//   NACK       E8 + type + originalType + reason + CK + 8E               (6 B)
//
// The byte map below is the single source of truth: both the encoder and the
// decoder walk the same table, so a field can never be written at one offset
// and read at another.
//
// Values are handled in engineering units everywhere in the app (cmH2O as a
// float, seconds, milliseconds, minutes, ml, cm, BPM). Wire scaling lives only
// in the codecs, so no caller has to remember that pressure is sent ×10.
//
// ── Packet discrimination ────────────────────────────────────────────────────
// FULL_SYNC has no DIR byte, so byte 1 is its packet type (0x01) — which
// collides with an UPDATE whose DIR is 0x01 (Machine→App). Byte 2 does not
// separate them either: device type BIPAP is 0x02 and the UPDATE packet type is
// also 0x02. Length is therefore the only reliable discriminator, and
// `parsePacket` uses it. Keep that in mind before changing any packet length.

export const START = 0xE8;
export const END = 0x8E;

export const PACKET_TYPE = { FULL_SYNC: 0x01, UPDATE: 0x02, NACK: 0x03 };
export const DEVICE_TYPE = { CPAP: 0x01, BIPAP: 0x02 };
export const DIR = { APP_TO_MACHINE: 0x00, MACHINE_TO_APP: 0x01 };

export const MODE = { CPAP: 1, AUTO: 2, S: 3, ST: 4, T: 5, VAPS: 6 };
export const MODE_NAMES = { 1: 'CPAP', 2: 'Auto', 3: 'S', 4: 'ST', 5: 'T', 6: 'VAPS' };

export const NACK_REASON = { CHECKSUM: 0x01, INVALID_MODE: 0x02, OUT_OF_RANGE: 0x03 };
export const NACK_REASON_NAMES = {
  1: 'Checksum mismatch', 2: 'Invalid mode ID', 3: 'Out-of-range value',
};

export const FULL_SYNC_LENGTH = 70;

/** Rise time is transmitted as ms/50; the spec's own example uses 300 ms. */
export const RISE_TIME_STEP_MS = 50;

// ── codecs ────────────────────────────────────────────────────────────────────
//
// `size` is the wire width; `enc` turns an engineering value into raw wire
// integer(s); `dec` turns wire integer(s) back. `min`/`max` are the spec's
// limits expressed in raw wire units, matching the byte map's Range column.

const u8 = { size: 1, enc: (v) => [Math.round(v) & 0xFF], dec: (b) => b[0] };
const u8x10 = { size: 1, enc: (v) => [Math.round(v * 10) & 0xFF], dec: (b) => b[0] / 10 };
const u16x10 = {
  size: 2,
  enc: (v) => { const r = Math.round(v * 10); return [(r >> 8) & 0xFF, r & 0xFF]; },
  dec: (b) => ((b[0] << 8) | b[1]) / 10,
};
const u16 = {
  size: 2,
  enc: (v) => { const r = Math.round(v); return [(r >> 8) & 0xFF, r & 0xFF]; },
  dec: (b) => (b[0] << 8) | b[1],
};
const riseTime = {
  size: 1,
  enc: (ms) => [Math.round(ms / RISE_TIME_STEP_MS) & 0xFF],
  dec: (b) => b[0] * RISE_TIME_STEP_MS,
};
const bool = { size: 1, enc: (v) => [v ? 1 : 0], dec: (b) => b[0] === 1 };

// ── field table ───────────────────────────────────────────────────────────────
//
// [key, section, codec, rawMin, rawMax]. `section` groups a field under the
// mode it belongs to (#1_CPAP … #9_CONFIG) so parsed output is structured
// rather than one flat bag of 40 keys.

const F = (key, section, codec, min, max) => ({ key, section, codec, min, max });

/** FULL_SYNC data fields, in wire order starting at byte 4. */
export const FULL_SYNC_FIELDS = [
  F('pressure', 'cpap', u8x10, 40, 200),          // 4
  F('minPressure', 'auto', u8x10, 40, 200),       // 5
  F('maxPressure', 'auto', u8x10, 40, 200),       // 6
  F('ramp', 'shared', u8, 0, 45),                 // 7 — shared by CPAP + AUTO
  F('aflex', 'auto', u8, 0, 3),                   // 8

  F('ipap', 's', u16x10, 60, 300),                // 9-10
  F('epap', 's', u16x10, 40, 280),                // 11-12
  F('startEpap', 's', u16x10, 40, 280),           // 13-14
  F('tMin', 's', u8x10, 1, 30),                   // 15
  F('tMax', 's', u8x10, 1, 30),                   // 16
  F('sens', 's', u8, 1, 5),                       // 17
  F('riseTime', 's', riseTime, 2, 13),            // 18

  F('ipap', 'st', u16x10, 60, 300),               // 19-20
  F('epap', 'st', u16x10, 40, 280),               // 21-22
  F('startEpap', 'st', u16x10, 40, 280),          // 23-24
  F('backupRate', 'st', u8, 0, 30),               // 25
  F('tMin', 'st', u8x10, 1, 30),                  // 26
  F('tMax', 'st', u8x10, 1, 30),                  // 27
  F('sens', 'st', u8, 1, 5),                      // 28
  F('riseTime', 'st', riseTime, 2, 13),           // 29

  F('ipap', 't', u16x10, 60, 300),                // 30-31
  F('epap', 't', u16x10, 40, 280),                // 32-33
  F('startEpap', 't', u16x10, 40, 280),           // 34-35
  F('respiRate', 't', u8, 4, 40),                 // 36
  F('tMin', 't', u8x10, 1, 30),                   // 37
  F('riseTime', 't', riseTime, 2, 13),            // 38

  F('maxIpap', 'vaps', u16x10, 40, 300),          // 39-40
  F('minIpap', 'vaps', u16x10, 40, 300),          // 41-42
  F('epap', 'vaps', u16x10, 40, 280),             // 43-44
  F('respiRate', 'vaps', u8, 4, 40),              // 45
  F('tMin', 'vaps', u8x10, 1, 30),                // 46
  F('tMax', 'vaps', u8x10, 1, 30),                // 47
  F('sens', 'vaps', u8, 1, 5),                    // 48
  F('riseTime', 'vaps', riseTime, 2, 13),         // 49
  F('height', 'vaps', u8, 100, 250),              // 50
  F('tidalVolume', 'vaps', u16, 150, 1800),       // 51-52

  F('rampTime', 'comfort', u8, 0, 45),            // 53
  F('humidifier', 'comfort', u8, 0, 5),           // 54
  F('tubeType', 'comfort', u8, 1, 3),             // 55
  // CONTRADICTION between the two specs, resolved in favour of the settings
  // screen: the BLE protocol (Rev 2 change table) says MASK_TYPE is 1-2
  // ("Only 2 mask types"), but the Settings screen defines three — Full Face,
  // Nasal, Pillow — each with its own drawable. Note the protocol's TUBE_TYPE
  // is 1-3 while that screen offers only two tubes, so the two rows look
  // transposed in one of the documents. Accepting 1-3 here means no valid
  // selection is refused locally; a device that truly only knows two will NACK.
  F('maskType', 'comfort', u8, 1, 3),             // 56

  F('iMode', 'options', bool, 0, 1),              // 57
  F('leakAlert', 'options', bool, 0, 1),          // 58
  F('sleepMode', 'options', bool, 0, 1),          // 59

  F('year', 'config', u8, 0, 99),                 // 60
  F('month', 'config', u8, 1, 12),                // 61
  F('day', 'config', u8, 1, 31),                  // 62
  F('datePad', 'config', u8, 0, 255),             // 63
  F('hour', 'config', u8, 0, 23),                 // 64
  F('minute', 'config', u8, 0, 59),               // 65
  F('second', 'config', u8, 0, 59),               // 66
  F('reset', 'config', bool, 0, 1),               // 67
];

/** UPDATE payloads by Mode ID. Field order is the wire order. */
export const UPDATE_FIELDS = {
  [MODE.CPAP]: [F('pressure', 'cpap', u8x10, 40, 200), F('ramp', 'shared', u8, 0, 45)],
  [MODE.AUTO]: [
    F('minPressure', 'auto', u8x10, 40, 200), F('maxPressure', 'auto', u8x10, 40, 200),
    F('ramp', 'shared', u8, 0, 45), F('aflex', 'auto', u8, 0, 3),
  ],
  [MODE.S]: FULL_SYNC_FIELDS.filter((f) => f.section === 's'),
  [MODE.ST]: FULL_SYNC_FIELDS.filter((f) => f.section === 'st'),
  [MODE.T]: FULL_SYNC_FIELDS.filter((f) => f.section === 't'),
  [MODE.VAPS]: FULL_SYNC_FIELDS.filter((f) => f.section === 'vaps'),
  0x07: FULL_SYNC_FIELDS.filter((f) => f.section === 'comfort'),
  0x08: FULL_SYNC_FIELDS.filter((f) => f.section === 'options'),
  0x09: FULL_SYNC_FIELDS.filter((f) => f.section === 'config'),
};

export const MODE_ID = { ...MODE, COMFORT: 0x07, OPTIONS: 0x08, CONFIG: 0x09 };

// ── helpers ───────────────────────────────────────────────────────────────────

/** XOR of every byte from the start marker up to (not including) the checksum. */
export function checksum(bytes) {
  let ck = 0;
  for (const b of bytes) ck ^= b;
  return ck & 0xFF;
}

export function toHex(bytes, sep = ' ') {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(sep);
}

export function fromHex(text) {
  const parts = String(text).trim().split(/[\s,]+/).filter(Boolean);
  return Uint8Array.from(parts.map((p) => parseInt(p.replace(/^0x/i, ''), 16)));
}

class ProtocolError extends Error {
  constructor(message, reason = NACK_REASON.OUT_OF_RANGE) {
    super(message);
    this.name = 'ProtocolError';
    this.reason = reason;
  }
}
export { ProtocolError };

/**
 * Encode one field, refusing anything the device would reject. Range checks run
 * on the raw wire value so they compare against the spec's own limits.
 */
function encodeField(field, value, out) {
  if (value === undefined || value === null) {
    for (let i = 0; i < field.codec.size; i++) out.push(0);
    return;
  }
  const raw = field.codec.enc(value);
  const scalar = field.codec.size === 2 ? (raw[0] << 8) | raw[1] : raw[0];
  if (scalar < field.min || scalar > field.max) {
    throw new ProtocolError(
      `${field.section}.${field.key} = ${value} encodes to ${scalar}, outside ${field.min}-${field.max}`
    );
  }
  out.push(...raw);
}

function decodeField(field, bytes, offset) {
  return field.codec.dec(bytes.slice(offset, offset + field.codec.size));
}

/** Group a flat field list into `{ section: { key: value } }`. */
function emptySections(fields) {
  const out = {};
  for (const f of fields) out[f.section] = out[f.section] || {};
  return out;
}

// ── FULL_SYNC ─────────────────────────────────────────────────────────────────

/**
 * Build a 70-byte FULL_SYNC.
 *
 * `settings` is sectioned: { cpap:{pressure}, auto:{...}, shared:{ramp}, ... }.
 * On a CPAP device every BiPAP/comfort/options field is transmitted as 0x00, so
 * omitted sections simply stay zero — no caller needs to pad by hand.
 */
export function buildFullSync({ deviceType = DEVICE_TYPE.CPAP, mode = MODE.CPAP, settings = {} } = {}) {
  if (!MODE_NAMES[mode]) throw new ProtocolError(`Unknown MODE ${mode}`, NACK_REASON.INVALID_MODE);

  const body = [START, PACKET_TYPE.FULL_SYNC, deviceType, mode];
  const isCpap = deviceType === DEVICE_TYPE.CPAP;
  // On a CPAP machine only #1/#2 and #9_CONFIG carry values; the rest are zero
  // by definition of the protocol, not by omission.
  const cpapSections = new Set(['cpap', 'auto', 'shared', 'config']);

  for (const field of FULL_SYNC_FIELDS) {
    const active = !isCpap || cpapSections.has(field.section);
    const value = active ? settings[field.section]?.[field.key] : undefined;
    encodeField(field, value, body);
  }

  if (body.length !== FULL_SYNC_LENGTH - 2) {
    throw new ProtocolError(`FULL_SYNC body is ${body.length} bytes, expected ${FULL_SYNC_LENGTH - 2}`);
  }
  body.push(checksum(body), END);
  return Uint8Array.from(body);
}

export function parseFullSync(bytes) {
  const b = Uint8Array.from(bytes);
  if (b.length !== FULL_SYNC_LENGTH) {
    throw new ProtocolError(`FULL_SYNC must be ${FULL_SYNC_LENGTH} bytes, got ${b.length}`);
  }
  if (b[0] !== START || b[b.length - 1] !== END) throw new ProtocolError('Bad framing');

  const ck = checksum(b.slice(0, FULL_SYNC_LENGTH - 2));
  if (ck !== b[FULL_SYNC_LENGTH - 2]) {
    throw new ProtocolError(
      `Checksum mismatch: computed 0x${ck.toString(16)}, packet says 0x${b[FULL_SYNC_LENGTH - 2].toString(16)}`,
      NACK_REASON.CHECKSUM
    );
  }

  const settings = emptySections(FULL_SYNC_FIELDS);
  let offset = 4;
  for (const field of FULL_SYNC_FIELDS) {
    settings[field.section][field.key] = decodeField(field, b, offset);
    offset += field.codec.size;
  }

  return {
    packetType: PACKET_TYPE.FULL_SYNC,
    deviceType: b[2],
    deviceTypeName: b[2] === DEVICE_TYPE.BIPAP ? 'BIPAP' : 'CPAP',
    mode: b[3],
    modeName: MODE_NAMES[b[3]] || `unknown(${b[3]})`,
    settings,
  };
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

/**
 * Build an UPDATE for a single mode. Only that mode's fields travel, and every
 * one of them is required — the device rewrites the whole block.
 */
export function buildUpdate({ modeId, values = {}, dir = DIR.APP_TO_MACHINE, deviceType = DEVICE_TYPE.CPAP }) {
  const fields = UPDATE_FIELDS[modeId];
  if (!fields) throw new ProtocolError(`Unknown Mode ID 0x${Number(modeId).toString(16)}`, NACK_REASON.INVALID_MODE);

  const body = [START, dir, PACKET_TYPE.UPDATE, deviceType, modeId];
  for (const field of fields) {
    const value = values[field.key];
    if (value === undefined || value === null) {
      throw new ProtocolError(`UPDATE 0x${Number(modeId).toString(16)} is missing ${field.key}`);
    }
    encodeField(field, value, body);
  }
  body.push(checksum(body), END);
  return Uint8Array.from(body);
}

export function parseUpdate(bytes) {
  const b = Uint8Array.from(bytes);
  if (b[0] !== START || b[b.length - 1] !== END) throw new ProtocolError('Bad framing');

  const ck = checksum(b.slice(0, b.length - 2));
  if (ck !== b[b.length - 2]) {
    throw new ProtocolError(
      `Checksum mismatch: computed 0x${ck.toString(16)}, packet says 0x${b[b.length - 2].toString(16)}`,
      NACK_REASON.CHECKSUM
    );
  }

  const modeId = b[4];
  const fields = UPDATE_FIELDS[modeId];
  if (!fields) throw new ProtocolError(`Unknown Mode ID 0x${modeId.toString(16)}`, NACK_REASON.INVALID_MODE);

  const expected = 7 + fields.reduce((sum, f) => sum + f.codec.size, 0);
  if (b.length !== expected) {
    throw new ProtocolError(`UPDATE 0x${modeId.toString(16)} must be ${expected} bytes, got ${b.length}`);
  }

  const values = {};
  let offset = 5;
  for (const field of fields) {
    values[field.key] = decodeField(field, b, offset);
    offset += field.codec.size;
  }

  return {
    packetType: PACKET_TYPE.UPDATE,
    dir: b[1],
    dirName: b[1] === DIR.MACHINE_TO_APP ? 'Machine→App' : 'App→Machine',
    isAck: b[1] === DIR.MACHINE_TO_APP,
    deviceType: b[3],
    modeId,
    modeName: MODE_NAMES[modeId] || { 7: 'COMFORT', 8: 'OPTIONS', 9: 'CONFIG' }[modeId] || `unknown(${modeId})`,
    values,
  };
}

/** The machine's ACK is the command echoed back with DIR flipped. */
export function buildAck(updateBytes) {
  const b = Uint8Array.from(updateBytes);
  const body = [...b.slice(0, b.length - 2)];
  body[1] = DIR.MACHINE_TO_APP;
  body.push(checksum(body), END);
  return Uint8Array.from(body);
}

// ── NACK ──────────────────────────────────────────────────────────────────────

export function buildNack(originalPacketType, reason = NACK_REASON.CHECKSUM) {
  const body = [START, PACKET_TYPE.NACK, originalPacketType, reason];
  body.push(checksum(body), END);
  return Uint8Array.from(body);
}

export function parseNack(bytes) {
  const b = Uint8Array.from(bytes);
  if (b.length !== 6 || b[0] !== START || b[5] !== END) throw new ProtocolError('Bad NACK framing');
  const ck = checksum(b.slice(0, 4));
  if (ck !== b[4]) throw new ProtocolError('NACK checksum mismatch', NACK_REASON.CHECKSUM);
  return {
    packetType: PACKET_TYPE.NACK,
    originalPacketType: b[2],
    reason: b[3],
    reasonName: NACK_REASON_NAMES[b[3]] || `unknown(${b[3]})`,
  };
}

// ── dispatch ──────────────────────────────────────────────────────────────────

/**
 * Parse any inbound packet.
 *
 * Never throws: a malformed or corrupt packet comes back as `{ ok: false }`
 * carrying the NACK to transmit, which is exactly what the caller must do next.
 */
export function parsePacket(bytes) {
  const b = Uint8Array.from(bytes);
  try {
    if (b.length < 6) throw new ProtocolError('Packet too short');
    if (b[0] !== START || b[b.length - 1] !== END) throw new ProtocolError('Bad framing');

    // Length first — see the discrimination note at the top of this file.
    if (b.length === FULL_SYNC_LENGTH && b[1] === PACKET_TYPE.FULL_SYNC) {
      return { ok: true, packet: parseFullSync(b) };
    }
    if (b[1] === PACKET_TYPE.NACK && b.length === 6) return { ok: true, packet: parseNack(b) };
    if (b[2] === PACKET_TYPE.UPDATE) return { ok: true, packet: parseUpdate(b) };
    throw new ProtocolError('Unrecognised packet type');
  } catch (err) {
    const reason = err instanceof ProtocolError ? err.reason : NACK_REASON.CHECKSUM;
    const original = b.length === FULL_SYNC_LENGTH ? PACKET_TYPE.FULL_SYNC : PACKET_TYPE.UPDATE;
    return { ok: false, error: err.message, reason, nack: buildNack(original, reason) };
  }
}

/**
 * Map a FULL_SYNC into the flat shape the app's settings UI and
 * `therapyReport.js` already use, so device state can be applied directly.
 */
export function fullSyncToAppSettings(parsed) {
  const { settings, mode } = parsed;
  const isBipap = mode >= MODE.S;
  return {
    therapy_mode: mode === MODE.AUTO ? 'AUTO CPAP' : mode === MODE.CPAP ? 'CPAP' : `BiPAP (${MODE_NAMES[mode]} MODE)`,
    pressure: settings.cpap.pressure,
    min_pressure: isBipap ? settings.s?.epap : settings.auto.minPressure,
    max_pressure: isBipap ? settings.s?.ipap : settings.auto.maxPressure,
    ramp: settings.shared.ramp,
    aflex: settings.auto.aflex,
    humidifier: settings.comfort.humidifier,
    mask_type: settings.comfort.maskType,
  };
}
