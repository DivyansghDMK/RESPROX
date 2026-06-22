// src/pages/DeviceDashboard.jsx  –  Clean desktop admin dashboard (no phone mockup)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { devicesAPI } from '../services/api';
import { useTherapy } from '../context/TherapyContext';
import {
  MinusIcon,
  PlusIcon,
  InfoIcon,
  MaskIcon,
  DotsIcon,
  PulseIcon,
  DeviceIcon,
  ClockIcon,
  GaugeIcon,
} from '../components/Icons';

// ── Tiny icon helpers ─────────────────────────────────────────────────────────
const ArrowLeft = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);
const CpapIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M3 12h18M3 6h18M3 18h12"/>
  </svg>
);
const AutoIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

const STATUS_COLOR = {
  online:  { bg: '#e6f9f0', text: '#0f6e56', dot: '#1d9e75' },
  offline: { bg: '#f1efe8', text: '#5f5e5a', dot: '#888780' }
};

// ── Circular ring progress ────────────────────────────────────────────────────
function RingProgress({ pct, size = 80, stroke = 7, color = '#0ea5e9' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"/>
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
        style={{ fill: '#163257', fontSize: size * 0.18, fontWeight: 800, transform: 'rotate(90deg)', transformOrigin: 'center' }}>
        {pct}%
      </text>
    </svg>
  );
}

