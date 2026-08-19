// src/services/reportFileParser.js
//
// Parses a REPORTFL.TXT session log pulled off a DeckMount CPAP/BiPAP device
// into the session shape that `therapyReport.js` already consumes, so an
// uploaded file produces the exact same clinical report as live telemetry.
//
// One line is one therapy session. Fields are positional, comma separated,
// opened with "S" and closed with "A"; devices append their serial after the
// terminator. Field meanings come from the device firmware's record spec,
// transcribed in FIELDS below.
//
// Two properties of the format need care and are handled explicitly rather
// than averaged over:
//
//   * A session carries a start *and* an end date, so a night that crosses
//     midnight is a single record. Duration is therefore computed from the
//     full timestamps, and the session is attributed to the date it started
//     on — the usual convention for sleep therapy, so one night is one row.
//
//   * The leak field is not always a leak. Alongside plausible readings
//     (0-30 L/min) the devices emit codes at 120-129 and 196; the 196 frames
//     are the zero-duration configuration echoes the device writes at power
//     on. Treating those as litres per minute would report every night as a
//     blown mask, so anything at or above LEAK_SENTINEL is carried through as
//     raw data but excluded from leak statistics and counted for the operator.

/** Field index -> meaning, as documented by the device record spec. */
export const FIELDS = [
  'record marker', 'start day', 'start month', 'start year',
  'end day', 'end month', 'end year', 'mode', 'volume transfer',
  'max pressure', 'min pressure', 'IPAP', 'EPAP', 'pressure change count',
  'CPAP/BiPAP counter', 'air flow', 'tidal volume', 'resp rate', 'start EPAP',
  'start hour', 'start min', 'end hour', 'end min', 'humidifier level',
  'ramp time', 'auto on/off', 'titration change factor',
  'rate change factor / minute ventilation', 'CSA count', 'OSA count',
  'HSA count', 'reserved 31', 'reserved 32', 'A-Flex on/off', 'A-Flex level',
  'reserved 35', 'mask type', 'reserved 37', 'leak', 'record terminator',
  'serial number',
];

const MIN_FIELDS = 39;       // through the leak value; terminator/serial optional
const LEAK_SENTINEL = 120;   // at or above this the field is a status code
const MAX_SESSION_HOURS = 24;

