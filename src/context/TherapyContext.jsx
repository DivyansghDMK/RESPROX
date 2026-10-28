import React, { createContext, useContext, useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNotify } from './NotifyContext';
import { describeCommandStatus, describeError } from '../services/apiError';
import { useAuth } from './AuthContext';
import { devicesAPI } from '../services/respireeApi';
import { diffDeviceEvents } from '../services/deviceEvents';

const TherapyContext = createContext(null);

// An open page checks its device's row in the device list this often (one small
// request) and downloads the full device data only when that row changed:
// therapy status, reported online status, or last_seen (moved by every data
// packet, e.g. after a settings change on the device). A full read also runs
// every FULL_REFRESH_MS as a safety net.
const LIVE_CHECK_MS = 3_000;
const FULL_REFRESH_MS = 60_000;
const MAX_DEVICE_EVENTS = 20;

export function TherapyProvider({ children }) {
  const notify = useNotify();
  const { isAuthenticated } = useAuth();
  // No invented starting values: these hold what the device reported, or null.
  const [mode, setMode] = useState(null);
  const [pressure, setPressure] = useState(null);
  const [minPressure, setMinPressure] = useState(null);
  const [maxPressure, setMaxPressure] = useState(null);
  const [aflex, setAflex] = useState(null);
  const [ramp, setRamp] = useState(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // 'idle' | 'saving' | 'success' | 'error'
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Admin selected device states
  const [adminActiveSerial, setAdminActiveSerial] = useState(localStorage.getItem('adminActiveSerial') || null);
  const [deviceData, setDeviceData] = useState(null);
  // Why the last device load failed, so pages can show it instead of loading forever.
  const [deviceLoadError, setDeviceLoadError] = useState(null);

  // Track last time data was fetched from server
  const [lastServerPull, setLastServerPull] = useState(null);

  // Reference for checking unsaved changes
  const initialSettings = useRef({
    pressure: null,
    minPressure: null,
    maxPressure: null,
    aflex: null,
    ramp: null
  });

  // The serial whose data the screens should show. A response for any other
  // serial was superseded by a device switch and must not overwrite it.
  const latestSerial = useRef(null);
  // Read at call time, so a background refresh never overwrites an edit in progress.
  const unsavedRef = useRef(false);
  const deviceDataRef = useRef(null);
  deviceDataRef.current = deviceData;
  // What the device did on its own (button start/stop, settings, connection),
  // newest first, for the notifications panel.
  const [deviceEvents, setDeviceEvents] = useState([]);

  const announceDeviceEvents = useCallback((prev, next) => {
    // Therapy and settings changes right after the website's own command are
    // that command landing; it already reports its own result.
    const ownCommand = devicesAPI.commandedRecently(next.serial);
    const events = diffDeviceEvents(prev, next)
      .filter((e) => e.kind === 'connection' || !ownCommand);
    if (!events.length) return;
    const at = Date.now();
    const severity = (e) => (e.kind === 'connection' && !next.device_online && !next.phone_connected ? 'warning' : 'info');
    events.forEach((e) => notify[severity(e)](e.title, { message: e.detail }));
    setDeviceEvents((list) => [
      ...events.map((e, i) => ({
        ...e, severity: severity(e), id: `${next.serial}:${e.kind}:${at}:${i}`, serial: next.serial, at,
      })),
      ...list,
    ].slice(0, MAX_DEVICE_EVENTS));
  }, [notify]);

  // `quiet` is the background live refresh: it keeps the data on screen if the
  // request fails and leaves the user's unsaved edits alone.
  const fetchDeviceData = useCallback(async (serial, { force = false, quiet = false } = {}) => {
    if (!serial) return;
    latestSerial.current = serial;
    try {
      if (!quiet) setDeviceLoadError(null);
      const data = await devicesAPI.getDeviceDetail(serial, { force });
      if (latestSerial.current !== serial) return;
      announceDeviceEvents(deviceDataRef.current, data);
      setDeviceData(data);
      setDeviceLoadError(null);
      setLastServerPull(new Date());
      if (quiet && unsavedRef.current) return;

      const settings = data.settings || {};
      setMode(settings.therapy_mode === 'AUTO CPAP' ? 'auto' : settings.therapy_mode === 'CPAP' ? 'cpap' : null);
      setPressure(settings.pressure ?? null);
      setMinPressure(settings.min_pressure ?? null);
      setMaxPressure(settings.max_pressure ?? null);
      setAflex(settings.aflex ?? null);
      setRamp(settings.ramp ?? null);

      initialSettings.current = {
        pressure: settings.pressure ?? null,
        minPressure: settings.min_pressure ?? null,
        maxPressure: settings.max_pressure ?? null,
        aflex: settings.aflex ?? null,
        ramp: settings.ramp ?? null
      };
    } catch (e) {
      if (latestSerial.current !== serial || quiet) return;
      setDeviceLoadError(e);
      // Every screen renders off deviceData, so a silent failure here left the
      // whole app sitting on a loading state with the reason only in the
      // console. Say what happened and offer the retry.
      notify.fromError(e, {
        action: 'load this device',
        subject: serial,
        onRetry: () => fetchDeviceData(serial),
      });
    }
  }, [notify, announceDeviceEvents]);

  // On a device switch, drop the previous device's data so screens show a
  // loading shimmer — never the old device's readings under the new serial.
  const shownSerial = useRef(adminActiveSerial);
  useEffect(() => {
    if (shownSerial.current === adminActiveSerial) return;
    shownSerial.current = adminActiveSerial;
    setDeviceData(null);
    setDeviceLoadError(null);
  }, [adminActiveSerial]);

  useEffect(() => {
    if (!adminActiveSerial) {
      localStorage.removeItem('adminActiveSerial');
      latestSerial.current = null;
      return;
    }

    // The serial survives in localStorage between sessions, and this provider
    // is mounted above the router — so without this guard a signed-out visitor
    // on /login pulled the previous session's device, and any failure surfaced
    // as an error card on the login screen.
    localStorage.setItem('adminActiveSerial', adminActiveSerial);
    if (!isAuthenticated) return;
    fetchDeviceData(adminActiveSerial);
  }, [adminActiveSerial, fetchDeviceData, isAuthenticated]);

  const stateRef = useRef({ deviceData, pressure, minPressure, maxPressure, aflex, ramp });
  useEffect(() => {
    stateRef.current = { deviceData, pressure, minPressure, maxPressure, aflex, ramp };
  }, [deviceData, pressure, minPressure, maxPressure, aflex, ramp]);



  const hasUnsavedChanges = useMemo(() => {
    return (
      pressure !== initialSettings.current.pressure ||
      minPressure !== initialSettings.current.minPressure ||
      maxPressure !== initialSettings.current.maxPressure ||
      aflex !== initialSettings.current.aflex ||
      ramp !== initialSettings.current.ramp
    );
  }, [pressure, minPressure, maxPressure, aflex, ramp]);

  unsavedRef.current = hasUnsavedChanges;

  // Live view: follow the active device while the tab is visible, so changes
  // made on the device itself (start/stop, settings) appear without a manual
  // refresh. Paused in a hidden tab, which also keeps the database idle.
  useEffect(() => {
    if (!adminActiveSerial || !isAuthenticated) return undefined;
    let inFlight = false;
    let lastSignature = null;
    let lastFullRead = Date.now();
    const tick = async () => {
      if (inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const row = (await devicesAPI.getDevices({ force: true })).find((d) => d.serial === adminActiveSerial);
        const signature = row ? [row.therapy_status, row.raw?.status, row.raw?.last_seen].join('|') : null;
        const changed = lastSignature !== null && signature !== lastSignature;
        lastSignature = signature;
        if (changed || Date.now() - lastFullRead > FULL_REFRESH_MS) {
          lastFullRead = Date.now();
          await fetchDeviceData(adminActiveSerial, { force: true, quiet: true });
        }
      } catch {
        // A missed check is retried on the next tick; nothing to show.
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(tick, LIVE_CHECK_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [adminActiveSerial, isAuthenticated, fetchDeviceData]);

  // Monitor beforeunload browser events
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved CPAP therapy settings. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleSave = useCallback(async () => {
    if (!adminActiveSerial) return;
    if (stateRef.current.deviceData?.therapy_running) {
      setShowToast(true);
      setToastMessage('Therapy is running. Stop therapy before changing settings.');
      return;
    }
    setSaveState('saving');
    setShowToast(true);
    setToastMessage('Pushing settings to device...');
    
    try {
      const payload = {
        therapy_mode: mode === 'auto' ? 'AUTO CPAP' : mode === 'cpap' ? 'CPAP' : null,
        // Missing values stay missing; the API layer refuses to send them.
        pressure,
        min_pressure: minPressure,
        max_pressure: maxPressure,
        aflex,
        ramp,
      };
      
      const res = await devicesAPI.updateDeviceSettings(adminActiveSerial, payload);
      const confirmed = () => {
        // Only once the device has the values do they become the new baseline.
        initialSettings.current = { pressure, minPressure, maxPressure, aflex, ramp };
      };

      if (res && res.status === 'NO_CHANGE') {
        confirmed();
        setSaveState('success');
        setToastMessage('Nothing to send: the device already has these values.');
      } else if (res && res.commandId) {
        setToastMessage('Sent. Waiting for the device to confirm…');
        const pollRes = await devicesAPI.pollCommandStatus(adminActiveSerial, res.commandId);
        const bad = describeCommandStatus(pollRes.status, { subject: adminActiveSerial });
        if (bad) {
          notify.fromDescription(bad);
          setSaveState('error');
          setToastMessage(bad.title);
        } else {
          confirmed();
          setSaveState('success');
          setToastMessage('Settings applied — the device confirmed them ✓');
        }
      } else {
        // Accepted, but with no command id there is no device confirmation to wait for.
        setSaveState('idle');
        setToastMessage('Sent to the server. The device has not confirmed it yet.');
      }
      setTimeout(() => setShowToast(false), 4000);
    } catch (e) {
      notify.fromError(e, { action: 'save these settings', subject: adminActiveSerial });
      setSaveState('error');
      setToastMessage(describeError(e, { action: 'save these settings' }).title);
      setTimeout(() => setShowToast(false), 4000);
    }
  }, [adminActiveSerial, mode, pressure, minPressure, maxPressure, aflex, ramp]);

  // Every page and the sidebar/header consume this context. A fresh object on
  // each render re-rendered the whole tree on any state change (toast, sidebar,
  // last-pull clock), which is what made the app stutter while data loaded.
  const value = useMemo(() => ({
    mode,
    setMode,
    pressure,
    setPressure,
    minPressure,
    setMinPressure,
    maxPressure,
    setMaxPressure,
    aflex,
    setAflex,
    ramp,
    setRamp,
    sidebarOpen,
    setSidebarOpen,
    saveState,
    setSaveState,
    showToast,
    setShowToast,
    toastMessage,
    setToastMessage,
    hasUnsavedChanges,
    handleSave,
    adminActiveSerial,
    setAdminActiveSerial,
    deviceData,
    setDeviceData,
    deviceLoadError,
    deviceEvents,
    fetchDeviceData,
    lastServerPull,
    setLastServerPull
  }), [
    mode, pressure, minPressure, maxPressure, aflex, ramp,
    sidebarOpen, saveState, showToast, toastMessage,
    hasUnsavedChanges, handleSave,
    adminActiveSerial, deviceData, deviceLoadError, deviceEvents, fetchDeviceData, lastServerPull,
  ]);

  return (
    <TherapyContext.Provider value={value}>
      {children}
    </TherapyContext.Provider>
  );
}

export function useTherapy() {
  const context = useContext(TherapyContext);
  if (!context) {
    throw new Error('useTherapy must be used within a TherapyProvider');
  }
  return context;
}
