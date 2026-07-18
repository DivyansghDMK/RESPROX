import React, { createContext, useContext, useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { devicesAPI } from '../services/respireeApi';

const TherapyContext = createContext(null);

export function TherapyProvider({ children }) {
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
    try {
      const data = await devicesAPI.getDeviceDetail(serial);
      setDeviceData(data);
      setLastServerPull(new Date());

      const settings = data.settings || {};
      setMode(settings.therapy_mode === 'AUTO CPAP' ? 'auto' : 'cpap');
      setPressure(settings.pressure ?? 12);
      setMinPressure(settings.min_pressure ?? 4);
      setMaxPressure(settings.max_pressure ?? 30);
      setAflex(settings.aflex ?? 0);
      setRamp(settings.ramp ?? 0);

      initialSettings.current = {
        pressure: settings.pressure ?? 12,
        minPressure: settings.min_pressure ?? 4,
        maxPressure: settings.max_pressure ?? 30,
        aflex: settings.aflex ?? 0,
        ramp: settings.ramp ?? 0
      };
    } catch (e) {
      console.warn("Failed to fetch device data in TherapyContext:", e);
    }
  }, []);

  // Fetch data when active serial is loaded/changed
  useEffect(() => {
    if (adminActiveSerial) {
      localStorage.setItem('adminActiveSerial', adminActiveSerial);
      fetchDeviceData(adminActiveSerial);
    } else {
      localStorage.removeItem('adminActiveSerial');
      setDeviceData(null);
    }
  }, [adminActiveSerial, fetchDeviceData]);

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

  const handleSave = async () => {
    setSaveState('saving');
    setShowToast(true);
    setToastMessage('Read-only integration: device setting changes are not available from the staging API.');
    setTimeout(() => {
      setShowToast(false);
      setSaveState('idle');
    }, 3000);
    return;
  };

  const value = {
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
  };

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
