// src/services/activityLog.js
//
// Everything a device did, as one timeline, with where it came from:
//
//   therapy     a therapy session the device recorded (its session reports):
//               started and stopped on the device
//   settings    a settings group the device sent after it changed (UPDATE)
//   full-sync   the device sent all its settings at once (FULL_SYNC), e.g.
//               when it connects
//   command     settings the website sent (GET /devices/{id}/commands, once
//               the server has it), with whether the device confirmed them
//
// A settings change the device sends right after confirming a website
// command is the website's change arriving, not a change on the device, so it
// is counted as the website's.

import { THERAPY_MODES } from './currentSettings.js';

const FIELD_LABELS = {
  pressure: ['Pressure', ' cmH₂O'],
  minPressure: ['Min pressure', ' cmH₂O'],
  maxPressure: ['Max pressure', ' cmH₂O'],
  ipap: ['IPAP', ' cmH₂O'],
  epap: ['EPAP', ' cmH₂O'],
  startEpap: ['Start EPAP', ' cmH₂O'],
  ramp: ['Ramp', ' min'],
  aflex: ['A-Flex', ''],
  rampTime: ['Comfort ramp', ' min'],
  humidifierLevel: ['Humidifier', ''],
  tubeType: ['Tube type', ''],
  maskType: ['Mask type', ''],
  iModeEnabled: ['I-Mode', ''],
  leakAlertEnabled: ['Leak alert', ''],
  sleepModeEnabled: ['Sleep mode', ''],
};

const GROUP_LABELS = {
  CPAP: 'CPAP settings', AUTO: 'AUTO CPAP settings', S: 'BiPAP S settings', ST: 'BiPAP ST settings',
  T: 'BiPAP T settings', VAPS: 'VAPS settings', COMFORT: 'Comfort settings', OPTIONS: 'Options', CONFIG: 'Device clock and config',
};

const MASKS = { 1: 'Full Face', 2: 'Nasal', 3: 'Pillow' };
const MATCH_WINDOW_MS = 3 * 60 * 1000;

