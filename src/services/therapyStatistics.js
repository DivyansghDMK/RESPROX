// src/services/therapyStatistics.js
//
// OSCAR-style therapy statistics and a compliance check, computed from the
// daily rows the rest of the app already uses (Reports' `deviceData.sessions`
// or the upload page's `parsed.days`).
//
// Two conventions are borrowed from OSCAR's Statistics page on purpose:
//
//   * Periods are anchored on the most recent day with data, not on today, so
//     a device that synced last week still shows a full "last 7 days".
//   * Indices are pooled over the period (events ÷ hours), not an average of
//     nightly AHIs — a 20-minute nap must not weigh as much as a full night.
//
// A period is clipped to the first recorded day: a patient two weeks into
// therapy has no "last year", and counting 351 unrecorded days as missed
// therapy would misstate their adherence.

export const COMPLIANT_HOURS = 4;
/** CMS-style adherence: ≥4 h on ≥70% of nights in a 30-day window, within the first 90 days. */
export const COMPLIANCE_RULE = { windowDays: 30, requiredNights: 21, initialDays: 90 };

const DAY_MS = 86400000;

function dayKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Calendar arithmetic, safe across DST changes (unlike adding 86400000 ms). */
function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

function finite(value) {
  const n = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(n) ? n : null;
}

/**
 * One normalized row per calendar day. Accepts both shapes in the app: report
 * sessions keep the parser's day under `raw`, upload days are the parser's day.
 */
function normalizeDays(rows = []) {
  const byDay = new Map();
  for (const row of rows) {
    if (!row || row.type === 'SETTINGS_UPDATE') continue;
    const when = new Date(row.timestamp);
    if (Number.isNaN(when.getTime())) continue;
    const src = row.raw && typeof row.raw === 'object' ? row.raw : row;
    const hours = finite(row.usage_hours) ?? 0;
    const csa = finite(src.csa);
    const osa = finite(src.osa);
    const hsa = finite(src.hsa);
    const ahi = finite(row.ahi);
    const hasSplit = csa !== null && osa !== null && hsa !== null;
    // A later row for the same day supersedes an earlier one, as in therapyReport.
    byDay.set(dayKeyOf(when), {
      date: startOfDay(when),
      hours,
      events: hasSplit ? csa + osa + hsa : (ahi !== null ? ahi * hours : null),
      csa, osa, hsa, hasSplit,
      leak: finite(row.mask_leak),
      pressure: finite(row.pressure_95),
    });
  }
  return [...byDay.values()].sort((a, b) => a.date - b.date);
}

/** Hours-weighted mean of a nightly value over the days that report it. */
function weighted(days, key) {
  const usable = days.filter((d) => d[key] !== null && d.hours > 0);
  const weight = usable.reduce((s, d) => s + d.hours, 0);
  return weight > 0 ? usable.reduce((s, d) => s + d[key] * d.hours, 0) / weight : null;
}

function summarizePeriod(days, from, to) {
  const inRange = days.filter((d) => d.date >= from && d.date <= to);
  const periodDays = daysBetween(from, to) + 1;
  const used = inRange.filter((d) => d.hours > 0);
  const compliant = used.filter((d) => d.hours >= COMPLIANT_HOURS);
  const hours = used.reduce((s, d) => s + d.hours, 0);

  const withEvents = used.filter((d) => d.events !== null);
  const eventHours = withEvents.reduce((s, d) => s + d.hours, 0);
  const index = (pick) => (eventHours > 0 ? withEvents.reduce((s, d) => s + pick(d), 0) / eventHours : null);

  // The CSA/OSA/HSA split is reported only when every night in the pool has it,
  // otherwise the parts would not add up to the AHI beside them.
  const split = withEvents.length > 0 && withEvents.every((d) => d.hasSplit);

  return {
    from,
    to,
    periodDays,
    usedDays: used.length,
    compliantDays: compliant.length,
    usedPct: periodDays ? (used.length / periodDays) * 100 : null,
    compliantPct: periodDays ? (compliant.length / periodDays) * 100 : null,
    totalHours: hours,
    avgHoursUsed: used.length ? hours / used.length : null,
    avgHoursAll: periodDays ? hours / periodDays : null,
    ahi: index((d) => d.events),
    csaIndex: split ? index((d) => d.csa) : null,
    osaIndex: split ? index((d) => d.osa) : null,
    hsaIndex: split ? index((d) => d.hsa) : null,
    leak: weighted(used, 'leak'),
    pressure: weighted(used, 'pressure'),
  };
}

