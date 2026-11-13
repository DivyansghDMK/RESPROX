// src/services/deviceStatus.js
//
// A device's connection as the screens show it: 'online', 'offline' or
// 'phone' (connected to the phone app).

// GET /devices returns status ONLINE or OFFLINE plus status_reason.
// OFFLINE with APP_CONNECTED means the phone app holds the device over
// Bluetooth, so it left Wi-Fi on purpose; CONNECTION_LOST or null is a real
// offline.
export function extractStatus(item, syncState, latestTelemetry) {
  const reason = String(item?.status_reason ?? item?.statusReason ?? '').toUpperCase();
  if (reason === 'APP_CONNECTED') return 'phone';
  const explicit = [item?.status, syncState?.status, syncState?.direction, latestTelemetry?.status]
    .find((v) => v !== undefined && v !== null && v !== '');
  if (!explicit) return 'unknown';
  const normalized = String(explicit).toLowerCase();
  // Older responses put the app state in status itself.
  if (/app[\s_]*connected/.test(normalized)) return 'phone';
  if (normalized.includes('online') || normalized.includes('synced') || normalized.includes('success')) return 'online';
  if (normalized.includes('offline') || normalized.includes('stale') || normalized.includes('error')) return 'offline';
  return normalized;
}

// GET /devices also returns therapy_status. Words for it, or null when the
// device has not reported one.
const THERAPY_LABEL = { RUNNING: 'Therapy running', STOPPED: 'Therapy stopped' };
export function therapyLabel(status) {
  return THERAPY_LABEL[String(status || '').toUpperCase()] || null;
}
