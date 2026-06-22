// src/components/AdminSettingsEditor.jsx
// Embed inside AdminPatientDetail — shows current settings with live edit + push to device
// Usage: <AdminSettingsEditor patientId={patient.id} initial={patient} />

import { useState, useEffect, useRef } from 'react';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || 'admin-secret-token-change-me';

const AFLEX_LABELS = ['Off', '1', '2', '3'];
const MODES = ['CPAP', 'AUTO CPAP'];

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ADMIN_TOKEN}`,
  };
}

export default function AdminSettingsEditor({ patientId, initial }) {
  const [settings, setSettings]     = useState(null);
  const [draft, setDraft]           = useState(null);     // edited but not saved
  const [pending, setPending]       = useState(null);     // sent, waiting ack
  const [deviceOnline, setOnline]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState(null);     // { msg, type }
  const [dirty, setDirty]           = useState(false);
  const pollRef = useRef(null);

  // ── Load current settings ──────────────────────────────────────
  useEffect(() => {
    fetchSettings();
    // Poll device status every 10s
    pollRef.current = setInterval(fetchSettings, 10000);
    return () => clearInterval(pollRef.current);
  }, [patientId]);

  async function fetchSettings() {
    try {
      const res = await fetch(`${API}/admin/patients/${patientId}/settings`, { headers: headers() });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      setSettings(data.settings);
      setPending(data.pending || null);
      setOnline(data.device_online);
      if (!draft) setDraft(data.settings);   // init draft on first load
    } catch (e) {
      showToast('Failed to load settings', 'error');
    }
  }

  // ── Draft helpers ──────────────────────────────────────────────
  function patch(key, value) {
    setDraft(d => ({ ...d, [key]: value }));
    setDirty(true);
  }

  function resetDraft() {
    setDraft({ ...settings });
    setDirty(false);
  }

  // ── Save → push to server → WS push to device ─────────────────
  async function saveSettings() {
    if (!draft) return;
    setSaving(true);
    try {
      const body = {};
      for (const key of ['therapy_mode', 'pressure', 'min_pressure', 'max_pressure', 'aflex', 'ramp']) {
        if (draft[key] !== undefined) body[key] = draft[key];
      }

      const res = await fetch(`${API}/admin/patients/${patientId}/settings`, {
        method:  'PATCH',
        headers: headers(),
        body:    JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || res.statusText);

      setSettings(data.settings);
      setDraft(data.settings);
      setDirty(false);

      if (data.device_online) {
        setPending(data.settings);
        showToast('Settings pushed to device ✓', 'success');
      } else {
        showToast('Device offline — settings queued', 'warning');
      }
    } catch (e) {
      showToast(e.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  if (!draft) return (
    <div className="ase-loading">
      <div className="admin-spinner" />
    </div>
  );

  const isAutoMode = draft.therapy_mode === 'AUTO CPAP';

  return (
    <div className="ase-wrap">

      {/* ── Header row ── */}
      <div className="ase-header">
        <div className="ase-title-row">
          <span className="admin-section-title" style={{ margin: 0 }}>Therapy Settings</span>
          <div className="ase-device-status">
            <span className={`ase-dot ${deviceOnline ? 'online' : 'offline'}`} />
            <span className="ase-device-label">
              {deviceOnline ? 'Device Online' : 'Device Offline'}
            </span>
          </div>
        </div>

        {pending && (
          <div className="ase-pending-banner">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Awaiting device acknowledgement…
          </div>
        )}
      </div>

      {/* ── Mode selector ── */}
      <div className="ase-field">
        <label className="ase-label">Therapy Mode</label>
        <div className="ase-mode-tabs">
          {MODES.map(m => (
            <button
              key={m}
              className={`ase-mode-tab ${draft.therapy_mode === m ? 'active' : ''}`}
              onClick={() => patch('therapy_mode', m)}
            >
              {m === 'CPAP'
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              }
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* ── Pressure sliders ── */}
      {!isAutoMode ? (
        <SliderField
          label="Pressure"
          unit="cmH₂O"
          value={draft.pressure}
          min={4} max={30} step={0.5}
          onChange={v => patch('pressure', v)}
          compare={settings?.pressure}
        />
      ) : (
        <>
          <SliderField
            label="Min Pressure"
            unit="cmH₂O"
            value={draft.min_pressure}
            min={4} max={draft.max_pressure - 0.5 || 29} step={0.5}
            onChange={v => patch('min_pressure', v)}
            compare={settings?.min_pressure}
          />
          <SliderField
            label="Max Pressure"
            unit="cmH₂O"
            value={draft.max_pressure}
            min={draft.min_pressure + 0.5 || 5} max={30} step={0.5}
            onChange={v => patch('max_pressure', v)}
            compare={settings?.max_pressure}
          />
        </>
      )}

      {/* ── A-Flex ── */}
      <div className="ase-field">
        <label className="ase-label">A-Flex (EPR)</label>
        <div className="ase-segment">
          {AFLEX_LABELS.map((l, i) => (
            <button
              key={i}
              className={`ase-seg-btn ${draft.aflex === i ? 'active' : ''} ${settings?.aflex === i && draft.aflex !== i ? 'was-active' : ''}`}
              onClick={() => patch('aflex', i)}
            >
              {l}
            </button>
          ))}
        </div>
        {settings?.aflex !== draft.aflex && (
          <span className="ase-changed-tag">was: {AFLEX_LABELS[settings?.aflex ?? 0]}</span>
        )}
      </div>

      {/* ── Ramp ── */}
      <SliderField
        label="Ramp Time"
        unit="min"
        value={draft.ramp}
        min={0} max={60} step={1}
        onChange={v => patch('ramp', v)}
        compare={settings?.ramp}
      />

      {/* ── Actions ── */}
      <div className="ase-actions">
        <button
          className="ase-reset-btn"
          onClick={resetDraft}
          disabled={!dirty || saving}
        >
          Discard
        </button>
        <button
          className="ase-save-btn"
          onClick={saveSettings}
          disabled={!dirty || saving}
        >
          {saving
            ? <><span className="ase-btn-spinner" /> Pushing…</>
            : deviceOnline
              ? '⚡ Push to Device'
              : '📥 Save & Queue'
          }
        </button>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className={`ase-toast ase-toast-${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Reusable slider field ─────────────────────────────────────────
function SliderField({ label, unit, value, min, max, step, onChange, compare }) {
  const pct = ((value - min) / (max - min)) * 100;
  const changed = compare !== undefined && compare !== value;

  return (
    <div className="ase-field">
      <div className="ase-label-row">
        <label className="ase-label">{label}</label>
        <div className="ase-value-badge">
          <span className="ase-value-num">{value.toFixed(1)}</span>
          <span className="ase-value-unit">{unit}</span>
          {changed && (
            <span className="ase-changed-tag">was {compare?.toFixed(1)}</span>
          )}
        </div>
      </div>
      <input
        type="range"
        className="ase-slider"
        min={min} max={max} step={step}
        value={value}
        style={{ '--pct': `${pct.toFixed(1)}%` }}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
      <div className="ase-range-labels">
        <span>{min} {unit}</span>
        <span>{max} {unit}</span>
      </div>
    </div>
  );
}
