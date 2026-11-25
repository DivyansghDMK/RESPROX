// src/services/therapyCalendar.js
//
// The 30-day calendar on Reports and the SD card page: every date in the
// window, coloured by how that therapy day (noon to noon) went.

export const CALENDAR_DAYS = 30;
/** A night meets compliance with at least 4 h of use in all its sessions. */
export const COMPLIANT_MINUTES = 240;
/** AHI from here up is marked on the date. */
export const HIGH_AHI = 5;

export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The key `n` days after `key` (n may be negative). */
export function shiftKey(key, n) {
  const d = new Date(`${key}T00:00:00`);
  return dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/**
 * What the calendar needs from each day, by day key, from parsed days
 * (reportFileParser) or, for older telemetry, the device's day rows.
 */
export function calendarSummary(days = []) {
  const byDay = new Map();
  for (const d of days) {
    const key = d.dayKey || (d.timestamp ? dateKey(new Date(d.timestamp)) : '');
    if (!key) continue;
    const minutes = d.report?.usageMinutes ?? Math.round((Number(d.usage_hours) || 0) * 60);
    byDay.set(key, {
      minutes,
      ahi: Number.isFinite(Number(d.ahi)) ? Number(d.ahi) : null,
      sessions: d.sessionCount ?? 1,
      leak: d.report?.leak || (Number.isFinite(Number(d.mask_leak)) ? Number(d.mask_leak) : null),
    });
  }
  return byDay;
}

/** none: no therapy · low: used, under 4 h · met: 4 h or more. */
export function dayStatus(info) {
  if (!info || !(info.minutes > 0)) return 'none';
  return info.minutes >= COMPLIANT_MINUTES ? 'met' : 'low';
}

/**
 * The `n` dates ending on `endKey`, oldest first, each with its status, and
 * the window's totals.
 */
export function calendarWindow(byDay, endKey, n = CALENDAR_DAYS) {
  const cells = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = shiftKey(endKey, -i);
    const info = byDay.get(key) || null;
    const status = dayStatus(info);
    cells.push({ key, info, status, highAhi: status !== 'none' && info.ahi != null && info.ahi >= HIGH_AHI });
  }
  const used = cells.filter((c) => c.status !== 'none').length;
  const met = cells.filter((c) => c.status === 'met').length;
  return { cells, used, met, low: used - met, none: n - used, compliance: Math.round((met / n) * 100) };
}
