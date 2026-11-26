// src/services/packetLog.js
//
// One settings packet's log for the device dashboard: the bytes the device
// sent (the 70-byte FULL_SYNC, or an UPDATE), what each byte decodes to, and
// how the server row was read. Layout per the BLE protocol, Rev 3.1.
//
// The server keeps a packet's decoded fields (decoded_telemetry), not the
// bytes it received. Every field sits at a fixed byte, so the packet is
// rebuilt from them exactly. Only the checksum is worked out again. On a CPAP
// machine the BiPAP groups (S, ST, T, VAPS) are stored as null and are sent as
// 00, so they rebuild as 00.

const MODE_IDS = { CPAP: 1, AUTO: 2, S: 3, ST: 4, T: 5, VAPS: 6, COMFORT: 7, OPTIONS: 8, CONFIG: 9 };
const MODE_NAMES = { 1: 'CPAP', 2: 'Auto', 3: 'S', 4: 'ST', 5: 'T', 6: 'VAPS' };
const MASKS = { 1: 'Full Face', 2: 'Nasal', 3: 'Pillow' };

/** [field in decoded_payload, label, size, encoding, unit]. Same order as the device sends. */
const GROUPS = {
  CPAP: [['pressure', 'Pressure', 1, 'div10', 'cmH₂O'], ['ramp', 'Ramp', 1, 'raw', 'min']],
  AUTO: [['minPressure', 'Min pressure', 1, 'div10', 'cmH₂O'], ['maxPressure', 'Max pressure', 1, 'div10', 'cmH₂O'],
    ['ramp', 'Ramp', 1, 'raw', 'min'], ['aflex', 'A-Flex', 1, 'raw', '']],
  S: [['ipap', 'IPAP', 2, 'div10', 'cmH₂O'], ['epap', 'EPAP', 2, 'div10', 'cmH₂O'], ['startEpap', 'Start EPAP', 2, 'div10', 'cmH₂O'],
    ['tMin', 'Ti min', 1, 'div10', 's'], ['tMax', 'Ti max', 1, 'div10', 's'], ['sensitivity', 'Sensitivity', 1, 'raw', ''],
    ['riseTimeMs', 'Rise time', 1, 'mul50', 'ms']],
  ST: [['ipap', 'IPAP', 2, 'div10', 'cmH₂O'], ['epap', 'EPAP', 2, 'div10', 'cmH₂O'], ['startEpap', 'Start EPAP', 2, 'div10', 'cmH₂O'],
    ['backupRate', 'Backup rate', 1, 'raw', 'BPM'], ['tMin', 'Ti min', 1, 'div10', 's'], ['tMax', 'Ti max', 1, 'div10', 's'],
    ['sensitivity', 'Sensitivity', 1, 'raw', ''], ['riseTimeMs', 'Rise time', 1, 'mul50', 'ms']],
  T: [['ipap', 'IPAP', 2, 'div10', 'cmH₂O'], ['epap', 'EPAP', 2, 'div10', 'cmH₂O'], ['startEpap', 'Start EPAP', 2, 'div10', 'cmH₂O'],
    ['respiRate', 'Resp. rate', 1, 'raw', 'BPM'], ['tMin', 'Ti min', 1, 'div10', 's'], ['riseTimeMs', 'Rise time', 1, 'mul50', 'ms']],
  VAPS: [['maxIpap', 'Max IPAP', 2, 'div10', 'cmH₂O'], ['minIpap', 'Min IPAP', 2, 'div10', 'cmH₂O'], ['epap', 'EPAP', 2, 'div10', 'cmH₂O'],
    ['respiRate', 'Resp. rate', 1, 'raw', 'BPM'], ['tMin', 'Ti min', 1, 'div10', 's'], ['tMax', 'Ti max', 1, 'div10', 's'],
    ['sensitivity', 'Sensitivity', 1, 'raw', ''], ['riseTimeMs', 'Rise time', 1, 'mul50', 'ms'], ['heightCm', 'Height', 1, 'raw', 'cm'],
    ['tidalVolumeMl', 'Tidal volume', 2, 'raw', 'mL']],
  COMFORT: [['rampTime', 'Ramp time', 1, 'raw', 'min'], ['humidifierLevel', 'Humidifier', 1, 'raw', ''],
    ['tubeType', 'Tube type', 1, 'raw', ''], ['maskType', 'Mask type', 1, 'raw', '']],
  OPTIONS: [['iModeEnabled', 'I-Mode', 1, 'bool', ''], ['leakAlertEnabled', 'Leak alert', 1, 'bool', ''],
    ['sleepModeEnabled', 'Sleep mode', 1, 'bool', '']],
  CONFIG: [['dateYY', 'Date: year (20xx)', 1, 'raw', ''], ['dateMM', 'Date: month', 1, 'raw', ''], ['dateDD', 'Date: day', 1, 'raw', ''],
    ['datePad', 'Date: pad', 1, 'raw', ''], ['timeHH', 'Time: hour', 1, 'raw', ''], ['timeMM', 'Time: minute', 1, 'raw', ''],
    ['timeSS', 'Time: second', 1, 'raw', ''], ['reset', 'Reset', 1, 'bool', '']],
};
const BIPAP_ONLY = new Set(['S', 'ST', 'T', 'VAPS']);
const SEQUENTIAL = ['S', 'ST', 'T', 'VAPS', 'COMFORT', 'OPTIONS', 'CONFIG'];

