import { clearCognitoSession, getCognitoSession, refreshCognitoSession, loginWithTeamKey, TEAM_KEY_STORAGE } from './respireeAuth';
import { parseReportRows } from './reportFileParser';

const BASE_URL = import.meta.env.VITE_RESPIREE_API_BASE_URL
  || (import.meta.env.DEV ? '/api-proxy' : 'https://52ct9sbsu3.execute-api.us-east-1.amazonaws.com');

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatSessionDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatSessionLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function extractSerial(item) {
  return firstDefined(item?.serial, item?.deviceId, item?.device_id, item?.id, item?.device_id_serial, item?.deviceSerial) || '';
}

function extractTherapyStatus(item) {
  return String(firstDefined(
    item?.therapy_status,
    item?.therapyStatus,
    item?.data?.therapy_status,
    item?.data?.therapyStatus,
    item?.state?.therapy_status,
    item?.state?.therapyStatus,
  ) || '').toUpperCase();
}

function extractStatus(item, syncState, latestTelemetry) {
  const explicit = firstDefined(item?.status, syncState?.status, syncState?.direction, latestTelemetry?.status);
  if (!explicit) return 'unknown';
  const normalized = String(explicit).toLowerCase();
  if (normalized.includes('online') || normalized.includes('synced') || normalized.includes('success')) return 'online';
  if (normalized.includes('offline') || normalized.includes('stale') || normalized.includes('error')) return 'offline';
  return normalized;
}

function normalizeTelemetry(raw = {}) {
  // Check if raw contains a raw byte array under raw.raw
  const bytes = raw.raw;
  let parsed = {};

  if (Array.isArray(bytes) && bytes.length >= 66 && bytes[0] === 232) {
    const day = bytes[60];
    const month = bytes[61];
    const year = 2000 + bytes[62];
    const hour = bytes[63];
    const minute = bytes[64] < 60 ? bytes[64] : 0;
    const second = bytes[65] < 60 ? bytes[65] : 0;

    const devDate = new Date(year, month - 1, day, hour, minute, second);
    const isValidDevDate = !isNaN(devDate.getTime()) && month >= 1 && month <= 12 && day >= 1 && day <= 31;
    const ts = isValidDevDate ? devDate.toISOString() : (raw.server_timestamp || raw.serverTimestamp || raw.timestamp);

    const usage_hours = Number((bytes[4] / 10).toFixed(2));
    const ahi = Number((bytes[5] / 10).toFixed(1));
    const mask_leak = Number((bytes[6] / 10).toFixed(1));
    const pressure_95 = Number(bytes[7].toFixed(1));
    const therapy_mode = bytes[8] === 3 ? 'CPAP' : null;

    parsed = {
      serial: raw.device_id || '',
      usage_hours,
      ahi,
      mask_leak,
      pressure_95,
      compliance_pct: usage_hours >= 4.0 ? 100 : 0,
      therapy_mode,
      min_pressure: bytes[10],
      max_pressure: bytes[9],
      aflex: bytes[11],
      ramp: bytes[12],
      timestamp: ts,
    };
  }

  const autoObj = raw.AUTO || raw.settings?.AUTO || raw.device_settings?.AUTO || raw.decoded_payload?.AUTO || raw.modes?.AUTO;
  const cpapObj = raw.CPAP || raw.settings?.CPAP || raw.device_settings?.CPAP || raw.decoded_payload?.CPAP || raw.modes?.CPAP;

  const therapyModeRaw = firstDefined(parsed.therapy_mode, raw.therapy_mode, raw.therapyMode, raw.mode, raw.activeMode);
  const therapyMode = typeof therapyModeRaw === 'string' && therapyModeRaw.toLowerCase().includes('auto')
    ? 'AUTO CPAP'
    : (therapyModeRaw || null);

  const ts0 = parsed.timestamp || firstDefined(raw.timestamp, raw.time, raw.deviceTimestamp, raw.created_at, raw.recorded_at, raw.synced_at, raw.updated_at);

  return {
    raw,
    serial: parsed.serial || extractSerial(raw),
    usage_hours: parsed.usage_hours ?? toNumber(firstDefined(raw.usage_hours, raw.usageHours, raw.usage_minutes != null ? Number(raw.usage_minutes) / 60 : null, raw.usageMinutes != null ? Number(raw.usageMinutes) / 60 : null)),
    ahi: parsed.ahi ?? toNumber(firstDefined(raw.ahi, raw.ahi_score, raw.ahiScore)),
    mask_leak: parsed.mask_leak ?? toNumber(firstDefined(raw.mask_leak, raw.maskLeak, raw.leak, raw.leak_rate, raw.leakRate)),
    pressure_95: parsed.pressure_95 ?? toNumber(firstDefined(raw.pressure_95, raw.pressure95, raw.pressure95th, raw.pressure)),
    compliance_pct: parsed.compliance_pct ?? toNumber(firstDefined(raw.compliance_pct, raw.compliancePct, raw.compliance, raw.adherence_pct)),
    therapy_mode: therapyMode,
    pressure: cpapObj?.pressure ?? parsed.pressure ?? toNumber(firstDefined(raw.pressure, raw.current_pressure, raw.set_pressure)),
    min_pressure: autoObj?.minPressure ?? parsed.min_pressure ?? toNumber(firstDefined(raw.min_pressure, raw.minPressure)),
    max_pressure: autoObj?.maxPressure ?? parsed.max_pressure ?? toNumber(firstDefined(raw.max_pressure, raw.maxPressure)),
    aflex: autoObj?.aflex ?? parsed.aflex ?? toNumber(firstDefined(raw.aflex, raw.epr, raw.epr_level)),
    ramp: cpapObj?.ramp ?? autoObj?.ramp ?? parsed.ramp ?? toNumber(firstDefined(raw.ramp, raw.ramp_time, raw.rampTime)),
    timestamp: ts0,
    dateLabel: formatSessionLabel(ts0),
    displayDate: formatSessionDate(ts0),
  };
}