const MASK_TYPES = { 1: 'Nasal', 2: 'Full Face', 3: 'Pillow' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── primitives ────────────────────────────────────────────────────────────────

/** Strict integer read: anything non-numeric becomes NaN rather than 0. */
function int(value) {
  const text = String(value ?? '').trim();
  if (!/^-?\d+$/.test(text)) return NaN;
  return parseInt(text, 10);
}

/** Two-digit device years are this century. */
function fullYear(yy) {
  return Number.isNaN(yy) ? NaN : (yy < 100 ? 2000 + yy : yy);
}

/**
 * Build a local Date, rejecting values the calendar would silently roll over
 * (month 13, day 32) so corrupt records surface instead of shifting a session.
 */
function makeDate(day, month, year, hour, minute) {
  const y = fullYear(year);
  if ([day, month, y, hour, minute].some(Number.isNaN)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const date = new Date(y, month - 1, day, hour, minute, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayLabel(date) {
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function clock(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Mean weighted by session length, so a two-minute frame cannot pull a night's
 * average as hard as an eight-hour one. Falls back to a plain mean when every
 * contributing record has zero duration.
 */
function weightedMean(pairs) {
  const usable = pairs.filter(([value]) => Number.isFinite(value));
  if (!usable.length) return null;
  const weight = usable.reduce((sum, [, w]) => sum + (w > 0 ? w : 0), 0);
  if (weight > 0) {
    return usable.reduce((sum, [value, w]) => sum + value * (w > 0 ? w : 0), 0) / weight;
  }
  return usable.reduce((sum, [value]) => sum + value, 0) / usable.length;
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// ── record parsing ────────────────────────────────────────────────────────────

/**
 * Classify therapy mode. The record carries a numeric mode, but the pressure
 * columns are the reliable signal across firmware revisions: a set IPAP/EPAP
 * pair is bi-level, a min/max spread is auto-titrating, anything else is fixed
 * pressure CPAP.
 */
function classifyMode(modeCode, { ipap, epap, minPressure, maxPressure }) {
  if (ipap > 0 || epap > 0) return 'bipap';
  if (minPressure > 0 && maxPressure > minPressure) return 'auto';
  return 'cpap';
}

const MODE_LABELS = { bipap: 'BiPAP (ST MODE)', auto: 'AUTO CPAP', cpap: 'CPAP' };

/** Parse a single line. Returns a record, or `{ error }` if it is unusable. */
export function parseRecordLine(line, lineNo) {
  const text = String(line).trim();
  const parts = text.split(',').map((part) => part.trim());

  if (parts[0] !== 'S') {
    return { error: { lineNo, text, reason: 'does not start with the "S" record marker' } };
  }
  if (parts.length < MIN_FIELDS) {
    return { error: { lineNo, text, reason: `only ${parts.length} fields, expected at least ${MIN_FIELDS}` } };
  }

  const start = makeDate(int(parts[1]), int(parts[2]), int(parts[3]), int(parts[19]), int(parts[20]));
  const end = makeDate(int(parts[4]), int(parts[5]), int(parts[6]), int(parts[21]), int(parts[22]));
  if (!start) return { error: { lineNo, text, reason: 'unreadable start date/time' } };
  if (!end) return { error: { lineNo, text, reason: 'unreadable end date/time' } };

  const maxPressure = int(parts[9]);
  const minPressure = int(parts[10]);
  const ipap = int(parts[11]);
  const epap = int(parts[12]);

  const modeCode = int(parts[7]);
  const mode = classifyMode(modeCode, { ipap, epap, minPressure, maxPressure });

  const csa = int(parts[28]) || 0;
  const osa = int(parts[29]) || 0;
  const hsa = int(parts[30]) || 0;

  const leakRaw = int(parts[38]);
  const leakValid = Number.isFinite(leakRaw) && leakRaw < LEAK_SENTINEL;

  const durationHours = (end - start) / 3600000;

  // A record is kept but excluded from statistics when its own timestamps say
  // it cannot be a night of therapy — a device clock glitch must not silently
  // add days of "usage".
  let suspect = null;
  if (durationHours < 0) suspect = 'ends before it starts';
  else if (durationHours > MAX_SESSION_HOURS) suspect = `spans ${durationHours.toFixed(1)} h, longer than a ${MAX_SESSION_HOURS} h session`;

  const maskCode = int(parts[36]);

  return {
    record: {
      lineNo,
      raw: text,
      start,
      end,
      startClock: clock(int(parts[19]), int(parts[20])),
      endClock: clock(int(parts[21]), int(parts[22])),
      dayKey: dayKey(start),
      dateLabel: dayLabel(start),
      durationHours,
      crossesMidnight: dayKey(start) !== dayKey(end),

      modeCode,
      mode,
      modeLabel: MODE_LABELS[mode],

      volumeTransfer: int(parts[8]),
      maxPressure,
      minPressure,
      ipap,
      epap,
      // Set therapy pressure: the file records what the device was told to
      // deliver. It carries no measured pressure trace.
      setPressure: mode === 'bipap' ? ipap : maxPressure,

      pressureChangeCount: int(parts[13]),
      modeCounter: int(parts[14]),
      airFlow: int(parts[15]),
      tidalVolume: int(parts[16]),
      respRate: int(parts[17]),
      startEpap: int(parts[18]),

      humidifier: int(parts[23]),
      rampTime: int(parts[24]),
      autoOnOff: int(parts[25]),
      titrationChangeFactor: int(parts[26]),
      rateChangeFactor: int(parts[27]),

      csa,
      osa,
      hsa,
      events: csa + osa + hsa,

      aflexOn: int(parts[33]) === 2,
      aflexLevel: int(parts[34]),
      maskTypeCode: maskCode,
      maskType: MASK_TYPES[maskCode] || null,

      leakRaw,
      leakValid,
      leak: leakValid ? leakRaw : null,

      terminatorOk: parts[39] === 'A',
      serial: parts[40] || null,
      suspect,
    },
  };
}

// ── daily aggregation ─────────────────────────────────────────────────────────

/**
 * Collapse records into one row per calendar day.
 *
 * This has to happen here rather than in the report builder: the builder keeps
 * a single frame per day, which is right for live telemetry (one frame per
 * night) but would throw away all but the last session of a day in a file that
 * records every mask-on separately.
 */
function aggregateDays(records) {
  const buckets = new Map();

  for (const record of records) {
    if (!buckets.has(record.dayKey)) buckets.set(record.dayKey, []);
    buckets.get(record.dayKey).push(record);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, all]) => {
      const counted = all.filter((r) => !r.suspect);
      const usageHours = counted.reduce((sum, r) => sum + r.durationHours, 0);
      const events = counted.reduce((sum, r) => sum + r.events, 0);
      const first = all[0];

      const leak = weightedMean(counted.filter((r) => r.leakValid).map((r) => [r.leak, r.durationHours]));
      const pressure = weightedMean(counted.map((r) => [r.setPressure, r.durationHours]));
      const tidal = weightedMean(counted.map((r) => [r.tidalVolume, r.durationHours]));
      const airFlow = weightedMean(counted.map((r) => [r.airFlow, r.durationHours]));

      return {
        // Consumed by therapyReport.js — these names are its contract.
        timestamp: first.start.getTime(),
        date: dayLabel(first.start),
        usage_hours: round(usageHours, 2) ?? 0,
        ahi: usageHours > 0 ? round(events / usageHours, 1) : 0,
        mask_leak: round(leak, 1),
        pressure_95: round(pressure, 1),
        mode: first.modeLabel,

        // Retained for the on-screen preview and CSV export.
        dayKey: key,
        sessionCount: all.length,
        countedSessions: counted.length,
        suspectSessions: all.length - counted.length,
        csa: counted.reduce((sum, r) => sum + r.csa, 0),
        osa: counted.reduce((sum, r) => sum + r.osa, 0),
        hsa: counted.reduce((sum, r) => sum + r.hsa, 0),
        events,
        tidalVolume: round(tidal, 0),
        airFlow: round(airFlow, 0),
        firstOn: first.startClock,
        lastOff: all[all.length - 1].endClock,
      };
    });
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Parse a whole REPORTFL.TXT.
 *
 * Never throws on malformed input: unusable lines are collected in `errors` so
 * the operator can see exactly which rows were dropped and why.
 */
export function parseReportFile(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const records = [];
  const errors = [];

  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const { record, error } = parseRecordLine(line, index + 1);
    if (error) errors.push(error);
    else records.push(record);
  });

  records.sort((a, b) => a.start - b.start);

  const days = aggregateDays(records);
  const counted = records.filter((r) => !r.suspect);

  const serials = [...new Set(records.map((r) => r.serial).filter(Boolean))];
  const latest = counted[counted.length - 1] || records[records.length - 1] || null;

  const totalHours = counted.reduce((sum, r) => sum + r.durationHours, 0);
  const totalEvents = counted.reduce((sum, r) => sum + r.events, 0);
  const usedDays = days.filter((d) => d.usage_hours > 0);

  const settings = latest
    ? {
      therapy_mode: latest.modeLabel,
      min_pressure: latest.mode === 'bipap' ? latest.epap : latest.minPressure,
      max_pressure: latest.mode === 'bipap' ? latest.ipap : latest.maxPressure,
      pressure: latest.setPressure,
      ramp: latest.rampTime,
      aflex: latest.aflexOn ? latest.aflexLevel : 0,
      humidifier: latest.humidifier,
      mask_type: latest.maskType,
      serial: latest.serial || serials[0] || null,
    }
    : {};

  return {
    records,
    days,
    errors,
    serial: serials[0] || null,
    multipleSerials: serials.length > 1,
    serials,
    settings,
    mode: latest?.mode || 'cpap',
    modeLabel: latest?.modeLabel || null,
    summary: {
      lines: lines.filter((l) => l.trim()).length,
      records: records.length,
      dropped: errors.length,
      suspect: records.length - counted.length,
      leakSentinel: counted.filter((r) => !r.leakValid).length,
      leakSentinelValues: [...new Set(counted.filter((r) => !r.leakValid).map((r) => r.leakRaw))]
        .filter(Number.isFinite).sort((a, b) => a - b),
      days: days.length,
      usedDays: usedDays.length,
      compliantDays: usedDays.filter((d) => d.usage_hours >= 4).length,
      totalHours,
      avgHours: usedDays.length ? totalHours / usedDays.length : NaN,
      ahi: totalHours > 0 ? totalEvents / totalHours : NaN,
      events: totalEvents,
      firstDate: records[0]?.start || null,
      lastDate: records.length ? records[records.length - 1].end : null,
    },
  };
}

/** `YYYY-MM-DD` bounds covering the file, for pre-filling the date range. */
export function dateRangeOf(parsed) {
  const first = parsed.days[0];
  const last = parsed.days[parsed.days.length - 1];
  return { start: first?.dayKey || '', end: last?.dayKey || '' };
}

/** Daily rows as CSV, for operators who want the numbers outside the PDF. */
export function daysToCSV(days) {
  const head = [
    'Date', 'Sessions', 'Usage hours', 'AHI', 'Events', 'CSA', 'OSA', 'HSA',
    'Leak L/min', 'Set pressure cmH2O', 'Tidal volume mL', 'Air flow',
    'First on', 'Last off', 'Excluded sessions',
  ];
  const rows = days.map((d) => [
    d.dayKey, d.sessionCount, d.usage_hours, d.ahi, d.events, d.csa, d.osa, d.hsa,
    d.mask_leak ?? '', d.pressure_95 ?? '', d.tidalVolume ?? '', d.airFlow ?? '',
    d.firstOn, d.lastOff, d.suspectSessions,
  ]);
  return [head, ...rows]
    .map((row) => row.map((cell) => {
      const value = String(cell ?? '');
      return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    }).join(','))
    .join('\n');
}

export const PARSER_CONSTANTS = { LEAK_SENTINEL, MAX_SESSION_HOURS, MIN_FIELDS };