// ── Bar chart for 7-day trends ────────────────────────────────────────────────
function MiniBarChart({ sessions, valueKey, maxVal, goodFn, goodColor = '#1d9e75', badColor = '#e24b4a' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80, padding: '4px 0' }}>
      {sessions.map((s, i) => {
        const val = s[valueKey];
        const pct = Math.min((val / maxVal) * 100, 100);
        const isGood = goodFn(val);
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{val}</span>
            <div style={{
              width: '100%', height: `${Math.max(pct, 6)}%`,
              background: `linear-gradient(180deg, ${isGood ? goodColor : badColor}cc, ${isGood ? goodColor : badColor})`,
              borderRadius: '4px 4px 2px 2px',
              minHeight: 6,
              transition: 'height 0.4s ease',
              boxShadow: `0 2px 6px ${isGood ? goodColor : badColor}44`
            }}/>
            <span style={{ fontSize: 9, color: '#94a3b8' }}>{s.date?.split(' ')[0]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Slider with progress fill ─────────────────────────────────────────────────
function StyledSlider({ value, min, max, step, onChange, label }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="custom-range-slider"
        style={{ '--progress': `${pct}%`, width: '100%' }}
        aria-label={label}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
        <span>{min}</span>
        <span>Range: {min} – {max} cm H₂O</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function DeviceDashboard() {
  const { serial } = useParams();
  const navigate = useNavigate();
  const { setAdminActiveSerial, setLastServerPull } = useTherapy();

  useEffect(() => {
    if (serial) setAdminActiveSerial(serial);
    return () => { setAdminActiveSerial(null); localStorage.removeItem('adminActiveSerial'); };
  }, [serial, setAdminActiveSerial]);

  const [device, setDevice]           = useState(null);
  const [loading, setLoading]         = useState(true);
  const [mode, setMode]               = useState('AUTO CPAP');
  const [pressure, setPressure]       = useState(12.0);
  const [minPressure, setMinPressure] = useState(8.0);
  const [maxPressure, setMaxPressure] = useState(18.0);
  const [aflex, setAflex]             = useState(2);
  const [ramp, setRamp]               = useState(15);
  const [saving, setSaving]           = useState(false);
  const [toast, setToast]             = useState(null);
  const pollRef = useRef(null);

  const fetchDevice = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await devicesAPI.getDeviceDetail(serial);
      setDevice(data);
      setLastServerPull(new Date());
      if (!silent) {
        setMode(data.settings.therapy_mode);
        setPressure(data.settings.pressure);
        setMinPressure(data.settings.min_pressure);
        setMaxPressure(data.settings.max_pressure);
        setAflex(data.settings.aflex);
        setRamp(data.settings.ramp);
      }
    } catch (e) { console.error(e); }
    finally { if (!silent) setLoading(false); }
  }, [serial, setLastServerPull]);

  useEffect(() => {
    fetchDevice();
    pollRef.current = setInterval(() => fetchDevice(true), 5000);
    return () => clearInterval(pollRef.current);
  }, [fetchDevice]);

  const dirty = useMemo(() => {
    if (!device) return false;
    const s = device.settings;
    return mode !== s.therapy_mode || pressure !== s.pressure || minPressure !== s.min_pressure ||
      maxPressure !== s.max_pressure || aflex !== s.aflex || ramp !== s.ramp;
  }, [device, mode, pressure, minPressure, maxPressure, aflex, ramp]);

  const resetDraft = () => {
    if (!device) return;
    const s = device.settings;
    setMode(s.therapy_mode); setPressure(s.pressure); setMinPressure(s.min_pressure);
    setMaxPressure(s.max_pressure); setAflex(s.aflex); setRamp(s.ramp);
  };

  const saveSettings = async () => {
    if (!device) return;
    setSaving(true);
    try {
      const res = await devicesAPI.updateSettings(serial, { therapy_mode: mode, pressure, min_pressure: minPressure, max_pressure: maxPressure, aflex, ramp });
      setDevice(prev => ({ ...prev, settings: res.settings, device_online: res.device_online }));
      showToast(device.device_online ? 'Settings pushed to device ✓' : 'Device offline — settings queued', device.device_online ? 'success' : 'warning');
    } catch (e) { showToast(e.message || 'Save failed', 'error'); }
    finally { setSaving(false); }
  };

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Loading / Error states ──────────────────────────────────────────────────
  if (loading) return (
    <div className="admin-detail-page"><div className="admin-loading"><div className="admin-spinner"/><span>Loading device telemetry…</span></div></div>
  );
  if (!device) return (
    <div className="admin-detail-page"><div className="admin-empty">
      <p>Device '{serial}' not found.</p>
      <button className="admin-page-btn" onClick={() => navigate('/devices')}>← Back to Devices</button>
    </div></div>
  );

  // ── Computed values ─────────────────────────────────────────────────────────
  const ld             = device.live_data;
  const hoursInt       = Math.floor(ld.usage_hours);
  const minsInt        = Math.round((ld.usage_hours - hoursInt) * 60);
  const formattedUsage = `${hoursInt}h ${minsInt}m`;
  const usagePct       = Math.round((ld.usage_hours / 8) * 100);
  const sc             = STATUS_COLOR[device.device_online ? 'online' : 'offline'];
  const maxAHI         = Math.max(...device.sessions.map(s => s.ahi), 5);
  const maxUsageHrs    = Math.max(...device.sessions.map(s => s.usage_hours), 8);
  const maxLeak        = Math.max(...device.sessions.map(s => s.mask_leak), 24);
  const pressProgress  = ((pressure - 4) / 26) * 100;

  const maintenanceItems = [
    { label: 'Mask Life',    value: '28 Days', pct: 70,  icon: MaskIcon,   color: '#1d9e75' },
    { label: 'Filter Life',  value: '56%',     pct: 56,  icon: DotsIcon,   color: '#0d7de6' },
    { label: 'Humidifier',   value: '75%',     pct: 75,  icon: PulseIcon,  color: '#1d9e75' },
    { label: 'Tubing',       value: '4 Days',  pct: 40,  icon: DeviceIcon, color: '#ef9f27' },
  ];

  return (
    <div style={{ padding: '20px 28px', maxWidth: 1280, margin: '0 auto', animation: 'fadeIn 0.35s ease' }}>

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 9999,
          background: toast.type === 'success' ? '#0f6e56' : toast.type === 'warning' ? '#b45309' : '#a32d2d',
          color: '#fff', padding: '12px 20px', borderRadius: 12, fontWeight: 700,
          fontSize: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', animation: 'slideDown 0.3s ease'
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={() => navigate('/devices')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--panel)', border: '1px solid var(--line)',
              borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 700,
              color: 'var(--muted)', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            <ArrowLeft /> Back to Devices
          </button>
          <div>
            <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, letterSpacing: '0.5px' }}>ADMIN DEVICE PANEL</div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, fontFamily: 'monospace', color: '#163257', letterSpacing: '-0.5px' }}>
              {device.serial}
              <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, marginLeft: 10, fontFamily: 'inherit' }}>
                {device.model}
              </span>
            </h1>
            <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
              <span style={{ fontSize: 11, background: '#e8f4fd', color: '#0d7de6', padding: '2px 8px', borderRadius: 8, fontWeight: 700 }}>CPAP C-Series</span>
              <span style={{ fontSize: 11, background: '#f0f4ff', color: '#6366f1', padding: '2px 8px', borderRadius: 8, fontWeight: 600 }}>FW: {device.firmware}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Patient: <strong style={{ color: 'var(--text)' }}>{device.patient?.name}</strong></span>
            </div>
          </div>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          background: sc.bg, color: sc.text,
          padding: '8px 16px', borderRadius: 20, fontWeight: 700, fontSize: 13
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: sc.dot, display: 'inline-block' }}/>
          {device.device_online ? 'Device Online' : 'Device Offline'}
        </span>
      </div>

      {/* ── 4 Metric Cards ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        
        {/* Usage */}
        <div style={cardStyle}>
          <div style={cardLabel}>Usage <span style={cardSub}>Last Night</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
            <div>
              <div style={bigValue}>{formattedUsage}</div>
              <div style={cardFooter}>{usagePct}% of goal</div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <RingProgress pct={usagePct} size={70} stroke={6}/>
            </div>
          </div>
        </div>

        {/* AHI */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={cardLabel}>AHI <span style={cardSub}>Last Night</span></div>
            <span style={{ ...badgeStyle, background: ld.ahi <= 5 ? '#e6f9f0' : '#faece7', color: ld.ahi <= 5 ? '#0f6e56' : '#993c1d' }}>
              {ld.ahi <= 5 ? 'Good' : 'Elevated'}
            </span>
          </div>
          <div style={{ ...bigValue, marginTop: 12 }}>{ld.ahi}</div>
          <div style={cardFooter}>Events / hr</div>
        </div>

        {/* Mask Seal */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={cardLabel}>Mask Seal <span style={cardSub}>Last Night</span></div>
            <span style={{ ...badgeStyle, background: ld.mask_leak <= 24 ? '#e6f9f0' : '#faece7', color: ld.mask_leak <= 24 ? '#0f6e56' : '#993c1d' }}>
              {ld.mask_leak <= 24 ? 'Good' : 'High Leak'}
            </span>
          </div>
          <div style={{ ...bigValue, marginTop: 12 }}>{ld.mask_leak} <span style={{ fontSize: '1rem', color: '#64748b' }}>L/min</span></div>
          <div style={cardFooter}>Leak Rate</div>
        </div>

        {/* Pressure */}
        <div style={cardStyle}>
          <div style={cardLabel}>Pressure <span style={cardSub}>95th Percentile</span></div>
          <div style={{ ...bigValue, marginTop: 12 }}>{ld.pressure_95} <span style={{ fontSize: '1rem', color: '#64748b' }}>cm H2O</span></div>
          <div style={cardFooter}>Max {device.settings.max_pressure} cm H2O</div>
        </div>
      </div>

      {/* ── Therapy Mode + Settings ───────────────────────────────────────── */}
      <div style={{ ...sectionCard, marginBottom: 16 }}>
        <div style={sectionLabel}>Therapy Mode</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => setMode('CPAP')}
            style={{
              flex: 1, padding: '12px', borderRadius: 10, fontWeight: 700, fontSize: 14,
              border: '1.5px solid',
              borderColor: mode === 'CPAP' ? 'transparent' : 'var(--line)',
              background: mode === 'CPAP' ? 'linear-gradient(135deg, #0d7de6, #27c6c7)' : 'var(--panel)',
              color: mode === 'CPAP' ? '#fff' : 'var(--muted)',
              cursor: 'pointer', transition: 'all 0.25s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}
          >
            <CpapIcon /> CPAP
          </button>
          <button
            onClick={() => setMode('AUTO CPAP')}
            style={{
              flex: 1, padding: '12px', borderRadius: 10, fontWeight: 700, fontSize: 14,
              border: '1.5px solid',
              borderColor: mode === 'AUTO CPAP' ? 'transparent' : 'var(--line)',
              background: mode === 'AUTO CPAP' ? 'linear-gradient(135deg, #0d7de6, #27c6c7)' : 'var(--panel)',
              color: mode === 'AUTO CPAP' ? '#fff' : 'var(--muted)',
              cursor: 'pointer', transition: 'all 0.25s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}
          >
            <AutoIcon /> AUTO CPAP
          </button>
        </div>

        {mode === 'CPAP' ? (
          /* ── Fixed CPAP ──────────────────────────────────────────────── */
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={fieldLabel}>CPAP <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Pressure Setting</span></div>
              <span style={{ fontSize: 11, background: '#e8f4fd', color: '#0d7de6', padding: '2px 8px', borderRadius: 8, fontWeight: 700 }}>Fixed Pressure</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
              <button onClick={() => setPressure(v => Math.max(4, +(v - 0.5).toFixed(1)))} style={stepBtn}><MinusIcon/></button>
              <div style={{ textAlign: 'center', minWidth: 120 }}>
                <span style={{ fontSize: 36, fontWeight: 900, color: '#163257' }}>{pressure.toFixed(1)}</span>
                <span style={{ fontSize: 14, color: '#64748b', marginLeft: 4 }}>cmH₂O</span>
                {device.settings.pressure !== pressure && <div style={changedTag}>was {device.settings.pressure.toFixed(1)}</div>}
              </div>
              <button onClick={() => setPressure(v => Math.min(30, +(v + 0.5).toFixed(1)))} style={stepBtn}><PlusIcon/></button>
              <div style={{ flex: 1 }}>
                <StyledSlider value={pressure} min={4} max={30} step={0.5} onChange={setPressure} label="Pressure"/>
              </div>
            </div>
            <div style={subFieldRow}>
              <div style={fieldLabel}>Ramp Time</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => setRamp(v => Math.max(0, v - 1))} style={stepBtn}><MinusIcon/></button>
                <span style={{ fontWeight: 800, fontSize: 20, color: '#163257', minWidth: 36, textAlign: 'center' }}>{ramp}</span>
                <button onClick={() => setRamp(v => Math.min(45, v + 1))} style={stepBtn}><PlusIcon/></button>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>min · Range: 0 – 45</span>
              </div>
            </div>
          </div>
        ) : (
          /* ── AUTO CPAP ───────────────────────────────────────────────── */
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={fieldLabel}>AUTO CPAP <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Settings</span></div>
              <span style={{ fontSize: 11, background: '#e8f4fd', color: '#0d7de6', padding: '2px 8px', borderRadius: 8, fontWeight: 700 }}>Auto Adjusting</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
              {/* Min Pressure */}
              <div>
                <div style={subFieldLabel}>Min Pressure</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <button onClick={() => setMinPressure(v => Math.max(4, +(v - 0.5).toFixed(1)))} style={stepBtn}><MinusIcon/></button>
                  <span style={{ fontSize: 28, fontWeight: 900, color: '#163257' }}>{minPressure.toFixed(1)}</span>
                  <span style={{ fontSize: 13, color: '#64748b' }}>cmH₂O</span>
                  <button onClick={() => setMinPressure(v => Math.min(maxPressure - 0.5, +(v + 0.5).toFixed(1)))} style={stepBtn}><PlusIcon/></button>
                  {device.settings.min_pressure !== minPressure && <span style={changedTag}>was {device.settings.min_pressure.toFixed(1)}</span>}
                </div>
                <StyledSlider value={minPressure} min={4} max={maxPressure - 0.5} step={0.5} onChange={setMinPressure} label="Min Pressure"/>
              </div>
              {/* Max Pressure */}
              <div>
                <div style={subFieldLabel}>Max Pressure</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <button onClick={() => setMaxPressure(v => Math.max(minPressure + 0.5, +(v - 0.5).toFixed(1)))} style={stepBtn}><MinusIcon/></button>
                  <span style={{ fontSize: 28, fontWeight: 900, color: '#163257' }}>{maxPressure.toFixed(1)}</span>
                  <span style={{ fontSize: 13, color: '#64748b' }}>cmH₂O</span>
                  <button onClick={() => setMaxPressure(v => Math.min(30, +(v + 0.5).toFixed(1)))} style={stepBtn}><PlusIcon/></button>
                  {device.settings.max_pressure !== maxPressure && <span style={changedTag}>was {device.settings.max_pressure.toFixed(1)}</span>}
                </div>
                <StyledSlider value={maxPressure} min={minPressure + 0.5} max={30} step={0.5} onChange={setMaxPressure} label="Max Pressure"/>
              </div>
            </div>

            {/* Aflex + Ramp row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <div style={subFieldLabel}>Aflex (EPR)</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  {['Off', '1', '2', '3'].map((lbl, idx) => (
                    <button
                      key={lbl}
                      onClick={() => setAflex(idx)}
                      style={{
                        flex: 1, padding: '10px 4px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                        border: '1.5px solid', cursor: 'pointer', transition: 'all 0.2s',
                        borderColor: aflex === idx ? 'transparent' : 'var(--line)',
                        background: aflex === idx ? 'linear-gradient(135deg,#0d7de6,#27c6c7)' : 'var(--panel)',
                        color: aflex === idx ? '#fff' : 'var(--muted)'
                      }}
                    >{lbl}</button>
                  ))}
                </div>
                {device.settings.aflex !== aflex && <div style={{ ...changedTag, marginTop: 4 }}>was: {device.settings.aflex}</div>}
              </div>
              <div style={subFieldRow}>
                <div style={subFieldLabel}>Ramp Time</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                  <button onClick={() => setRamp(v => Math.max(0, v - 1))} style={stepBtn}><MinusIcon/></button>
                  <span style={{ fontWeight: 800, fontSize: 22, color: '#163257', minWidth: 36, textAlign: 'center' }}>{ramp}</span>
                  <button onClick={() => setRamp(v => Math.min(45, v + 1))} style={stepBtn}><PlusIcon/></button>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>min · Range: 0–45</span>
                  {device.settings.ramp !== ramp && <span style={changedTag}>was {device.settings.ramp}</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Save / Discard bar */}
        <div style={{ display: 'flex', gap: 12, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
          <button
            onClick={resetDraft}
            disabled={!dirty || saving}
            style={{
              padding: '11px 24px', borderRadius: 10, fontWeight: 700, fontSize: 14,
              background: 'var(--panel)', border: '1px solid var(--line)',
              color: 'var(--muted)', cursor: dirty ? 'pointer' : 'not-allowed',
              opacity: dirty ? 1 : 0.5, transition: 'all 0.2s'
            }}
          >
            Discard Changes
          </button>
          <button
            onClick={saveSettings}
            disabled={!dirty || saving}
            style={{
              flex: 1, padding: '11px 24px', borderRadius: 10, fontWeight: 800, fontSize: 15,
              background: dirty ? 'linear-gradient(135deg, #0d7de6 0%, #27c6c7 100%)' : '#cbd5e1',
              color: '#fff', border: 'none',
              cursor: dirty ? 'pointer' : 'not-allowed',
              boxShadow: dirty ? '0 4px 16px rgba(13,125,230,0.3)' : 'none',
              transition: 'all 0.25s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}
          >
            {saving ? (
              <><span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }}/> Pushing…</>
            ) : device.device_online ? '⚡ Push Settings to Device' : '📥 Save & Queue for Device'}
          </button>
        </div>
      </div>

      {/* ── 7-Day Trend Charts ────────────────────────────────────────────── */}
      <div style={{ ...sectionCard, marginBottom: 16 }}>
        <div style={sectionLabel}>7-Day Usage Trend</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>AHI (events/hr)</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Target ≤ 5.0</span>
            </div>
            <MiniBarChart sessions={device.sessions} valueKey="ahi" maxVal={maxAHI} goodFn={v => v <= 5} goodColor="#1d9e75" badColor="#ef9f27"/>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Usage Hours</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Target ≥ 4h</span>
            </div>
            <MiniBarChart sessions={device.sessions} valueKey="usage_hours" maxVal={maxUsageHrs} goodFn={v => v >= 4} goodColor="#0ea5e9" badColor="#e24b4a"/>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Mask Leak (L/min)</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Target ≤ 24</span>
            </div>
            <MiniBarChart sessions={device.sessions} valueKey="mask_leak" maxVal={maxLeak} goodFn={v => v <= 24} goodColor="#60a5fa" badColor="#e24b4a"/>
          </div>
        </div>
      </div>

      {/* ── Patient Summary + Maintenance Row ────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Patient Summary */}
        <div style={sectionCard}>
          <div style={sectionLabel}>Patient Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', fontSize: 14 }}>
            {[
              ['Name', device.patient?.name],
              ['Patient ID', device.patient?.id],
              ['Age / Gender', `${device.patient?.age}y / ${device.patient?.gender}`],
              ['Registered Serial', device.serial],
              ['Compliance', `${device.patient?.compliance_pct ?? '—'}%`],
              ['Last Session', device.sessions?.slice(-1)[0]?.date ?? '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>{k}</div>
                <div style={{ fontWeight: 700, color: 'var(--text)', fontFamily: k === 'Registered Serial' ? 'monospace' : 'inherit' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Maintenance */}
        <div style={sectionCard}>
          <div style={sectionLabel}>Device Maintenance</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {maintenanceItems.map(({ label, value, pct, icon: Icon, color }) => (
              <div key={label} style={{ background: 'var(--panel-strong)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}18`, display: 'grid', placeItems: 'center', color }}>
                    <Icon/>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{label}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>{value}</div>
                <div style={{ height: 5, background: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s' }}/>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{pct}% remaining</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Session Log Table ─────────────────────────────────────────────── */}
      <div style={sectionCard}>
        <div style={sectionLabel}>Detailed Session Log — Past 7 Days</div>
        <div className="admin-table-wrap" style={{ margin: 0, borderRadius: 12 }}>
          <table className="admin-table">
            <thead>
              <tr>
                {['Date', 'Usage Hours', 'AHI', 'Mask Leak', '95th Pressure', 'Compliance'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...device.sessions].reverse().map((s, i) => {
                const compliant = s.usage_hours >= 4;
                return (
                  <tr key={i}>
                    <td><strong>{s.date}</strong></td>
                    <td>{s.usage_hours} hrs</td>
                    <td>
                      <span className="admin-badge" style={{ background: s.ahi <= 5 ? '#e6f9f0' : '#faece7', color: s.ahi <= 5 ? '#0f6e56' : '#993c1d' }}>
                        {s.ahi}
                      </span>
                    </td>
                    <td>{s.mask_leak} L/min</td>
                    <td>{s.pressure_95} cmH₂O</td>
                    <td>
                      <span className="admin-status-pill" style={{ background: compliant ? '#e6f9f0' : '#fcebeb', color: compliant ? '#0f6e56' : '#a32d2d' }}>
                        <span className="admin-status-dot" style={{ background: compliant ? '#1d9e75' : '#e24b4a' }}/>
                        {compliant ? 'Compliant' : 'Non-compliant'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

// ── Shared inline styles ──────────────────────────────────────────────────────
const cardStyle = {
  background: 'var(--panel-strong, #fff)',
  border: '1px solid var(--line, #e2e8f0)',
  borderRadius: 16,
  padding: '18px 20px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.04)'
};
const sectionCard = {
  background: 'var(--panel-strong, #fff)',
  border: '1px solid var(--line, #e2e8f0)',
  borderRadius: 16,
  padding: '20px 24px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.04)'
};
const sectionLabel = { fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 16, letterSpacing: '-0.02em' };
const cardLabel    = { fontSize: 13, fontWeight: 700, color: 'var(--muted)' };
const cardSub      = { fontSize: 11, fontWeight: 500, marginLeft: 4 };
const bigValue     = { fontSize: 32, fontWeight: 900, color: '#163257', lineHeight: 1.1 };
const cardFooter   = { fontSize: 12, color: '#94a3b8', marginTop: 6 };
const badgeStyle   = { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 };
const fieldLabel   = { fontSize: 14, fontWeight: 800, color: 'var(--text)' };
const subFieldLabel= { fontSize: 13, fontWeight: 700, color: 'var(--muted)' };
const subFieldRow  = {};
const stepBtn      = {
  width: 34, height: 34, borderRadius: 8, border: '1px solid var(--line, #e2e8f0)',
  background: 'var(--panel, #f8fafc)', color: 'var(--text)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
  flexShrink: 0
};
const changedTag   = {
  display: 'inline-block', fontSize: 10, fontWeight: 700,
  background: '#fff3cd', color: '#b45309',
  padding: '1px 6px', borderRadius: 6
};