function normalizeDeviceSummary(raw = {}) {
  const latest = normalizeTelemetry(raw.latest || raw.telemetry_latest || raw.latestTelemetry || raw.telemetry || {});
  const syncState = raw.sync_state || raw.syncState || {};
  const serial = extractSerial(raw) || latest.serial;
  const status = extractStatus(raw, syncState, latest.raw);

  return {
    raw,
    serial,
    model: firstDefined(raw.model, raw.device_model, raw.deviceModel, raw.product_line) || null,
    firmware: firstDefined(raw.firmware, raw.firmware_version, raw.firmwareVersion, raw.software_version, raw.softwareVersion) || '—',
    patient_name: firstDefined(raw.patient_name, raw.patientName, raw.owner_name, raw.user_name) || null,
    status,
    device_type: firstDefined(raw.device_type, raw.deviceType) || '',
    therapy_status: extractTherapyStatus(raw),
    compliance_pct: latest.compliance_pct ?? toNumber(firstDefined(raw.compliance_pct, raw.compliancePct)),
    ahi: latest.ahi ?? toNumber(firstDefined(raw.ahi)),
    usage_hours: latest.usage_hours ?? toNumber(firstDefined(raw.usage_hours)),
    latest,
    sync_state: syncState,
    readOnly: false,
  };
}

