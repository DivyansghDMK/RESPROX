// src/services/currentSettings.js
//
// The device's settings as they stand now, from its telemetry rows.
//
// A FULL_SYNC carries every group (CPAP, AUTO, COMFORT, OPTIONS, …) and the
// active mode. A change made on the device's own screen arrives as an UPDATE
// that carries only the one group that changed. So the newest row alone is
// not the device's settings: after an UPDATE it holds a single group, and a
// COMFORT update would even read as therapy mode "COMFORT".
//
// Rows are replayed in the order the server received them: a FULL_SYNC
// replaces everything, an UPDATE overwrites its own group, and an UPDATE to a
// therapy mode's group makes that the active mode (the device only edits the
// mode it is running). The last change wins.

export const THERAPY_MODES = new Set(['CPAP', 'AUTO', 'S', 'ST', 'T', 'VAPS']);

const timeOf = (row) => {
  const t = new Date(row?.server_timestamp || row?.device_timestamp || 0).getTime();
  return Number.isFinite(t) ? t : 0;
};

/** Telemetry rows from a `latest` or `history` response, in any wrapping. */
export function telemetryRows(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  const d = json.data ?? json;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.items)) return d.items;
  if (d && typeof d === 'object' && d.packet_type) return [d];
  return [];
}

/**
 * One FULL_SYNC-shaped row holding the device's current settings, or null when
 * there is no settings row at all. `server_timestamp` is the last change's.
 */
export function currentSettingsRow(rows = []) {
  const seen = new Set();
  const ordered = rows
    .filter((r) => r && (r.packet_type === 'FULL_SYNC' || r.packet_type === 'UPDATE') && r.decoded_payload && typeof r.decoded_payload === 'object')
    .filter((r) => {
      const id = r.id ?? r.message_id ?? `${r.packet_type}|${r.mode}|${r.server_timestamp}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => timeOf(a) - timeOf(b));
  if (!ordered.length) return null;

  let modes = {};
  let activeMode = null;
  let base = null;
  for (const row of ordered) {
    const group = String(row.mode || '').toUpperCase();
    if (row.packet_type === 'FULL_SYNC') {
      modes = { ...row.decoded_payload };
      activeMode = group || activeMode;
    } else if (group) {
      modes = { ...modes, [group]: { ...(modes[group] || {}), ...row.decoded_payload } };
      if (THERAPY_MODES.has(group)) activeMode = group;
    }
    base = row;
  }

  return {
    ...base,
    packet_type: 'FULL_SYNC',
    mode: activeMode,
    decoded_payload: modes,
  };
}
