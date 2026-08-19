// src/hooks/useNotifications.js
//
// Derives the notification list from live device data rather than keeping a
// separate store: there is no notifications endpoint, and anything the user
// needs to be told is already implied by the telemetry we hold.
//
// Read/dismissed state is persisted by notification id. Ids embed the value's
// reporting date, so a fresh night of bad numbers raises a new alert instead of
// being silently swallowed by a dismissal from last week.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTherapy } from '../context/TherapyContext';

const STORAGE_KEY = 'resprox.notifications.v1';
const MAX_REMEMBERED = 200;
const STALE_AFTER_MS = 10 * 60 * 1000;

// Thresholds match the ones the dashboard already renders against.
const AHI_LIMIT = 5;
const LEAK_LIMIT = 24;
const COMPLIANCE_HOURS = 4;
const COMPLIANCE_RATE_LIMIT = 70;

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      read: Array.isArray(parsed.read) ? parsed.read : [],
      dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed : [],
    };
  } catch {
    return { read: [], dismissed: [] };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      read: state.read.slice(-MAX_REMEMBERED),
      dismissed: state.dismissed.slice(-MAX_REMEMBERED),
    }));
  } catch {
    // Private-mode / quota failures must not take the header down.
  }
}

function buildNotifications(deviceData, lastServerPull) {
  const list = [];

  if (!deviceData) {
    list.push({
      id: 'no-device',
      severity: 'info',
      title: 'No device selected',
      detail: 'Choose a device from the Devices registry to see its therapy alerts.',
      to: '/devices',
    });
    return list;
  }

  const serial = deviceData.serial || 'device';
  const ld = deviceData.live_data || {};
  const sessions = (deviceData.sessions || []).filter((s) => s.type !== 'SETTINGS_UPDATE');
  const latest = sessions[0];
  // Scope ids to the night being reported so each new session can alert again.
  const stamp = latest?.display_date || latest?.date || 'latest';

  if (deviceData.device_online === false) {
    list.push({
      id: `offline:${serial}`,
      severity: 'critical',
      title: 'Device offline',
      detail: `${serial} is not reporting to the server. Queued settings will apply on reconnect.`,
      to: `/device/${serial}`,
    });
  }

  if (Number.isFinite(ld.ahi) && ld.ahi > AHI_LIMIT) {
    list.push({
      id: `ahi:${serial}:${stamp}`,
      severity: 'warning',
      title: `Elevated AHI — ${ld.ahi} events/hr`,
      detail: `Above the target of ${AHI_LIMIT.toFixed(1)}. Review pressure settings for ${serial}.`,
      to: '/trends',
    });
  }

  if (Number.isFinite(ld.mask_leak) && ld.mask_leak > LEAK_LIMIT) {
    list.push({
      id: `leak:${serial}:${stamp}`,
      severity: 'warning',
      title: `High mask leak — ${ld.mask_leak} L/min`,
      detail: `Above the ${LEAK_LIMIT} L/min threshold. Check mask fit and cushion wear.`,
      to: '/mask-fit',
    });
  }

  if (Number.isFinite(ld.usage_hours) && ld.usage_hours < COMPLIANCE_HOURS) {
    list.push({
      id: `usage:${serial}:${stamp}`,
      severity: 'warning',
      title: `Usage below target — ${ld.usage_hours.toFixed(1)} h`,
      detail: `Last session fell short of the ${COMPLIANCE_HOURS}-hour compliance threshold.`,
      to: '/trends',
    });
  }

  const recent = sessions.slice(0, 7);
  if (recent.length >= 3) {
    const rate = Math.round(
      (recent.filter((s) => s.usage_hours >= COMPLIANCE_HOURS).length / recent.length) * 100
    );
    if (rate < COMPLIANCE_RATE_LIMIT) {
      list.push({
        id: `compliance:${serial}:${stamp}:${rate}`,
        severity: 'warning',
        title: `Compliance at ${rate}% over ${recent.length} nights`,
        detail: `Below the ${COMPLIANCE_RATE_LIMIT}% adherence target. Consider a therapy review.`,
        to: '/reports',
      });
    }
  }

  if (!sessions.length) {
    list.push({
      id: `no-sessions:${serial}`,
      severity: 'info',
      title: 'No therapy sessions recorded',
      detail: `${serial} has not uploaded any session data yet.`,
      to: `/device/${serial}`,
    });
  }

  if (lastServerPull && Date.now() - new Date(lastServerPull).getTime() > STALE_AFTER_MS) {
    list.push({
      id: `stale:${serial}`,
      severity: 'info',
      title: 'Data may be out of date',
      detail: 'The dashboard has not pulled from the server in over 10 minutes. Use Refresh for current values.',
      to: `/device/${serial}`,
    });
  }

  // Nothing wrong is itself worth confirming, so the panel is never empty
  // in a way that reads as "notifications are broken".
  if (!list.length) {
    list.push({
      id: `all-clear:${serial}:${stamp}`,
      severity: 'success',
      title: 'All readings within target',
      detail: `${serial} reported no AHI, leak or compliance issues in the latest session.`,
      to: `/device/${serial}`,
    });
  }

  return list;
}

export function useNotifications() {
  const { deviceData, lastServerPull } = useTherapy();
  const [state, setState] = useState(loadState);

  useEffect(() => { saveState(state); }, [state]);

  const derived = useMemo(
    () => buildNotifications(deviceData, lastServerPull),
    [deviceData, lastServerPull]
  );

  const notifications = useMemo(() => (
    derived
      .filter((n) => !state.dismissed.includes(n.id))
      .map((n) => ({ ...n, read: state.read.includes(n.id) }))
  ), [derived, state]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = useCallback(() => {
    setState((prev) => {
      const ids = derived.map((n) => n.id).filter((id) => !prev.read.includes(id));
      return ids.length ? { ...prev, read: [...prev.read, ...ids] } : prev;
    });
  }, [derived]);

  const dismiss = useCallback((id) => {
    setState((prev) => (
      prev.dismissed.includes(id) ? prev : { ...prev, dismissed: [...prev.dismissed, id] }
    ));
  }, []);

  const clearAll = useCallback(() => {
    setState((prev) => {
      const ids = notifications.map((n) => n.id).filter((id) => !prev.dismissed.includes(id));
      return ids.length ? { ...prev, dismissed: [...prev.dismissed, ...ids] } : prev;
    });
  }, [notifications]);

  return { notifications, unreadCount, markAllRead, dismiss, clearAll };
}