function normalizeSessions(history = []) {
  const items = Array.isArray(history)
    ? history
    : (history?.data?.items || history?.items || (Array.isArray(history?.data) ? history.data : null) || history?.records || []);
  
  return items.map((entry) => {
    const entryPayload = entry?.decoded_payload || entry || {};
    const rawBytes = entryPayload.raw || entry.raw;
    const hasRawBytes = Array.isArray(rawBytes) && rawBytes.length >= 20;

    const autoObj = entryPayload.AUTO || entry.AUTO || entryPayload.settings?.AUTO;
    const cpapObj = entryPayload.CPAP || entry.CPAP || entryPayload.settings?.CPAP;
    const isSettingsFrame = (entryPayload.CONFIG || autoObj || cpapObj) && !hasRawBytes;

    const serverTs = entry?.server_timestamp || entry?.serverTimestamp || entry?.device_timestamp || entry?.deviceTimestamp
      || entry?.session_timestamp || entry?.sessionTimestamp || entry?.timestamp || entry?.date;
    const tsMs = serverTs ? new Date(serverTs).getTime() : 0;

    if (isSettingsFrame) {
      const mode = entry.mode || entryPayload.mode || null;
      return {
        type: 'SETTINGS_UPDATE',
        date: formatSessionLabel(serverTs),
        display_date: formatSessionDate(serverTs),
        timestamp: tsMs,
        mode,
        pressure: cpapObj?.pressure ?? null,
        min_pressure: autoObj?.minPressure ?? null,
        max_pressure: autoObj?.maxPressure ?? null,
        aflex: autoObj?.aflex ?? null,
        ramp: (/auto/i.test(String(mode)) ? autoObj?.ramp : cpapObj?.ramp) ?? null,
        usage_hours: null,
        ahi: null,
        mask_leak: null,
        pressure_95: null,
        compliance_pct: null,
        raw: entry,
      };
    }

    const entryData = {
      ...entryPayload,
      server_timestamp: serverTs,
    };
    const telemetry = normalizeTelemetry(entryData);
    return {
      type: 'TELEMETRY_SESSION',
      date: telemetry.dateLabel,
      display_date: telemetry.displayDate,
      timestamp: telemetry.timestamp || tsMs,
      ahi: telemetry.ahi ?? null,
      usage_hours: telemetry.usage_hours ?? null,
      mask_leak: telemetry.mask_leak ?? null,
      pressure_95: telemetry.pressure_95 ?? null,
      compliance_pct: telemetry.compliance_pct ?? null,
      mode: telemetry.therapy_mode,
      pressure: telemetry.pressure,
      min_pressure: telemetry.min_pressure,
      max_pressure: telemetry.max_pressure,
      aflex: telemetry.aflex,
      ramp: telemetry.ramp,
      raw: entry,
    };
  });
}

function normalizeReportList(raw = []) {
  if (Array.isArray(raw)) return raw;
  return raw?.data?.items || raw?.data?.reports || raw?.items || raw?.reports
    || (Array.isArray(raw?.data) ? raw.data : []) || raw?.records || [];
}

/**
 * GET /devices/{id}/reports rows are the device's session records (the same
 * record as REPORTFL.TXT), so they share the file parser's rules and come back
 * as one row per day, oldest first.
 */
function reportDaysToSessions(rows) {
  return parseReportRows(rows).days.map((d) => ({
    type: 'REPORT_DAY',
    date: formatSessionLabel(d.timestamp),
    display_date: formatSessionDate(d.timestamp),
    timestamp: d.timestamp,
    usage_hours: d.usage_hours,
    ahi: d.ahi,
    mask_leak: d.mask_leak ?? null,
    pressure_95: d.pressure_95 ?? null,
    compliance_pct: d.usage_hours >= 4 ? 100 : 0,
    mode: d.mode,
    raw: d,
  }));
}

/** COMFORT / OPTIONS wire fields → the snake_case keys the Settings screen reads. */
function comfortOptionSettings(modes = {}) {
  const comfort = modes.COMFORT || {};
  const options = modes.OPTIONS || {};
  const out = {
    mask_type: comfort.maskType,
    tube_type: comfort.tubeType,
    humidifier: firstDefined(comfort.humidifierLevel, comfort.humidifier),
    ramp_time: comfort.rampTime,
    i_mode: options.iModeEnabled,
    leak_alert: options.leakAlertEnabled,
    sleep_mode: options.sleepModeEnabled,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && v !== null));
}

