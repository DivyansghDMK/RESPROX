import React, { createContext, useContext, useState, useMemo, useEffect, useRef } from 'react';

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

  // Reference for checking unsaved changes
  const initialSettings = useRef({
    pressure: 12,
    minPressure: 5,
    maxPressure: 15,
    aflex: 2,
    ramp: 20
  });

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
    try {
      // Mock API Save Settings call with 1.5s delay
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
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
    hasUnsavedChanges,
    handleSave
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