const hex = (b) => b.toString(16).toUpperCase().padStart(2, '0');

function encode(value, encoding) {
  if (value == null) return 0;
  if (encoding === 'bool') return value === true || Number(value) === 1 ? 1 : 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (encoding === 'div10') return Math.round(n * 10);
  if (encoding === 'mul50') return Math.round(n / 50);
  return Math.round(n);
}

function describe(name, raw, encoding, unit, value) {
  if (value == null) return 'not set (00)';
  if (name === 'maskType') return MASKS[raw] || `${raw}`;
  if (encoding === 'bool') return raw ? 'On' : 'Off';
  const shown = encoding === 'div10' ? raw / 10 : encoding === 'mul50' ? raw * 50 : raw;
  return unit ? `${shown} ${unit}` : `${shown}`;
}

const payloadOf = (row) => {
  const p = row?.decoded_payload;
  if (typeof p === 'string') {
    try { return JSON.parse(p); } catch { return {}; }
  }
  return p && typeof p === 'object' ? p : {};
};

/** Writes one group's fields from `byte` on; returns the next free byte. */
function writeGroup(bytes, fields, byte, group, values, { skip = [], zero = false } = {}) {
  for (const [name, label, size, encoding, unit] of GROUPS[group]) {
    if (skip.includes(name)) continue;
    const value = zero ? null : values?.[name];
    const raw = encode(value, encoding) & (size === 2 ? 0xffff : 0xff);
    if (size === 2) {
      bytes[byte] = raw >> 8;
      bytes[byte + 1] = raw & 0xff;
    } else {
      bytes[byte] = raw;
    }
    fields.push({
      byte: size === 2 ? `${byte}–${byte + 1}` : `${byte}`,
      hex: size === 2 ? `${hex(raw >> 8)} ${hex(raw & 0xff)}` : hex(raw),
      group,
      name: label,
      decoded: zero ? 'CPAP machine: always 00' : describe(name, raw, encoding, unit, value),
      key: value == null ? null : `${group}.${name}`,
      muted: zero || value == null,
    });
    byte += size;
  }
  return byte;
}

function finish(bytes, fields, upTo) {
  let x = 0;
  for (let i = 0; i <= upTo; i++) x ^= bytes[i];
  bytes[upTo + 1] = x;
  bytes[upTo + 2] = 0x8e;
  fields.push({ byte: `${upTo + 1}`, hex: hex(x), group: '', name: `Checksum (XOR of bytes 0–${upTo})`, decoded: 'worked out again', key: null, muted: true });
  fields.push({ byte: `${upTo + 2}`, hex: '8E', group: '', name: 'End marker', decoded: '', key: null });
  return { bytes, hex: bytes.map(hex).join(' '), decimal: `[${bytes.join(',')}]`, fields };
}