function normalizeDeviceDetail(summary, latest, history, syncState, reports = []) {
  const deviceSummary = summary || {};
  const storedReports = normalizeReportList(reports);
  const reportSessions = reportDaysToSessions(storedReports);
  const allSessions = reportSessions.length ? reportSessions : normalizeSessions(history);
  // Live history is mostly FULL_SYNC settings frames. They are not nights of
  // therapy, so they must never feed usage, AHI or compliance figures.
  const sessions = allSessions.filter((s) => s.type !== 'SETTINGS_UPDATE');
  const settingsHistory = allSessions.filter((s) => s.type === 'SETTINGS_UPDATE');
  const actualSyncState = syncState?.data || syncState || {};

  const latestDataWrapper = latest?.data || latest?.telemetry || latest || {};
  const latestDataPayload = latestDataWrapper.decoded_payload || latestDataWrapper.modes || {};
  const latestTelemetry = {
    ...latestDataWrapper,
    ...latestDataPayload,
    server_timestamp: latestDataWrapper.server_timestamp || latest?.server_timestamp,
  };
  let telemetry = normalizeTelemetry(latestTelemetry);

  // If latest telemetry is a settings configuration frame without clinical session bytes,
  // fallback to the most recent clinical session for top metric cards
  if ((!telemetry.usage_hours && !telemetry.ahi && !telemetry.mask_leak) && sessions.length > 0) {
    // Sources differ in order; the newest session is the one with the latest timestamp.
    const latestSession = sessions.reduce((a, b) => ((b.timestamp || 0) > (a.timestamp || 0) ? b : a));
    telemetry = {
      ...telemetry,
      usage_hours: latestSession.usage_hours,
      ahi: latestSession.ahi,
      mask_leak: latestSession.mask_leak,
      pressure_95: latestSession.pressure_95,
      compliance_pct: latestSession.compliance_pct,
      dateLabel: latestSession.date,
      displayDate: latestSession.display_date,
      timestamp: latestSession.timestamp,
    };
  }

  const serial = deviceSummary.serial || telemetry.serial || extractSerial(latestTelemetry) || '';
  const settings = {
    therapy_mode: telemetry.therapy_mode,
    pressure: telemetry.pressure ?? null,
    min_pressure: telemetry.min_pressure ?? null,
    max_pressure: telemetry.max_pressure ?? null,
    aflex: telemetry.aflex ?? null,
    ramp: telemetry.ramp ?? null,
    ...comfortOptionSettings(latestDataPayload),
  };

  return {
    ...deviceSummary,
    serial,
    device_online: extractStatus(deviceSummary.raw || {}, actualSyncState, telemetry.raw) === 'online',
    therapy_running: String(deviceSummary.therapy_status || '').toUpperCase() === 'RUNNING',
    model: deviceSummary.model || null,
    firmware: deviceSummary.firmware || '—',
    patient: {
      id: deviceSummary.raw?.patient_id || deviceSummary.raw?.patientId || null,
      name: deviceSummary.patient_name || null,
    },
    live_data: {
      ahi: telemetry.ahi ?? null,
      mask_leak: telemetry.mask_leak ?? null,
      pressure_95: telemetry.pressure_95 ?? null,
      usage_hours: telemetry.usage_hours ?? null,
      // Share of recorded nights with at least 4 h of use, not a single night's yes/no.
      compliance_pct: sessions.length
        ? Math.round((sessions.filter((x) => x.usage_hours >= 4).length / sessions.length) * 100)
        : null,
    },
    settings,
    sessions,
    settings_history: settingsHistory,
    has_session_data: sessions.length > 0,
    sync_state: actualSyncState,
    reports: storedReports,
    latest_telemetry: latest?.data || latest?.telemetry || latest || {},
    readOnly: false,
  };
}

// ── Request de-duplication + short-lived cache ────────────────────────────────
// TherapyContext and DeviceDashboard both mount at the same time and ask for the
// same device, and StrictMode mounts each of them twice in dev. Without this,
// one page load fired ~9-18 identical requests and the UI sat frozen on the
// slowest of them. Callers asking for the same key share a single round-trip.
const REQUEST_TIMEOUT_MS = 20000;
const inflight = new Map();
const cache = new Map();

function dedupe(key, ttlMs, factory) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value);

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = factory()
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

