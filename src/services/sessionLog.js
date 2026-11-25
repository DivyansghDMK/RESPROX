// src/services/sessionLog.js
//
// One session's log for the Reports page: the 43-byte record the device sent,
// what each byte decodes to, and how the website turned it into the numbers
// on screen.
//
// The server keeps a session's decoded fields (device_reports), not the bytes
// it received. Every field sits at a fixed byte, so the record is rebuilt from
// them exactly, except bytes 33, 34, 37 and 39 (reserved, not stored, shown
// as 00) and the checksum (worked out again over the rebuilt bytes).

const MASKS = { 1: 'Full Face', 2: 'Nasal', 3: 'Pillow' };
const MODES = { 1: 'CPAP', 2: 'Auto CPAP', 3: 'BiPAP-S', 4: 'BiPAP-ST', 5: 'BiPAP-T', 6: 'VAPS' };
const NOT_STORED = new Set([33, 34, 37, 39]);

const int = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const tenths = (v) => Math.round(int(v) * 10);

/** [byte, field, server column, value of that byte from the row, decoded text]. */
const LAYOUT = [
  [0, 'Start marker', null, () => 0xe8],
  [1, 'Start day', 'start_day'], [2, 'Start month', 'start_month'], [3, 'Start year (20xx)', 'start_year'],
  [4, 'End day', 'end_day'], [5, 'End month', 'end_month'], [6, 'End year (20xx)', 'end_year'],
  [7, 'Mode', 'mode', null, (b) => MODES[b] || `unknown (${b})`],
  [8, 'Volume transfer (high)', 'volume_transfer', (r) => (int(r.volume_transfer) >> 8) & 0xff, null, true],
  [9, 'Volume transfer (low)', 'volume_transfer', (r) => int(r.volume_transfer) & 0xff, (_, r) => `${int(r.volume_transfer)}`],
  [10, 'Max pressure ÷10', 'max_pressure', (r) => tenths(r.max_pressure), (b) => `${b / 10} cmH₂O`],
  [11, 'Min pressure ÷10', 'min_pressure', (r) => tenths(r.min_pressure), (b) => `${b / 10} cmH₂O`],
  [12, 'IPAP', 'ipap'], [13, 'EPAP', 'epap'],
  [14, 'Pressure change count (steps up)', 'pressure_change_count'],
  [15, 'Session counter', 'session_counter'],
  [16, 'Air flow ÷10', 'air_flow', (r) => tenths(r.air_flow), (b) => `${b / 10} L/min`],
  [17, 'Tidal volume (high)', 'tidal_volume', (r) => (int(r.tidal_volume) >> 8) & 0xff, null, true],
  [18, 'Tidal volume (low)', 'tidal_volume', (r) => int(r.tidal_volume) & 0xff, (_, r) => (int(r.tidal_volume) === 0xffff ? 'not measured (FF FF)' : `${int(r.tidal_volume)} mL`)],
  [19, 'Respiratory rate', 'resp_rate', null, (b) => `${b} /min`],
  [20, 'Start EPAP', 'start_epap'],
  [21, 'Start hour', 'start_hour'], [22, 'Start minute', 'start_minute'],
  [23, 'End hour', 'end_hour'], [24, 'End minute', 'end_minute'],
  [25, 'Humidifier', 'humidifier'], [26, 'Ramp time', 'ramp_time', null, (b) => `${b} min`],
  [27, 'Auto On/Off', 'auto_on_off', null, (b) => ({ 0: 'Off', 1: 'On', 2: 'Both' }[b] ?? `${b}`)],
  [28, 'Titration factor', 'titration_factor'],
  [29, 'Rate change factor (steps down)', 'rate_change_factor'],
  [30, 'CSA count', 'csa_count'], [31, 'OSA count', 'osa_count'], [32, 'HSA count', 'hsa_count'],
  [33, 'Reserved', null], [34, 'Reserved', null],
  [35, 'A-Flex flag', 'a_flex'], [36, 'A-Flex level', 'a_flex_level'],
  [37, 'Reserved', null],
  [38, 'Mask type', 'mask_type', null, (b) => MASKS[b] || 'not set'],
  [39, 'Reserved', null],
  [40, 'Leak', 'leak', null, (b) => `${b} L/min`],
];

