// src/services/reportCalc.js
//
// The therapy report's numbers, calculated the way the DeckMount Android app
// calculates them ("DeckMount CPAP Report — Calculations & Formulas",
// sections 5 to 8), so a report printed here matches one printed on the phone.
//
// Input is the app's day rows: the file parser's days (with `report`, one
// day's sessions added up), or Reports' sessions that keep that day under
// `raw`. Rows without `report` (older telemetry, stored nights) are rebuilt
// from what they carry.

export const MODE_NAMES = { 1: 'CPAP', 2: 'AUTO CPAP', 3: 'BiPAP-S', 4: 'BiPAP-ST', 5: 'BiPAP-T', 6: 'VAPS' };
export const LEAK_THRESHOLD = 24;
export const COMPLIANT_MINUTES = 240;

function finite(value) {
  const n = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(n) ? n : null;
}

function localKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const dateOf = (key) => new Date(`${key}T00:00:00`);

/** "07 Hours, 30 Minutes" from whole minutes. */
export function fmtHM(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  const m = Math.floor(minutes);
  return `${String(Math.floor(m / 60)).padStart(2, '0')} Hours, ${String(m % 60).padStart(2, '0')} Minutes`;
}

/** Whole percent, rounded to the nearest (31/38 → 82 %); 0 when there is nothing to divide by. */
export function pct(part, whole) {
  return whole ? Math.round((part * 100) / whole) : 0;
}

/** Nearest-rank percentile of an ascending list; NaN when it is empty. */
export function percentile(sorted, p) {
  return sorted.length ? sorted[Math.floor(p * (sorted.length - 1))] : NaN;
}

/** One day's values (section 5) from a day row. */
export function dayValues(row) {
  const src = row.raw && typeof row.raw === 'object' ? row.raw : row;
  const r = src.report;
  if (r) {
    return {
      usageMinutes: r.usageMinutes,
      maxPressure: r.maxPressure,
      pressures: r.pressures || (r.maxPressure > 0 ? [r.maxPressure] : []),
      setMax: r.setMax,
      setMin: r.setMin,
      csa: r.csa, osa: r.osa, hsa: r.hsa, hasSplit: true,
      events: r.csa + r.osa + r.hsa,
      leak: r.leak,
      leaks: r.leaks,
      tidal: r.tidal,
      resp: r.resp,
      minuteVent: r.minuteVent,
      modeCode: r.modeCode,
      aflexOn: r.aflexOn,
      aflexLevel: r.aflexLevel,
      maskType: r.maskType,
    };
  }
  const hours = finite(row.usage_hours) ?? 0;
  const [csa, osa, hsa] = [src.csa, src.osa, src.hsa].map(finite);
  const hasSplit = csa !== null && osa !== null && hsa !== null;
  const ahi = finite(row.ahi);
  const leak = finite(row.mask_leak);
  return {
    usageMinutes: Math.round(hours * 60),
    maxPressure: finite(row.pressure_95) ?? 0,
    csa, osa, hsa, hasSplit,
    events: hasSplit ? csa + osa + hsa : (ahi !== null ? ahi * hours : 0),
    leak: leak ?? 0,
    leaks: leak !== null ? [leak] : [],
    pressures: finite(row.pressure_95) > 0 ? [finite(row.pressure_95)] : [],
    tidal: 0,
    resp: 0,
    minuteVent: 0,
  };
}

function rowKey(row) {
  const src = row.raw && typeof row.raw === 'object' ? row.raw : row;
  const key = row.dayKey || src.dayKey;
  if (key) return key;
  const when = new Date(row.timestamp);
  return Number.isNaN(when.getTime()) ? null : localKey(when);
}

const EMPTY_DAY = { usageMinutes: 0, maxPressure: 0, pressures: [], events: 0, csa: 0, osa: 0, hsa: 0, hasSplit: true, leak: 0, leaks: [], tidal: 0, resp: 0, minuteVent: 0 };

/**
 * Everything the report prints, over the calendar days from `startDate` to
 * `endDate` (YYYY-MM-DD, inclusive; default: first to last row). A day with
 * no session is in the list with every value 0.
 */
