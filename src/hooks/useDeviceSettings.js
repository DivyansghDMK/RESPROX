// src/hooks/useDeviceSettings.js
// Drop-in hook for DeckLink device app.
// Connects to server WS, receives pushed settings, updates TherapyContext.
// Usage: call inside your root component (e.g. App.jsx or Dashboard.jsx)

import { useEffect, useRef, useCallback } from 'react';
import { useTherapy } from '../context/TherapyContext';  // adjust path if needed

const WS_BASE  = import.meta.env.VITE_WS_URL  || 'ws://localhost:8000';
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

// ── How to get patient ID in the app ─────────────────────────────
// Option A: stored after login  → localStorage.getItem('patientId')
// Option B: from TherapyContext → context.patientId
// Change getPatientId() to match your auth flow:
function getPatientId() {
  return localStorage.getItem('deviceSerial') || 'DS-9281-AX';
}

export function useDeviceSettings() {
  const { setMode, setPressure, setMinPressure, setMaxPressure, setAflex, setRamp } = useTherapy();
  const wsRef       = useRef(null);
  const retryRef    = useRef(null);
  const retryDelay  = useRef(1000);

  // ── Apply incoming settings to TherapyContext ─────────────────
  const applySettings = useCallback((data, source = 'push') => {
    console.log(`[DeviceWS] Applying settings from ${source}:`, data);

    if (data.therapy_mode !== undefined) setMode(data.therapy_mode === 'AUTO CPAP' ? 'auto' : 'cpap');
    if (data.pressure     !== undefined) setPressure(data.pressure);
    if (data.min_pressure !== undefined) setMinPressure(data.min_pressure);
    if (data.max_pressure !== undefined) setMaxPressure(data.max_pressure);
    if (data.aflex        !== undefined) setAflex(data.aflex);
    if (data.ramp         !== undefined) setRamp(data.ramp);
  }, [setMode, setPressure, setMinPressure, setMaxPressure, setAflex, setRamp]);

  // ── Fetch latest settings on startup (REST fallback) ─────────
  async function fetchInitialSettings() {
    const patientId = getPatientId();
    try {
      const res = await fetch(`${API_BASE}/device/settings/${patientId}`);
      if (!res.ok) return;
      const { settings } = await res.json();
      applySettings(settings, 'REST-init');
    } catch (e) {
      console.warn('[DeviceWS] REST init failed:', e.message);
    }
  }

  // ── Send ack to server ────────────────────────────────────────
  function sendAck(ws, timestamp) {
    const patientId = getPatientId();
    const ack = {
      type: 'ack',
      data: { patient_id: patientId, timestamp, applied: true },
    };
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(ack));
  }

  // ── Connect WebSocket ─────────────────────────────────────────
  const connect = useCallback(() => {
    const patientId = getPatientId();
    const url = `${WS_BASE}/ws/device/${patientId}`;
    console.log(`[DeviceWS] Connecting to ${url}`);

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[DeviceWS] Connected');
      retryDelay.current = 1000;  // reset backoff
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'settings_update' || msg.type === 'settings_sync') {
          applySettings(msg.data, msg.type);
          if (msg.type === 'settings_update' && msg.data.timestamp) {
            sendAck(ws, msg.data.timestamp);
          }
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (e) {
        console.warn('[DeviceWS] Bad message:', e.message);
      }
    };

    ws.onclose = () => {
      console.log(`[DeviceWS] Disconnected — retrying in ${retryDelay.current}ms`);
      // Exponential backoff: 1s → 2s → 4s → … → 30s max
      retryRef.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 2, 30000);
        connect();
      }, retryDelay.current);
    };

    ws.onerror = (e) => {
      console.warn('[DeviceWS] Error:', e.message);
    };
  }, [applySettings]);

  useEffect(() => {
    fetchInitialSettings();  // REST fallback on startup
    connect();               // then open WS for live pushes

    return () => {
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
