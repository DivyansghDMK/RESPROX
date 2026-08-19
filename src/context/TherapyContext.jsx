import React, { createContext, useContext, useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNotify } from './NotifyContext';
import { devicesAPI } from '../services/respireeApi';

const TherapyContext = createContext(null);

export function TherapyProvider({ children }) {
  const notify = useNotify();
  const [mode, setMode] = useState('cpap');
  const [pressure, setPressure] = useState(12);
  const [minPressure, setMinPressure] = useState(5);
  const [maxPressure, setMaxPressure] = useState(15);
  const [aflex, setAflex] = useState(2);
  const [ramp, setRamp] = useState(20);

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
    pressure: 12,
    minPressure: 5,
    maxPressure: 15,
    aflex: 2,
    ramp: 20
  });

  const fetchDeviceData = useCallback(async (serial) => {
    if (!serial) return;
    console.log("[TherapyContext] fetchDeviceData called for serial:", serial);
    try {
      const data = await devicesAPI.getDeviceDetail(serial);
      setDeviceData(data);
      setLastServerPull(new Date());

      const settings = data.settings || {};
      setMode(settings.therapy_mode === 'AUTO CPAP' ? 'auto' : settings.therapy_mode === 'BiPAP' ? 'bipap' : 'cpap');
      setPressure(settings.pressure ?? 12);
      setMinPressure(settings.min_pressure ?? 4);
      setMaxPressure(settings.max_pressure ?? (settings.therapy_mode === 'BiPAP' ? 30 : 20));
      setAflex(settings.aflex ?? 0);
      setRamp(settings.ramp ?? 30);

      initialSettings.current = {
        pressure: settings.pressure ?? 12,
        minPressure: settings.min_pressure ?? 4,
        maxPressure: settings.max_pressure ?? 30,
        aflex: settings.aflex ?? 0,
        ramp: settings.ramp ?? 0
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
    console.log("[TherapyContext] useEffect trigger active serial:", adminActiveSerial);
    if (adminActiveSerial) {
      localStorage.setItem('adminActiveSerial', adminActiveSerial);
      fetchDeviceData(adminActiveSerial);
    } else {
      localStorage.removeItem('adminActiveSerial');
      setDeviceData(null);
    }
  }, [adminActiveSerial, fetchDeviceData]);

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
    setSaveState('saving');
    setShowToast(true);
    setToastMessage('Pushing settings to device...');
    
    try {
      const payload = {
        therapy_mode: mode === 'auto' ? 'AUTO CPAP' : mode === 'bipap' ? 'BiPAP' : 'CPAP',
        pressure: Number(pressure),
        min_pressure: Number(minPressure),
        max_pressure: Number(maxPressure),
        aflex: Number(aflex),
        ramp: Number(ramp)
      };
      
      const res = await devicesAPI.updateDeviceSettings(adminActiveSerial, payload);
      
      // Update local reference to avoid unsaved warning
      initialSettings.current = {
        pressure: Number(pressure),
        minPressure: Number(minPressure),
        maxPressure: Number(maxPressure),
        aflex: Number(aflex),
        ramp: Number(ramp)
      };
      
      if (res && res.status === 'NO_CHANGE') {
        setSaveState('success');
        setToastMessage('No fields differ from current stored values; nothing saved.');
        setTimeout(() => setShowToast(false), 4000);
      } else if (res && res.commandId) {
        setToastMessage('Database updated. Syncing with device...');
        const pollRes = await devicesAPI.pollCommandStatus(adminActiveSerial, res.commandId);
        if (pollRes.status === 'ACKED') {
          setSaveState('success');
          setToastMessage('Settings successfully applied to device ✓');
        } else {
          throw new Error(`Device failed to apply settings (Status: ${pollRes.status})`);
        }
        setTimeout(() => setShowToast(false), 4000);
      } else {
        setSaveState('success');
        setToastMessage('Settings successfully updated in DB & pushed to device ✓');
        setTimeout(() => setShowToast(false), 4000);
      }
    } catch (e) {
      notify.fromError(e, { action: 'save these settings', subject: adminActiveSerial });
      setSaveState('error');
      setToastMessage(e.message || 'Failed to update settings in DB.');
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