export function buildReportData({ rows = [], startDate, endDate } = {}) {
  const byKey = new Map();
  for (const row of rows) {
    if (!row || row.type === 'SETTINGS_UPDATE') continue;
    const key = rowKey(row);
    // A later row for the same day supersedes an earlier one.
    if (key) byKey.set(key, dayValues(row));
  }
  const keys = [...byKey.keys()].sort();
  const from = startDate || keys[0];
  const to = endDate || keys[keys.length - 1];

  const days = [];
  if (from && to) {
    for (let d = dateOf(from); localKey(d) <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const key = localKey(d);
      const v = byKey.get(key) || EMPTY_DAY;
      const hours = v.usageMinutes / 60;
      days.push({ key, date: d, ...v, hours, ahi: hours > 0 ? v.events / hours : 0 });
    }
  }

  // 6A. Usage
  const totalDays = days.length;
  const usedMins = days.map((d) => d.usageMinutes).filter((m) => m > 0);
  const usedDays = usedMins.length;
  const over4hDays = usedMins.filter((m) => m >= COMPLIANT_MINUTES).length;
  const under4hDays = usedDays - over4hDays;
  const totalMinutes = usedMins.reduce((a, b) => a + b, 0);
  const sortedUsed = [...usedMins].sort((a, b) => a - b);

  // 6B. Event indices. The apnea / hypopnea split is given only when every
  // used day carries it; otherwise its parts would not add up to the AHI.
  const totalHours = totalMinutes / 60;
  const used = days.filter((d) => d.usageMinutes > 0);
  const split = used.every((d) => d.hasSplit);
  const sum = (key) => used.reduce((a, d) => a + (d[key] || 0), 0);
  const per = (n) => (totalHours > 0 ? n / totalHours : 0);
  const central = split ? per(sum('csa')) : NaN;
  const obstructive = split ? per(sum('osa')) : NaN;
  const hi = split ? per(sum('hsa')) : NaN;
  const ai = central + obstructive;

  // 6C–6E
  const leaks = days.flatMap((d) => d.leaks);
  const ascending = (key) => days.map((d) => d[key]).filter((v) => v > 0).sort((a, b) => a - b);
  const stats3 = (sorted) => ({ max: sorted.length ? sorted[sorted.length - 1] : NaN, p95: percentile(sorted, 0.95), median: percentile(sorted, 0.5) });
  const resps = ascending('resp');

  const latest = [...days].reverse().find((d) => d.modeCode != null) || null;

  // Pressure "(avg)": each used day's highest, 95th-percentile and median
  // session pressure, averaged over those days (DeckMount's report: its
  // "Maximum (avg)" is the mean of the daily bars).
  const pressureDays = days.filter((d) => d.pressures?.length);
  const meanOf = (pick) => (pressureDays.length
    ? pressureDays.reduce((a, d) => a + pick([...d.pressures].sort((x, y) => x - y)), 0) / pressureDays.length
    : NaN);
  const pressure = {
    max: meanOf((s) => s[s.length - 1]),
    p95: meanOf((s) => percentile(s, 0.95)),
    median: meanOf((s) => percentile(s, 0.5)),
  };
  // The settings in force during the range: the last session that recorded them.
  const lastSet = [...days].reverse().find((d) => Number(d.setMax) > 0) || null;

  return {
    days,
    from: from ? dateOf(from) : null,
    to: to ? dateOf(to) : null,
    usage: {
      totalDays,
      usedDays,
      over4hDays,
      under4hDays,
      totalMinutes,
      // Averages to the nearest minute (11,961 min ÷ 38 days = 314.8 → 05 h 15 m).
      avgTotalDaysMin: totalDays ? Math.round(totalMinutes / totalDays) : 0,
      avgUsedDaysMin: usedDays ? Math.round(totalMinutes / usedDays) : 0,
      medianUsedDaysMin: sortedUsed.length ? sortedUsed[Math.floor(sortedUsed.length / 2)] : 0,
      usedPct: pct(usedDays, totalDays),
      over4hPct: pct(over4hDays, totalDays),
      under4hPct: pct(under4hDays, totalDays),
    },
    events: {
      ai,
      hi,
      ahi: split ? ai + hi : per(sum('events')),
      central,
      obstructive,
      unknown: 0,
    },
    avgLeak: leaks.length ? leaks.reduce((a, b) => a + b, 0) / leaks.length : NaN,
    leakThreshold: LEAK_THRESHOLD,
    pressure,
    set: lastSet ? { max: lastSet.setMax, min: lastSet.setMin } : null,
    tidal: stats3(ascending('tidal')),
    respMax: resps.length ? resps[resps.length - 1] : NaN,
    minuteVent: stats3(ascending('minuteVent')),
    latest,
  };
}
