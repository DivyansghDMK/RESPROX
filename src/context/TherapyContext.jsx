import React, { createContext, useContext, useState, useMemo, useEffect, useRef, useCallback } from 'react';

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
    const token = localStorage.getItem('adminToken');
    if (!token || !serial) return;
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
      const res = await fetch(`${API_BASE}/admin/devices/${serial}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setDeviceData(data);
        setLastServerPull(new Date()); // Record successful server pull time
        
        // Sync context settings state with server values
        setMode(data.settings.therapy_mode === 'AUTO CPAP' ? 'auto' : 'cpap');
        setPressure(data.settings.pressure);
        setMinPressure(data.settings.min_pressure);
        setMaxPressure(data.settings.max_pressure);
        setAflex(data.settings.aflex);
        setRamp(data.settings.ramp);
        
        initialSettings.current = {
          pressure: data.settings.pressure,
          minPressure: data.settings.min_pressure,
          maxPressure: data.settings.max_pressure,
          aflex: data.settings.aflex,
          ramp: data.settings.ramp
        };
      }
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
    const adminToken = localStorage.getItem('adminToken');
    const activeSerial = adminActiveSerial || localStorage.getItem('adminActiveSerial');

    try {
      if (adminToken && activeSerial) {
        // Save using API
        const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
        const body = {
          therapy_mode: mode === 'auto' ? 'AUTO CPAP' : 'CPAP',
          pressure,
          min_pressure: minPressure,
          max_pressure: maxPressure,
          aflex,
          ramp
        };
        const res = await fetch(`${API_BASE}/admin/patients/${activeSerial}/settings`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error("Failed to save settings to server");
        
        // Refresh device data
        await fetchDeviceData(activeSerial);
      } else {
        // Mock API Save Settings call with 1.5s delay
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      
      // Update original saved reference
      initialSettings.current = {
        pressure,
        minPressure,
        maxPressure,
        aflex,
        ramp
      };
      
      setSaveState('success');
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
        setSaveState('idle');
      }, 3000);
    } catch (error) {
      setSaveState('error');
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
        setSaveState('idle');
      }, 3000);
    }
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
