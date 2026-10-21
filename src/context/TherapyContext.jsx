import React, { createContext, useContext, useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNotify } from './NotifyContext';
import { describeCommandStatus, describeError } from '../services/apiError';
import { useAuth } from './AuthContext';
import { devicesAPI } from '../services/respireeApi';

const TherapyContext = createContext(null);

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

  const fetchDeviceData = useCallback(async (serial) => {
    if (!serial) return;
    console.log("[TherapyContext] fetchDeviceData called for serial:", serial);
    try {
      const data = await devicesAPI.getDeviceDetail(serial);
      setDeviceData(data);
      setLastServerPull(new Date());

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
      // Every screen renders off deviceData, so a silent failure here left the
      // whole app sitting on a loading state with the reason only in the
      // console. Say what happened and offer the retry.
      notify.fromError(e, {
        action: 'load this device',
        subject: serial,
        onRetry: () => fetchDeviceData(serial),
      });
    }
  }, [notify]);

  useEffect(() => {
    if (!adminActiveSerial) {
      localStorage.removeItem('adminActiveSerial');
      setDeviceData(null);
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
    fetchDeviceData,
    lastServerPull,
    setLastServerPull
  }), [
    mode, pressure, minPressure, maxPressure, aflex, ramp,
    sidebarOpen, saveState, showToast, toastMessage,
    hasUnsavedChanges, handleSave,
    adminActiveSerial, deviceData, fetchDeviceData, lastServerPull,
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
