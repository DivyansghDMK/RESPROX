// src/services/reportRange.js
//
// The report's quick date ranges, shared by every page that offers them
// (Reports, Upload Data, the public SD card page).

/** The buttons, in order: days to cover, or 'all'. */
export const RANGE_PRESETS = [[1, 'Single day'], [7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], ['all', 'All data']];

function localKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The calendar days a quick range covers (YYYY-MM-DD, inclusive). Ranges end
 * on the last day with data, so "Last 7 days" is never empty for a file read
 * a while after the last night. Single day is that last day.
 */
export function presetRange(days, dataRange) {
  if (!dataRange?.end) return null;
  if (days === 'all') return { start: dataRange.start, end: dataRange.end };
  const end = new Date(`${dataRange.end}T00:00:00`);
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1));
  return { start: localKey(start), end: dataRange.end };
}