function invalidate(prefix) {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

async function fetchJson(path, options = {}) {
  const session = getCognitoSession();
  const headers = {
    'Content-Type': 'application/json',
    ...(session.idToken ? { Authorization: `Bearer ${session.idToken}` } : {}),
    ...options.headers,
  };

  // A request that never settles leaves the page stuck on its spinner forever,
  // which is indistinguishable from a hang. Always give it a deadline.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    // Tag the two failures that never reach the server so the UI can tell
    // "the server is slow" apart from "we could not connect at all".
    if (err?.name === 'AbortError') {
      const timeout = new Error(`The server did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds.`);
      timeout.code = 'TIMEOUT';
      timeout.path = path;
      throw timeout;
    }
    err.code = err.code || 'NETWORK';
    err.path = path;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Single-flight session recovery: when several parallel requests get a 401 at
// once we must not fire one token refresh (or silent re-login) per request.
let sessionRecovery = null;

function recoverSession() {
  if (!sessionRecovery) {
    sessionRecovery = (async () => {
      const session = getCognitoSession();
      if (session.refreshToken) {
        try {
          await refreshCognitoSession(session.refreshToken);
          return true;
        } catch (refreshErr) {
          console.warn('[respireeApi] Refresh token failed:', refreshErr);
        }
      }
      // A team browser signs itself back in with its stored key.
      const teamKey = localStorage.getItem(TEAM_KEY_STORAGE);
      if (teamKey) {
        try {
          await loginWithTeamKey(teamKey);
          return true;
        } catch (teamErr) {
          if (teamErr?.status === 401 || teamErr?.status === 404) localStorage.removeItem(TEAM_KEY_STORAGE);
        }
      }
      // The refresh token is gone or rejected: the user must sign in again.
      clearCognitoSession();
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('resprox:session-expired'));
      return false;
    })().finally(() => { sessionRecovery = null; });
  }
  return sessionRecovery;
}

async function request(path, options = {}, { retry = true } = {}) {
  let res;
  try {
    res = await fetchJson(path, options);
  } catch (err) {
    if (retry && err.code !== 'TIMEOUT') {
      await new Promise(r => setTimeout(r, 1000));
      return request(path, options, { retry: false });
    }
    throw err;
  }

  // Handle transient 500 server errors with a 1-time retry
  if (res.status >= 500 && retry) {
    await new Promise(r => setTimeout(r, 1000));
    return request(path, options, { retry: false });
  }

  // Handle 401 Unauthorized by attempting token refresh or background re-authentication
  if (res.status === 401 && retry) {
    if (await recoverSession()) {
      return request(path, options, { retry: false });
    }
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    // The status code is what tells a caller whether this is worth retrying,
    // a permissions problem, or a bad request — keep it on the error rather
    // than flattening everything into a string.
    const err = new Error(
      errorData.error || errorData.message || errorData.detail || `API Error ${res.status}: ${res.statusText}`
    );
    err.status = res.status;
    err.statusText = res.statusText;
    err.body = errorData;
    err.path = path;
    throw err;
  }

  if (res.status === 204) {
    return null;
  }

  return res.json();
}

const DEVICES_TTL_MS = 15000;
const DETAIL_TTL_MS = 5000;

async function getDevices({ force = false } = {}) {
  if (force) invalidate('devices');
  return dedupe('devices', DEVICES_TTL_MS, async () => {
    const json = await request('/devices');
    const rawList = Array.isArray(json) ? json : (json.data || json.devices || json.items || []);
    return rawList.map(normalizeDeviceSummary);
  });
}

async function getDeviceDetail(serial, { force = false } = {}) {
  // Manual refresh must bypass both the detail entry and the device list it
  // is built from, otherwise the button appears to do nothing.
  if (force) {
    invalidate('devices');
    invalidate(`detail:${serial}`);
  }
  return dedupe(`detail:${serial}`, DETAIL_TTL_MS, async () => {
    const [devices, latest, history, syncState, reports] = await Promise.all([
      getDevices().catch(() => []),
      request(`/devices/${encodeURIComponent(serial)}/telemetry/latest`),
      request(`/devices/${encodeURIComponent(serial)}/telemetry/history?page=1&limit=20`),
      request(`/devices/${encodeURIComponent(serial)}/sync-state`),
      // Older deployments may not expose stored reports yet; telemetry history
      // remains a safe fallback until that endpoint is available.
      request(`/devices/${encodeURIComponent(serial)}/reports`).catch(() => []),
    ]);

    const summary = devices.find((device) => device.serial === serial) || { serial, model: null, firmware: '—', patient_name: null, raw: {} };
    return normalizeDeviceDetail(summary, latest, history, syncState, reports);
  });
}

// The documented shape is { syncing, lastSynced }; the live API (Oct 2026) still returns
// { sync_status: "SYNCED", last_device_upload, updated_at, ... }. Read both.
async function getSyncState(serial) {
  const res = await request(`/devices/${encodeURIComponent(serial)}/sync-state`);
  const data = res?.data || res || {};
  return {
    ...data,
    syncing: data.syncing ?? /SYNCING|IN_PROGRESS|PENDING|RUNNING|STARTED/i.test(String(data.sync_status || '')),
    // Anything that moves when new data lands; used only to notice that a sync happened.
    progressMarker: data.lastSynced ?? data.last_synced ?? data.last_device_upload ?? data.updated_at ?? null,
  };
}

async function getTelemetryHistory(serial, page = 1, limit = 20) {
  const json = await request(`/devices/${encodeURIComponent(serial)}/telemetry/history?page=${page}&limit=${limit}`);
  return normalizeSessions(json);
}

async function updateDeviceSettings(serial, settings) {
  // Fetch latest telemetry for baseline settings comparison
  let baseline = {};
  let currentMode = null;
  try {
    const latest = await request(`/devices/${encodeURIComponent(serial)}/telemetry/latest`);
    const latestData = latest?.data || latest?.telemetry || latest || {};
    baseline = latestData.decoded_payload || latestData.modes || {};
    currentMode = latestData.mode || latestData.activeMode || null;
  } catch (err) {
    console.warn("[respireeApi] Failed to fetch latest telemetry for baseline settings comparison:", err);
  }

  const proposedMode = /auto/i.test(String(settings.therapy_mode)) ? 'AUTO'
    : settings.therapy_mode === 'CPAP' ? 'CPAP' : null;
  const fields = proposedMode === 'CPAP'
    ? { pressure: settings.pressure, ramp: settings.ramp }
    : { minPressure: settings.min_pressure, maxPressure: settings.max_pressure, aflex: settings.aflex, ramp: settings.ramp };

  // Never invent a value for a real device: every field must come from the
  // device or the user. Refuse rather than fill a gap with a guess.
  const missing = proposedMode
    ? Object.entries(fields).filter(([, v]) => v == null || !Number.isFinite(Number(v))).map(([k]) => k)
    : ['therapy mode'];
  if (missing.length) {
    const err = new Error(`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set, so nothing was sent to the device.`);
    err.code = 'INCOMPLETE_SETTINGS';
    throw err;
  }
  const values = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, Number(v)]));

  // The API takes exactly one mode per request: { "CPAP": {...} } or { "AUTO": {...} }.
  // A mode switch sends the whole mode; otherwise only the fields that changed.
  const base = baseline[proposedMode] || {};
  const patch = proposedMode !== currentMode
    ? values
    : Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== base[k]));
  const payload = Object.keys(patch).length ? { [proposedMode]: patch } : {};

  if (!Object.keys(payload).length) {
    return { success: true, commandId: null, status: 'NO_CHANGE' };
  }

  // Cached reads are stale the moment we write, so drop them.
  invalidate('devices');
  invalidate(`detail:${serial}`);

  return request(`/devices/${encodeURIComponent(serial)}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * PATCH one mode group for one device.
 *
 * `updateDeviceSettings` above owns the CPAP/AUTO therapy pressures and diffs
 * them against telemetry. This one is for screens that already know exactly
 * which group changed — the settings screen tracks its own draft, so
 * re-deriving the diff here would only risk disagreeing with what the user was
 * shown in the confirm dialog.
 *
 * `groups` holds exactly one wire group, e.g.
 *   { COMFORT: { rampTime, humidifierLevel, tubeType, maskType } } or
 *   { OPTIONS: { iModeEnabled, leakAlertEnabled, sleepModeEnabled } }  // 0/1
 */
async function updateDeviceGroups(serial, groups = {}) {
  const entries = Object.entries(groups).filter(([, values]) => values != null);
  // One mode per request is the API contract; callers send groups one at a time.
  if (entries.length !== 1) throw new Error(`updateDeviceGroups expects exactly one group, got ${entries.length}`);

  // Cached reads are stale the moment we write, so drop them.
  invalidate('devices');
  invalidate(`detail:${serial}`);

  return request(`/devices/${encodeURIComponent(serial)}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(Object.fromEntries(entries)),
  });
}