const hex = (b) => b.toString(16).toUpperCase().padStart(2, '0');

/** The 43 bytes of a `device_reports` row, and what each one is. */
export function rebuildRecord(row) {
  const bytes = new Array(43).fill(0);
  const fields = LAYOUT.map(([byte, name, column, read, decode, partOfNext]) => {
    const value = read ? read(row) : column ? int(row[column]) : 0;
    bytes[byte] = value & 0xff;
    return {
      byte, name, column,
      hex: hex(bytes[byte]),
      decoded: partOfNext ? '' : decode ? decode(bytes[byte], row) : column ? `${bytes[byte]}` : '',
      notStored: NOT_STORED.has(byte),
    };
  });
  let x = 0;
  for (let i = 0; i <= 40; i++) x ^= bytes[i];
  bytes[41] = x;
  bytes[42] = 0x8e;
  fields.push({ byte: 41, name: 'Checksum (XOR of bytes 0–40)', column: null, hex: hex(x), decoded: 'worked out again', notStored: true });
  fields.push({ byte: 42, name: 'End marker', column: null, hex: '8E', decoded: '' });
  return { bytes, hex: bytes.map(hex).join(' '), decimal: `[${bytes.join(',')}]`, fields };
}

const two = (n) => String(n).padStart(2, '0');

/**
 * What the website did with one session (a reportFileParser record), step by
 * step, in the words shown on the page.
 */
export function sessionSteps(r) {
  const steps = [];
  const row = r.raw && typeof r.raw === 'object' ? r.raw : {};
  if (row.id != null || row.created_at) {
    steps.push(['Stored', `Server row #${row.id ?? '—'}${row.created_at ? `, received ${new Date(row.created_at).toLocaleString('en-GB')}` : ''}`]);
  }
  const d = (x) => `${two(x.getDate())}/${two(x.getMonth() + 1)}/${x.getFullYear()} ${two(x.getHours())}:${two(x.getMinutes())}`;
  steps.push(['Start → end', `${d(r.start)} → ${d(r.end)}`]);
  const overnightFix = row.end_day != null && Number(row.end_day) === Number(row.start_day) && r.end.getDate() !== r.start.getDate();
  steps.push(['Length', `${r.durationMinutes} min${overnightFix ? ' (the device wrote the start date on both ends; ended the next morning)' : r.crossesMidnight ? ' (past midnight)' : ''}`]);
  steps.push(['Therapy day', `${r.dateLabel} — ${r.start.getHours() < 12 ? `starts before 12:00, so it belongs to the night before` : 'starts at or after 12:00, so it belongs to this date'}`]);
  steps.push(['Mode', `code ${r.modeCode} → ${r.modeLabel}`]);
  if (r.mode === 'bipap') {
    steps.push(['Session pressure', `IPAP ${r.ipap}`]);
  } else {
    const up = r.pressureChangeCount || 0;
    const down = r.rateChangeFactor || 0;
    const plain = r.minPressure + Math.max(0, up - down) * 0.5;
    const capped = Number.isFinite(r.maxPressure) && plain > r.maxPressure;
    steps.push(['Session pressure', `${r.minPressure} + max(0, ${up} up − ${down} down) × 0.5 = ${plain}${capped ? `, held at set max ${r.maxPressure}` : ''} → ${r.sessionPressure} cmH₂O`]);
  }
  steps.push(['Leak', r.leakValid ? `${r.leak} L/min` : `${r.leakRaw} is a status code (≥ 120), not a reading: left out`]);
  const hours = r.durationMinutes / 60;
  steps.push(['Events', `CSA ${r.csa} + OSA ${r.osa} + HSA ${r.hsa} = ${r.events}${hours > 0 ? `; AHI ${r.events} ÷ ${hours.toFixed(2)} h = ${(r.events / hours).toFixed(1)}` : ''}`]);
  steps.push(['Mask', r.maskType ? `code ${r.maskTypeCode} → ${r.maskType}` : `code ${r.maskTypeCode ?? '—'} → not set`]);
  steps.push(['Counted', r.suspect ? `No: ${r.suspect}` : 'Yes, in usage, AHI and the report']);
  return steps;
}