function words(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

/** "Ramp", "0 min" for one field's value. */
export function describeField(key, value) {
  const [label, unit] = FIELD_LABELS[key] || [words(key), ''];
  let text;
  if (value === null || value === undefined || value === '') text = '—';
  else if (typeof value === 'boolean') text = value ? 'On' : 'Off';
  else if (key === 'maskType') text = MASKS[value] || String(value);
  else if ((key === 'ramp' || key === 'rampTime') && Number(value) === 0) text = 'Off';
  else if (key === 'humidifierLevel' && Number(value) === 0) text = 'Off';
  else text = `${value}${unit}`;
  return { label, text };
}

function diff(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const out = [];
  for (const key of keys) {
    if (key === 'raw') continue;
    const a = before?.[key];
    const b = after?.[key];
    if (a === undefined || JSON.stringify(a) === JSON.stringify(b)) continue;
    const { label, text: to } = describeField(key, b);
    out.push({ key, label, from: describeField(key, a).text, to });
  }
  return out;
}

const time = (v) => {
  const t = new Date(v || 0).getTime();
  return Number.isFinite(t) ? t : 0;
};

/** A website command row → its group and requested values. */
function commandParts(c) {
  const req = typeof c.requested_values === 'string' ? safeJson(c.requested_values) : c.requested_values;
  const orig = typeof c.original_values === 'string' ? safeJson(c.original_values) : c.original_values;
  // requested_values is either { AUTO: {...} } or the group's fields flat.
  const group = String(c.mode || (req && Object.keys(req).length === 1 ? Object.keys(req)[0] : '') || '').toUpperCase();
  const values = req && req[group] && typeof req[group] === 'object' ? req[group] : req || {};
  const before = orig && orig[group] && typeof orig[group] === 'object' ? orig[group] : orig || {};
  return { group, values, before };
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

const CONFIRMED = new Set(['ACKED', 'ACK', 'SUCCESS', 'CONFIRMED', 'APPLIED']);
const FAILED = new Set(['FAILED', 'NACKED', 'NACK', 'PUBLISH_FAILED', 'TIMEOUT', 'EXPIRED', 'REJECTED']);

export function commandStatus(status) {
  const s = String(status || '').toUpperCase();
  if (CONFIRMED.has(s)) return { key: 'confirmed', label: 'Confirmed by device' };
  if (FAILED.has(s)) return { key: 'failed', label: s === 'TIMEOUT' || s === 'EXPIRED' ? 'Device did not answer' : 'Not applied' };
  return { key: 'pending', label: 'Waiting for device' };
}

/**
 * The timeline, newest first, and how many of each there are.
 * telemetry: decoded telemetry rows; records: parsed session records
 * (reportFileParser); commands: website command rows, or null when the server
 * has no commands list yet.
 */
export function buildActivity({ telemetry = [], records = [], commands = null } = {}) {
  const events = [];

  // Website commands first, so device updates can be matched to them.
  const cmdEvents = (commands || []).map((c) => {
    const { group, values, before } = commandParts(c);
    const status = commandStatus(c.status || c.ack_status);
    const changes = Object.keys(before).length ? diff(before, { ...before, ...values })
      : Object.entries(values).map(([key, v]) => ({ key, ...describeField(key, v), from: null, to: describeField(key, v).text }));
    return {
      id: `cmd-${c.id}`,
      at: time(c.sent_at || c.created_at),
      ackAt: c.acked_at ? time(c.acked_at) : null,
      kind: 'command',
      source: 'website',
      title: `${GROUP_LABELS[group] || 'Settings'} sent from the website`,
      group,
      values,
      changes,
      status,
      matched: false,
    };
  });
  events.push(...cmdEvents);

  // Replay the device's settings packets, oldest first.
  const rows = telemetry
    .filter((r) => r && (r.packet_type === 'FULL_SYNC' || r.packet_type === 'UPDATE') && r.decoded_payload)
    .sort((a, b) => time(a.server_timestamp) - time(b.server_timestamp));
  let state = null;
  let activeMode = null;
  const seen = new Set();
  for (const r of rows) {
    const id = r.id ?? r.message_id ?? `${r.packet_type}|${r.mode}|${r.server_timestamp}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const at = time(r.server_timestamp || r.device_timestamp);
    const group = String(r.mode || '').toUpperCase();

    if (r.packet_type === 'FULL_SYNC') {
      const changes = [];
      if (state) {
        if (activeMode && group && activeMode !== group) changes.push({ key: 'mode', label: 'Mode', from: activeMode, to: group });
        for (const g of Object.keys(r.decoded_payload)) changes.push(...diff(state[g], r.decoded_payload[g]).map((c) => ({ ...c, label: `${c.label}${g === group || g === 'COMFORT' || g === 'OPTIONS' ? '' : ` (${g})`}` })));
      }
      events.push({ id: `fs-${id}`, at, kind: 'full-sync', source: 'device', title: 'Device sent all its settings', group, changes });
      state = { ...r.decoded_payload };
      activeMode = group || activeMode;
      continue;
    }

    const changes = diff(state?.[group], r.decoded_payload);
    if (THERAPY_MODES.has(group) && activeMode && activeMode !== group) changes.unshift({ key: 'mode', label: 'Mode', from: activeMode, to: group });
    state = { ...(state || {}), [group]: { ...(state?.[group] || {}), ...r.decoded_payload } };
    if (THERAPY_MODES.has(group)) activeMode = group;

    // The device reporting values the website just sent: the website's change.
    const cmd = cmdEvents.find((c) => !c.matched && c.group === group && c.status.key !== 'failed'
      && at >= c.at && at - c.at <= MATCH_WINDOW_MS
      && Object.entries(c.values).every(([k, v]) => r.decoded_payload[k] === undefined || Number(r.decoded_payload[k]) === Number(v)));
    if (cmd) {
      cmd.matched = true;
      continue;
    }
    events.push({
      id: `up-${id}`, at, kind: 'settings', source: 'device',
      title: `${GROUP_LABELS[group] || 'Settings'} changed on the device`,
      group, changes,
    });
  }

  // Therapy sessions the device recorded.
  for (const rec of records) {
    const minutes = rec.durationMinutes ?? Math.round((rec.durationHours || 0) * 60);
    events.push({
      id: `th-${rec.dayKey}-${rec.startClock}-${rec.lineNo}`,
      at: rec.start instanceof Date ? rec.start.getTime() : time(rec.start),
      kind: 'therapy',
      source: 'device',
      title: 'Therapy session',
      detail: `${rec.startClock} – ${rec.endClock} · ${Math.floor(minutes / 60)}h ${minutes % 60}m`,
      minutes,
      changes: [],
    });
  }

  events.sort((a, b) => b.at - a.at);

  const count = (fn) => events.filter(fn).length;
  return {
    events,
    counts: {
      therapy: count((e) => e.kind === 'therapy'),
      deviceChanges: count((e) => e.kind === 'settings'),
      websiteChanges: count((e) => e.kind === 'command'),
      websiteConfirmed: count((e) => e.kind === 'command' && e.status.key === 'confirmed'),
      fullSyncs: count((e) => e.kind === 'full-sync'),
    },
    hasCommands: commands !== null,
  };
}
