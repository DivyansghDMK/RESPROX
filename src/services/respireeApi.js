import { clearCognitoSession, getCognitoSession, refreshCognitoSession, loginWithCognito } from './respireeAuth';

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
    const therapy_mode = bytes[8] === 3 ? 'CPAP' : 'AUTO CPAP';

    parsed = {
      serial: raw.device_id || '',
      usage_hours,
      ahi,
      mask_leak,
      pressure_95,
      compliance_pct: usage_hours >= 4.0 ? 100 : 0,
      therapy_mode,
      pressure: pressure_95,
      min_pressure: bytes[10] || 4,
      max_pressure: bytes[9] || 20,
      aflex: bytes[11] || 2,
      ramp: bytes[12] || 0,
      timestamp: ts,
    };
  }

  const autoObj = raw.AUTO || raw.settings?.AUTO || raw.device_settings?.AUTO || raw.decoded_payload?.AUTO;
  const cpapObj = raw.CPAP || raw.settings?.CPAP || raw.device_settings?.CPAP || raw.decoded_payload?.CPAP;

  const therapyModeRaw = firstDefined(parsed.therapy_mode, raw.therapy_mode, raw.therapyMode, raw.mode);
  const therapyMode = typeof therapyModeRaw === 'string' && therapyModeRaw.toLowerCase().includes('auto')
    ? 'AUTO CPAP'
    : (therapyModeRaw || 'CPAP');

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
    timestamp: parsed.timestamp || firstDefined(raw.timestamp, raw.time, raw.created_at, raw.recorded_at, raw.synced_at, raw.updated_at),
    dateLabel: formatSessionLabel(parsed.timestamp || firstDefined(raw.timestamp, raw.time, raw.created_at, raw.recorded_at, raw.synced_at, raw.updated_at)),
    displayDate: formatSessionDate(parsed.timestamp || firstDefined(raw.timestamp, raw.time, raw.created_at, raw.recorded_at, raw.synced_at, raw.updated_at)),
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
    model: firstDefined(raw.model, raw.device_model, raw.deviceModel, raw.product_line, raw.name) || serial || 'Device',
    firmware: firstDefined(raw.firmware, raw.firmwareVersion, raw.software_version, raw.softwareVersion) || '—',
    patient_name: firstDefined(raw.patient_name, raw.patientName, raw.owner_name, raw.user_name, raw.name, serial) || serial || 'Device',
    status,
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

    const serverTs = entry?.server_timestamp || entry?.serverTimestamp || entry?.device_timestamp || entry?.timestamp;
    const tsMs = serverTs ? new Date(serverTs).getTime() : 0;

    if (isSettingsFrame) {
      const mode = entry.mode || entryPayload.mode || (cpapObj ? 'CPAP' : 'AUTO CPAP');
      return {
        type: 'SETTINGS_UPDATE',
        date: formatSessionLabel(serverTs),
        display_date: formatSessionDate(serverTs),
        timestamp: tsMs,
        mode,
        pressure: cpapObj?.pressure ?? 10,
        min_pressure: autoObj?.minPressure ?? 4,
        max_pressure: autoObj?.maxPressure ?? 20,
        aflex: autoObj?.aflex ?? 2,
        ramp: cpapObj?.ramp ?? autoObj?.ramp ?? 20,
        usage_hours: 0,
        ahi: 0,
        mask_leak: 0,
        pressure_95: 0,
        compliance_pct: 100,
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
      ahi: telemetry.ahi ?? 0,
      usage_hours: telemetry.usage_hours ?? 0,
      mask_leak: telemetry.mask_leak ?? 0,
      pressure_95: telemetry.pressure_95 ?? 0,
      compliance_pct: telemetry.compliance_pct ?? 0,
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

function normalizeDeviceDetail(summary, latest, history, syncState) {
  const deviceSummary = summary || {};
  const sessions = normalizeSessions(history);
  const actualSyncState = syncState?.data || syncState || {};

  const latestDataWrapper = latest?.data || latest || {};
  const latestDataPayload = latestDataWrapper.decoded_payload || {};
  const latestTelemetry = {
    ...latestDataWrapper,
    ...latestDataPayload,
    server_timestamp: latestDataWrapper.server_timestamp || latest?.server_timestamp,
  };
  let telemetry = normalizeTelemetry(latestTelemetry);

  // If latest telemetry is a settings configuration frame without clinical session bytes,
  // fallback to the most recent clinical session for top metric cards
  if ((!telemetry.usage_hours && !telemetry.ahi && !telemetry.mask_leak) && sessions.length > 0) {
    const latestSession = sessions[0];
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
    pressure: telemetry.pressure ?? 0,
    min_pressure: telemetry.min_pressure ?? 4,
    max_pressure: telemetry.max_pressure ?? 30,
    aflex: telemetry.aflex ?? 0,
    ramp: telemetry.ramp ?? 0,
  };

  return {
    ...deviceSummary,
    serial,
    device_online: extractStatus(deviceSummary.raw || {}, actualSyncState, telemetry.raw) === 'online',
    model: deviceSummary.model || 'Device',
    firmware: deviceSummary.firmware || '—',
    patient: {
      id: deviceSummary.raw?.patient_id || deviceSummary.raw?.patientId || serial,
      name: deviceSummary.patient_name || serial,
    },
    live_data: {
      ahi: telemetry.ahi ?? 0,
      mask_leak: telemetry.mask_leak ?? 0,
      pressure_95: telemetry.pressure_95 ?? 0,
      usage_hours: telemetry.usage_hours ?? 0,
      compliance_pct: telemetry.compliance_pct ?? 0,
    },
    settings,
    sessions: sessions.length ? sessions : [{
      date: telemetry.dateLabel,
      display_date: telemetry.displayDate,
      timestamp: telemetry.timestamp,
      ahi: telemetry.ahi ?? 0,
      usage_hours: telemetry.usage_hours ?? 0,
      mask_leak: telemetry.mask_leak ?? 0,
      pressure_95: telemetry.pressure_95 ?? 0,
      compliance_pct: telemetry.compliance_pct ?? 0,
      raw: latestTelemetry,
    }],
    sync_state: actualSyncState,
    latest_telemetry: latest?.data || latest || {},
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
      try {
        console.log('[respireeApi] Performing silent re-authentication with Cognito...');
        await loginWithCognito('kanishka.sharma@deckmount.in', 'KanishkaDeck@20');
        return true;
      } catch (loginErr) {
        console.error('[respireeApi] Auto re-login failed:', loginErr);
        clearCognitoSession();
        return false;
      }
    })().finally(() => { sessionRecovery = null; });
  }
  return sessionRecovery;
}