/**
 * Statistics for the standard OSCAR periods, newest first.
 * Returns `{ lastDay, firstDay, periods: [{ key, label, ...summary }] }`, or
 * `null` when there is no therapy data at all.
 */
export function buildTherapyStatistics(rows) {
  const days = normalizeDays(rows);
  if (!days.length) return null;

  const firstDay = days[0].date;
  const lastDay = days[days.length - 1].date;
  const clip = (date) => (date < firstDay ? firstDay : date);

  const sixMonths = new Date(lastDay.getFullYear(), lastDay.getMonth() - 6, lastDay.getDate() + 1);
  const oneYear = new Date(lastDay.getFullYear() - 1, lastDay.getMonth(), lastDay.getDate() + 1);

  const specs = [
    { key: 'day', label: 'Most recent', from: lastDay },
    { key: 'week', label: 'Last 7 days', from: addDays(lastDay, -6) },
    { key: 'month', label: 'Last 30 days', from: addDays(lastDay, -29) },
    { key: 'sixMonths', label: 'Last 6 months', from: sixMonths },
    { key: 'year', label: 'Last year', from: oneYear },
  ];

  return {
    firstDay,
    lastDay,
    periods: specs.map((spec) => ({
      key: spec.key,
      label: spec.label,
      clipped: spec.from < firstDay,
      ...summarizePeriod(days, clip(spec.from), lastDay),
    })),
  };
}

/** Best 30-day window starting within [from, lastStart]; ties go to the earliest. */
function bestWindow(compliantKeys, from, lastStart, windowDays) {
  let best = null;
  for (let start = from; start <= lastStart; start = addDays(start, 1)) {
    let nights = 0;
    for (let i = 0; i < windowDays; i++) {
      if (compliantKeys.has(dayKeyOf(addDays(start, i)))) nights++;
    }
    if (!best || nights > best.compliantNights) {
      best = { start, end: addDays(start, windowDays - 1), compliantNights: nights };
    }
  }
  return best;
}

/**
 * Adherence against COMPLIANCE_RULE.
 *
 * `initial` checks the first 90 days of therapy (counted from the first
 * recorded day) for any 30-day window meeting the rule. Its status is
 * `met`, `not-met` once the 90 days are over without a passing window, or
 * `in-progress` while a passing window is still possible. `recent` is the
 * same test over the latest 30 days, for ongoing follow-up.
 */
export function buildComplianceCheck(rows, rule = COMPLIANCE_RULE) {
  const days = normalizeDays(rows);
  if (!days.length) return null;

  const { windowDays, requiredNights, initialDays } = rule;
  const compliantKeys = new Set(days.filter((d) => d.hours >= COMPLIANT_HOURS).map((d) => dayKeyOf(d.date)));

  const firstDay = days[0].date;
  const lastDay = days[days.length - 1].date;
  const initialEnd = addDays(firstDay, initialDays - 1);
  const elapsed = Math.min(daysBetween(firstDay, lastDay) + 1, initialDays);

  // Windows may only start once they fit inside the 90 days.
  const lastStart = addDays(firstDay, initialDays - windowDays);
  const window = bestWindow(compliantKeys, firstDay, lastStart, windowDays);

  // Days after the last record are unknown, not missed, while the 90 days are open.
  const complete = lastDay >= initialEnd;
  let status;
  if (window.compliantNights >= requiredNights) status = 'met';
  else if (complete) status = 'not-met';
  else status = 'in-progress';

  const recentFrom = addDays(lastDay, -(windowDays - 1));
  const recentNights = [...compliantKeys].filter((key) => key >= dayKeyOf(recentFrom) && key <= dayKeyOf(lastDay)).length;

  return {
    rule,
    initial: {
      status,
      firstDay,
      initialEnd,
      daysElapsed: elapsed,
      bestWindow: window,
    },
    recent: {
      from: recentFrom,
      to: lastDay,
      compliantNights: recentNights,
      pct: (recentNights / windowDays) * 100,
      met: recentNights >= requiredNights,
    },
  };
}