/** The 70 bytes of a FULL_SYNC row, and what each one is. */
function rebuildFullSync(row) {
  const modes = payloadOf(row);
  const bipap = String(row.device_type || '').toUpperCase() === 'BIPAP';
  const modeId = MODE_IDS[String(row.mode || '').toUpperCase()] || 0;
  const bytes = new Array(70).fill(0);
  const fields = [];
  const head = (byte, value, name, decoded) => {
    bytes[byte] = value;
    fields.push({ byte: `${byte}`, hex: hex(value), group: '', name, decoded, key: null });
  };
  head(0, 0xe8, 'Start marker', '');
  head(1, 0x01, 'Packet type', 'FULL_SYNC');
  head(2, bipap ? 2 : 1, 'Device type', bipap ? 'BiPAP machine' : 'CPAP machine');
  head(3, modeId, 'Mode (running now)', MODE_NAMES[modeId] || `unknown (${row.mode ?? '—'})`);
  // Bytes 4–8: CPAP and AUTO, with one ramp (byte 7) shared by both.
  writeGroup(bytes, fields, 4, 'CPAP', modes.CPAP, { skip: ['ramp'] });
  writeGroup(bytes, fields, 5, 'AUTO', { ...modes.AUTO, ramp: modes.AUTO?.ramp ?? modes.CPAP?.ramp }, {});
  fields.find((f) => f.byte === '7').name = 'Ramp (CPAP + Auto, shared)';
  let byte = 9;
  for (const group of SEQUENTIAL) {
    const zero = !bipap && BIPAP_ONLY.has(group);
    byte = writeGroup(bytes, fields, byte, group, modes[group], { zero });
  }
  return finish(bytes, fields, 67);
}

/** An UPDATE row as the device sent it (Machine → App, DIR 01). */
function rebuildUpdate(row) {
  const group = String(row.mode || '').toUpperCase();
  if (!GROUPS[group]) return null;
  const bipap = String(row.device_type || '').toUpperCase() === 'BIPAP';
  const size = GROUPS[group].reduce((n, f) => n + f[2], 0);
  const bytes = new Array(size + 7).fill(0);
  const fields = [];
  const head = (byte, value, name, decoded) => {
    bytes[byte] = value;
    fields.push({ byte: `${byte}`, hex: hex(value), group: '', name, decoded, key: null });
  };
  head(0, 0xe8, 'Start marker', '');
  head(1, 0x01, 'Direction', 'Machine → App');
  head(2, 0x02, 'Packet type', 'UPDATE');
  head(3, bipap ? 2 : 1, 'Device type', bipap ? 'BiPAP machine' : 'CPAP machine');
  head(4, MODE_IDS[group], 'Group', group);
  writeGroup(bytes, fields, 5, group, payloadOf(row));
  return finish(bytes, fields, size + 4);
}

/** A telemetry row's packet rebuilt, or null when it is not a settings packet. */
export function rebuildPacket(row) {
  if (!row || typeof row !== 'object') return null;
  if (row.packet_type === 'FULL_SYNC') return { kind: 'FULL_SYNC', ...rebuildFullSync(row) };
  if (row.packet_type === 'UPDATE') {
    const built = rebuildUpdate(row);
    return built && { kind: 'UPDATE', ...built };
  }
  return null;
}

const two = (n) => String(n).padStart(2, '0');

/** What the packet says, in the words shown on the page. */
export function packetSteps(row) {
  const steps = [];
  const modes = payloadOf(row);
  const bipap = String(row.device_type || '').toUpperCase() === 'BIPAP';
  if (row.id != null || row.server_timestamp) {
    steps.push(['Stored', `Server row #${row.id ?? '—'}${row.server_timestamp ? `, received ${new Date(row.server_timestamp).toLocaleString('en-GB')}` : ''}`]);
  }
  steps.push(['Machine', bipap ? 'BiPAP: every group holds real values' : 'CPAP: the BiPAP groups (S, ST, T, VAPS) are 00']);
  if (row.packet_type === 'FULL_SYNC') {
    steps.push(['Sent', 'All settings at once (FULL_SYNC, 70 bytes), e.g. when the device connects']);
    const id = MODE_IDS[String(row.mode || '').toUpperCase()];
    steps.push(['Running mode', `code ${id ?? '—'} → ${MODE_NAMES[id] || row.mode || '—'}`]);
    const c = modes.CONFIG;
    if (c && c.dateMM) {
      steps.push(['Date / time (CONFIG)', `${two(c.dateDD)}/${two(c.dateMM)}/20${two(c.dateYY)} ${two(c.timeHH)}:${two(c.timeMM)}:${two(c.timeSS)}`]);
    }
  } else {
    steps.push(['Sent', `One group changed on the device (UPDATE: ${row.mode || '—'})`]);
  }
  return steps;
}