async function request(path, options = {}, { retry = true } = {}) {
  let res;
  try {
    res = await fetchJson(path, options);
  } catch (err) {
    if (retry) {
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
    const [devices, latest, history, syncState] = await Promise.all([
      getDevices().catch(() => []),
      request(`/devices/${encodeURIComponent(serial)}/telemetry/latest`),
      request(`/devices/${encodeURIComponent(serial)}/telemetry/history?page=1&limit=20`),
      request(`/devices/${encodeURIComponent(serial)}/sync-state`),
    ]);

    const summary = devices.find((device) => device.serial === serial) || { serial, model: 'Device', firmware: '—', patient_name: serial, raw: {} };
    return normalizeDeviceDetail(summary, latest, history, syncState);
  });
}

async function getSyncState(serial) {
  const res = await request(`/devices/${encodeURIComponent(serial)}/sync-state`);
  return res?.data || res || {};
}

async function getTelemetryHistory(serial, page = 1, limit = 20) {
  const json = await request(`/devices/${encodeURIComponent(serial)}/telemetry/history?page=${page}&limit=${limit}`);
  return normalizeSessions(json);
}

async function updateDeviceSettings(serial, settings) {
  // Fetch latest telemetry for baseline settings comparison
  let baseline = {};
  let currentMode = 'CPAP';
  try {
    const latest = await request(`/devices/${encodeURIComponent(serial)}/telemetry/latest`);
    const latestData = latest?.data || latest || {};
    baseline = latestData.decoded_payload || {};
    currentMode = latestData.mode || 'CPAP';
  } catch (err) {
    console.warn("[respireeApi] Failed to fetch latest telemetry for baseline settings comparison:", err);
  }

  const proposedMode = (settings.therapy_mode === 'AUTO CPAP' || settings.therapy_mode === 'AUTO') ? 'AUTO' : 'CPAP';

  const payload = {
    CPAP: null,
    AUTO: null,
    S: null,
    ST: null,
    T: null,
    VAPS: null,
    CONFIG: null,
    COMFORT: null,
    OPTIONS: null
  };

  if (proposedMode !== currentMode) {
    // Mode changed, send the entire proposed mode settings
    if (proposedMode === 'CPAP') {
      payload.CPAP = {
        pressure: Number(settings.pressure ?? 10),
        ramp: Number(settings.ramp ?? 20)
      };
    } else if (proposedMode === 'AUTO') {
      payload.AUTO = {
        minPressure: Number(settings.min_pressure ?? 4),
        maxPressure: Number(settings.max_pressure ?? 20),
        aflex: Number(settings.aflex ?? 2),
        ramp: Number(settings.ramp ?? 20)
      };
    }
  } else {
    // Mode is the same, only send changed fields
    if (proposedMode === 'CPAP') {
      const baselineCPAP = baseline.CPAP || {};
      const cpapPatch = {};
      const proposedPressure = Number(settings.pressure ?? 10);
      const proposedRamp = Number(settings.ramp ?? 20);

      if (proposedPressure !== baselineCPAP.pressure) {
        cpapPatch.pressure = proposedPressure;
      }
      if (proposedRamp !== baselineCPAP.ramp) {
        cpapPatch.ramp = proposedRamp;
      }

      if (Object.keys(cpapPatch).length > 0) {
        payload.CPAP = cpapPatch;
      }
    } else if (proposedMode === 'AUTO') {
      const baselineAUTO = baseline.AUTO || {};
      const autoPatch = {};
      const proposedMin = Number(settings.min_pressure ?? 4);
      const proposedMax = Number(settings.max_pressure ?? 20);
      const proposedAflex = Number(settings.aflex ?? 2);
      const proposedRamp = Number(settings.ramp ?? 20);

      if (proposedMin !== baselineAUTO.minPressure) {
        autoPatch.minPressure = proposedMin;
      }
      if (proposedMax !== baselineAUTO.maxPressure) {
        autoPatch.maxPressure = proposedMax;
      }
      if (proposedAflex !== baselineAUTO.aflex) {
        autoPatch.aflex = proposedAflex;
      }
      if (proposedRamp !== baselineAUTO.ramp) {
        autoPatch.ramp = proposedRamp;
      }

      if (Object.keys(autoPatch).length > 0) {
        payload.AUTO = autoPatch;
      }
    }
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
 * PATCH an explicit set of mode groups for one device.
 *
 * `updateDeviceSettings` above owns the CPAP/AUTO therapy pressures and diffs
 * them against telemetry. This one is for screens that already know exactly
 * which groups changed — the settings screen tracks its own draft, so
 * re-deriving the diff here would only risk disagreeing with what the user was
 * shown in the confirm dialog.
 *
 * `groups` is keyed by wire group name, e.g.
 *   { COMFORT: { rampTime, humidifier, tubeType, maskType },
 *     OPTIONS: { iMode, leakAlert, sleepMode } }
 * Anything absent is sent as null, which the server reads as "unchanged".
 */
async function updateDeviceGroups(serial, groups = {}) {
  const payload = {
    CPAP: null, AUTO: null, S: null, ST: null, T: null,
    VAPS: null, CONFIG: null, COMFORT: null, OPTIONS: null,
    ...groups,
  };

  // Cached reads are stale the moment we write, so drop them.
  invalidate('devices');
  invalidate(`detail:${serial}`);

  return request(`/devices/${encodeURIComponent(serial)}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

async function pollCommandStatus(deviceId, commandId, { intervalMs = 2000, timeoutMs = 40000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request(`/devices/${encodeURIComponent(deviceId)}/commands/${encodeURIComponent(commandId)}/status`);
    if (res && ["ACKED", "NACKED", "TIMEOUT"].includes(res.status)) {
      return res;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error("Polling timed out client-side");
}

export const devicesAPI = {
  getDevices,
  getDeviceDetail,
  getSyncState,
  getTelemetryHistory,
  updateDeviceSettings,
  updateDeviceGroups,
  pollCommandStatus,
};

export {
  normalizeDeviceSummary,
  normalizeDeviceDetail,
  normalizeTelemetry,
  request,
  BASE_URL,
};