// The API reports ACKNOWLEDGED / FAILED; older servers said ACKED / NACKED.
// Everything downstream speaks ACKED / NACKED / TIMEOUT, so translate once here.
const COMMAND_STATUS = {
  ACKED: 'ACKED', ACKNOWLEDGED: 'ACKED',
  NACKED: 'NACKED', FAILED: 'NACKED',
  TIMEOUT: 'TIMEOUT',
};

async function pollCommandStatus(deviceId, commandId, { intervalMs = 2000, timeoutMs = 40000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request(`/devices/${encodeURIComponent(deviceId)}/commands/${encodeURIComponent(commandId)}/status`);
    const status = COMMAND_STATUS[String(res?.status ?? res?.data?.status ?? '').toUpperCase()];
    if (status) {
      return { ...res, status };
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error("Polling timed out client-side");
}

/** POST /devices/{id}/therapy/start|stop. The device confirms asynchronously. */
async function setTherapy(serial, action) {
  if (action !== 'start' && action !== 'stop') throw new Error(`Invalid therapy action: ${action}`);
  invalidate('devices');
  invalidate(`detail:${serial}`);
  return request(`/devices/${encodeURIComponent(serial)}/therapy/${action}`, { method: 'POST', body: '{}' });
}

/**
 * Start a report sync and wait until the backend says it is finished.
 * The POST only means "started", and `syncing` can still read false for a
 * moment afterwards, so a quiet false only counts as done once the sync was
 * seen running, the sync marker moved, or the device had 15 s to start (an
 * up-to-date device sends nothing). A 409 means a sync is already running:
 * follow that one instead of failing.
 */
async function syncReports(serial, { timeoutMs = 180_000 } = {}) {
  const before = await getSyncState(serial).catch(() => ({}));
  try {
    await triggerReportSync(serial);
  } catch (err) {
    if (err?.status !== 409) throw err;
  }
  const started = Date.now();
  let seenSyncing = false;
  let state = {};
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 3000));
    state = await getSyncState(serial);
    if (state.syncing) { seenSyncing = true; continue; }
    if (seenSyncing || state.progressMarker !== before.progressMarker || Date.now() - started > 15_000) break;
  }
  invalidate('devices');
  invalidate(`detail:${serial}`);
  return { stillRunning: Boolean(state.syncing) };
}

/** POST /devices/{id}/reports/sync. Progress is read from getSyncState(). */
async function triggerReportSync(serial) {
  invalidate(`detail:${serial}`);
  return request(`/devices/${encodeURIComponent(serial)}/reports/sync`, { method: 'POST', body: '{}' });
}

async function getReports(serial) {
  return normalizeReportList(await request(`/devices/${encodeURIComponent(serial)}/reports`));
}

async function pollTherapyStatus(serial, expected, { intervalMs = 2000, timeoutMs = 60000 } = {}) {
  const target = String(expected).toUpperCase();
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const [devices, syncState] = await Promise.all([
      getDevices({ force: true }),
      getSyncState(serial).catch(() => ({})),
    ]);
    const device = devices.find((item) => item.serial === serial);
    const status = extractTherapyStatus(device)
      || extractTherapyStatus(device?.raw)
      || extractTherapyStatus(syncState);
    if (status === target) return device;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const error = new Error(`Therapy did not reach ${target} within ${timeoutMs / 1000} seconds.`);
  error.code = 'THERAPY_STATUS_TIMEOUT';
  throw error;
}

export const devicesAPI = {
  getDevices,
  getDeviceDetail,
  getSyncState,
  getTelemetryHistory,
  updateDeviceSettings,
  updateDeviceGroups,
  pollCommandStatus,
  setTherapy,
  triggerReportSync,
  syncReports,
  getReports,
  pollTherapyStatus,
};

export {
  normalizeDeviceSummary,
  normalizeDeviceDetail,
  normalizeTelemetry,
  request,
  BASE_URL,
};
