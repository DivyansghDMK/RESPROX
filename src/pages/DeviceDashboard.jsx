// src/pages/DeviceDashboard.jsx — Admin Device Dashboard (no inline tabs)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { devicesAPI } from '../services/api';
import { useTherapy } from '../context/TherapyContext';
import SendIcon from '@mui/icons-material/Send';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  MinusIcon, PlusIcon, MaskIcon, DotsIcon, PulseIcon, DeviceIcon,
} from '../components/Icons';

// ── Icon helpers ──────────────────────────────────────────────────────────────
const ArrowLeft = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);
const CpapIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M3 12h18M3 6h18M3 18h12"/>
  </svg>
);
const AutoIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

// ── Ring Progress ─────────────────────────────────────────────────────────────
function RingProgress({ pct, size = 72, stroke = 6, color = '#0ea5e9' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * circ;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke}
        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dasharray 0.6s ease' }}/>
      <text x="50%" y="50%" dy=".3em" translate="no" className="notranslate" textAnchor="middle"
        style={{ fill: color, fontSize: size * 0.22, fontWeight: 800 }}>
        {pct}%
      </text>
    </svg>
  );
}

// ── Mini Bar Chart ────────────────────────────────────────────────────────────
function MiniBarChart({ sessions, valueKey, maxVal, goodFn, goodColor = '#1d9e75', badColor = '#e24b4a' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80, padding: '0 4px' }}>
      {sessions.map((s, i) => {
        const val = s[valueKey];
        const pct = Math.min((val / maxVal) * 100, 100);
        const clr = goodFn(val) ? goodColor : badColor;
        return (
          <div key={i} title={`${s.date}: ${val}`}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700 }}>{val}</span>
            <div style={{
              width: '100%', height: `${Math.max(pct, 8)}%`,
              background: `linear-gradient(180deg, ${clr}dd, ${clr})`,
              borderRadius: '4px 4px 2px 2px', minHeight: 6,
              boxShadow: `0 2px 8px ${clr}44`, transition: 'height 0.5s ease'
            }}/>
            <span style={{ fontSize: 9, color: '#94a3b8' }}>{s.date?.split(' ')[0]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Styled Slider ─────────────────────────────────────────────────────────────
function StyledSlider({ value, min, max, step, onChange, label }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="custom-range-slider"
        style={{ '--progress': `${pct}%`, width: '100%' }}
        aria-label={label}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
        <span>{min}</span>
        <span>Range: {min}–{max} cmH₂O</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function DeviceDashboard() {
  const { serial } = useParams();
  const navigate   = useNavigate();
  const { setAdminActiveSerial, setLastServerPull, setDeviceData } = useTherapy();

  useEffect(() => {
    if (serial) setAdminActiveSerial(serial);
  }, [serial, setAdminActiveSerial]);

  const [device, setDevice]           = useState(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [devices, setDevices]         = useState([]);
  const [mode, setMode]               = useState('AUTO CPAP');
  const [pressure, setPressure]       = useState(12.0);
  const [minPressure, setMinPressure] = useState(8.0);
  const [maxPressure, setMaxPressure] = useState(18.0);
  const [aflex, setAflex]             = useState(2);
  const [ramp, setRamp]               = useState(15);
  const [saving, setSaving]           = useState(false);
  const [toast, setToast]             = useState(null);
  const [lastPull, setLastPull]       = useState(null);
  const pollRef = useRef(null);

  const fetchDevicesList = useCallback(async () => {
    try { const list = await devicesAPI.getDevices(); setDevices(list); }
    catch (e) { console.warn('Sidebar fetch failed:', e); }
  }, []);

  const applyDeviceState = (data) => {
    setMode(data.settings.therapy_mode);
    setPressure(data.settings.pressure);
    setMinPressure(data.settings.min_pressure);
    setMaxPressure(data.settings.max_pressure);
    setAflex(data.settings.aflex);
    setRamp(data.settings.ramp);
  };

  const fetchDevice = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await devicesAPI.getDeviceDetail(serial);
      setDevice(data);
      // Sync to TherapyContext so Therapy/Trends/Reports/MaskFit pages auto-read live data
      setDeviceData(data);
      const now = new Date();
      setLastPull(now);
      setLastServerPull(now);
      if (!silent) applyDeviceState(data);
    } catch (e) { console.error(e); }
    finally { if (!silent) setLoading(false); }
  }, [serial, setLastServerPull, setDeviceData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDevice(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchDevicesList();
    fetchDevice();
    pollRef.current = setInterval(() => { fetchDevice(true); fetchDevicesList(); }, 5000);
    return () => clearInterval(pollRef.current);
  }, [fetchDevice, fetchDevicesList]);

  const dirty = useMemo(() => {
    if (!device) return false;
    const s = device.settings;
    return mode !== s.therapy_mode || pressure !== s.pressure || minPressure !== s.min_pressure ||
      maxPressure !== s.max_pressure || aflex !== s.aflex || ramp !== s.ramp;
  }, [device, mode, pressure, minPressure, maxPressure, aflex, ramp]);

  const resetDraft = () => { if (device) applyDeviceState(device); };

  const saveSettings = async () => {
    if (!device) return;
    setSaving(true);
    try {
      const res = await devicesAPI.updateSettings(serial, {
        therapy_mode: mode, pressure, min_pressure: minPressure,
        max_pressure: maxPressure, aflex, ramp,
      });
      setDevice(prev => ({ ...prev, settings: res.settings, device_online: res.device_online }));
      showToast(
        device.device_online ? 'Settings pushed to device successfully' : 'Device offline — settings queued',
        device.device_online ? 'success' : 'warning'
      );
    } catch (e) { showToast(e.message || 'Save failed', 'error'); }
    finally { setSaving(false); }
  };

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function formatPull(date) {
    if (!date) return 'Never';
    const diff = Math.floor((Date.now() - date) / 1000);
    if (diff < 10) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  }

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div className="admin-loading">
        <div className="admin-spinner"/>
        <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Loading device <code>{serial}</code>…</span>
      </div>
    </div>
  );
  if (!device) return (
    <div className="admin-detail-page">
      <div className="admin-empty">
        <p>Device <strong>{serial}</strong> not found.</p>
        <button className="admin-page-btn" onClick={() => navigate('/devices')}>← Back to Devices</button>
      </div>
    </div>
  );

  // ── Computed values ───────────────────────────────────────────────────────
  const ld          = device.live_data;
  const hoursInt    = Math.floor(ld.usage_hours);
  const minsInt     = Math.round((ld.usage_hours - hoursInt) * 60);
  const usagePct    = Math.min(Math.round((ld.usage_hours / 8) * 100), 100);
  const isOnline    = device.device_online;
  const maxAHI      = Math.max(...device.sessions.map(s => s.ahi), 5);
  const maxUsageHrs = Math.max(...device.sessions.map(s => s.usage_hours), 8);
  const maxLeak     = Math.max(...device.sessions.map(s => s.mask_leak), 24);

  const maintenanceItems = [
    { label: 'Mask',       value: '28 Days', pct: 70, icon: MaskIcon,   color: '#1d9e75' },
    { label: 'Filter',     value: '56%',     pct: 56, icon: DotsIcon,   color: '#0d7de6' },
    { label: 'Humidifier', value: '75%',     pct: 75, icon: PulseIcon,  color: '#06b6d4' },
    { label: 'Tubing',     value: '4 Days',  pct: 40, icon: DeviceIcon, color: '#ef9f27' },
  ];

  return (
    <div className="dashboard-layout-container">

      {/* ── Device List Sidebar ───────────────────────────────────────────────── */}
      <aside className="dashboard-master-sidebar">
        <div style={{ padding: '14px 12px 10px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 2 }}>
            Devices
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{devices.length} registered</div>
        </div>
        <div style={{ flex: 1, padding: '6px' }}>
          {devices.map(d => {
            const isActive = d.serial === serial;
            const online   = d.status === 'online';
            return (
              <button key={d.serial}
                onClick={() => navigate(`/device/${d.serial}`)}
                style={{
                  width: '100%', textAlign: 'left', padding: '9px 11px',
                  borderRadius: 9, border: 'none', cursor: 'pointer',
                  marginBottom: 3, transition: 'all 0.15s',
                  background: isActive
                    ? 'linear-gradient(135deg,rgba(13,125,230,0.13),rgba(39,198,199,0.07))'
                    : 'transparent',
                  borderLeft: isActive ? '3px solid #0d7de6' : '3px solid transparent',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800, fontFamily: 'monospace',
                    color: isActive ? '#0d7de6' : 'var(--text)',
                  }}>{d.serial}</span>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: online ? '#1d9e75' : '#cbd5e1',
                    boxShadow: online ? '0 0 6px #1d9e75aa' : 'none',
                  }}/>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>
                  {online ? 'Online' : 'Offline'}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Main Content ──────────────────────────────────────────────────────── */}
      <div className="dashboard-main-content">

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', top: 16, right: 24, zIndex: 9999,
            background: toast.type === 'success' ? '#0f766e' : toast.type === 'warning' ? '#b45309' : '#9f1239',
            color: '#fff', padding: '12px 20px', borderRadius: 12, fontWeight: 700,
            fontSize: 13, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', animation: 'slideDown 0.3s ease',
            display: 'flex', alignItems: 'center', gap: 10, maxWidth: 340,
          }}>
            <span>{toast.type === 'success' ? '✓' : '⚠'}</span> {toast.msg}
          </div>
        )}

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigate('/devices')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 9, fontSize: 12, fontWeight: 700, color: 'var(--muted)', cursor: 'pointer' }}>
              <ArrowLeft /> Back
            </button>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 1 }}>
                Admin Device Panel
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, fontFamily: 'monospace', color: '#0d7de6', letterSpacing: '-0.5px' }}>
                  {device.serial}
                </h1>
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{device.model}</span>
              </div>
              <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
                <span style={{ fontSize: 10, background: '#e8f4fd', color: '#0d7de6', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>CPAP C-Series</span>
                <span style={{ fontSize: 10, background: '#f0f4ff', color: '#6366f1', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>FW: {device.firmware}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--muted)' }}>
              <div style={{ fontWeight: 600 }}>Last synced</div>
              <div style={{ color: '#0d7de6', fontWeight: 700, fontSize: 12 }}>{formatPull(lastPull)}</div>
            </div>
            <button onClick={handleRefresh} disabled={refreshing}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 9, fontSize: 12, fontWeight: 700, color: 'var(--muted)', cursor: 'pointer', opacity: refreshing ? 0.6 : 1 }}>
              <RefreshIcon fontSize="small" style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}/>
              Refresh
            </button>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: isOnline ? '#dcfce7' : '#f1f5f9',
              color: isOnline ? '#15803d' : '#64748b',
              padding: '7px 13px', borderRadius: 20, fontWeight: 700, fontSize: 12,
              border: `1px solid ${isOnline ? '#86efac' : '#e2e8f0'}`,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: isOnline ? '#16a34a' : '#94a3b8',
                boxShadow: isOnline ? '0 0 0 3px #bbf7d0' : 'none',
                animation: isOnline ? 'pulse 2s infinite' : 'none',
              }}/>
              {isOnline ? 'Device Online' : 'Device Offline'}
            </span>
          </div>
        </div>

        {/* ── 4 Metric Cards ─────────────────────────────────────────────────── */}
        <div className="dashboard-metrics-grid" style={{ marginBottom: 18 }}>

          {/* Usage */}
          <div style={card}>
            <div style={cardEyebrow}>Usage</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <div>
                <div style={{ fontSize: 30, fontWeight: 900, color: '#163257', lineHeight: 1 }}>{hoursInt}h {minsInt}m</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, fontWeight: 600 }}>Last night usage</div>
                <div style={{ fontSize: 12, color: '#0d7de6', fontWeight: 700, marginTop: 2 }}>{usagePct}% of goal</div>
              </div>
              <RingProgress pct={usagePct} size={68} stroke={6} color="#0d7de6"/>
            </div>
          </div>

          {/* AHI */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={cardEyebrow}>AHI</div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: ld.ahi <= 5 ? '#dcfce7' : '#fef3c7', color: ld.ahi <= 5 ? '#15803d' : '#92400e' }}>
                {ld.ahi <= 5 ? 'Normal' : 'Elevated'}
              </span>
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, color: ld.ahi <= 5 ? '#15803d' : '#b45309', lineHeight: 1, marginTop: 8 }}>{ld.ahi}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, fontWeight: 600 }}>Events per hour · Target ≤ 5.0</div>
          </div>

          {/* Mask Seal */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={cardEyebrow}>Mask Seal</div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: ld.mask_leak <= 24 ? '#dcfce7' : '#fee2e2', color: ld.mask_leak <= 24 ? '#15803d' : '#b91c1c' }}>
                {ld.mask_leak <= 24 ? 'Good' : 'High Leak'}
              </span>
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#163257', lineHeight: 1, marginTop: 8 }}>
              {ld.mask_leak} <span style={{ fontSize: 16, color: '#64748b' }}>L/min</span>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, fontWeight: 600 }}>Leak Rate · Target ≤ 24 L/min</div>
          </div>

          {/* Pressure */}
          <div style={card}>
            <div style={cardEyebrow}>95th Percentile Pressure</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#163257', lineHeight: 1, marginTop: 8 }}>
              {ld.pressure_95} <span style={{ fontSize: 16, color: '#64748b' }}>cmH₂O</span>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, fontWeight: 600 }}>Max set: {device.settings.max_pressure} cmH₂O</div>
            <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, transition: 'width 0.5s', width: `${Math.min((ld.pressure_95 / device.settings.max_pressure) * 100, 100)}%`, background: 'linear-gradient(90deg, #0d7de6, #27c6c7)' }}/>
            </div>
          </div>
        </div>

        {/* ── Therapy Settings Panel ──────────────────────────────────────────── */}
        <div style={{ ...sectionCard, marginBottom: 16 }}>
          <div style={sectionLabel}>Therapy Settings</div>

          {/* Mode Toggle */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 22, background: 'var(--panel-strong)', borderRadius: 12, padding: 6, border: '1px solid var(--line)' }}>
            {['CPAP', 'AUTO CPAP'].map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                  border: 'none', cursor: 'pointer', transition: 'all 0.25s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  background: mode === m ? 'linear-gradient(135deg, #0d7de6, #27c6c7)' : 'transparent',
                  color: mode === m ? '#fff' : 'var(--muted)',
                  boxShadow: mode === m ? '0 2px 12px rgba(13,125,230,0.25)' : 'none',
                }}>
                {m === 'CPAP' ? <CpapIcon/> : <AutoIcon/>} {m}
              </button>
            ))}
          </div>

          {mode === 'CPAP' ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={fieldLabel}>Fixed Pressure</div>
                <span style={modeBadge}>Fixed Mode</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                <button onClick={() => setPressure(v => Math.max(4, +(v - 0.5).toFixed(1)))} style={stepBtn}><MinusIcon/></button>
                <div style={{ textAlign: 'center', minWidth: 110 }}>
                  <span style={{ fontSize: 40, fontWeight: 900, color: '#0d7de6' }}>{pressure.toFixed(1)}</span>
                  <span style={{ fontSize: 14, color: '#64748b', marginLeft: 4 }}>cmH₂O</span>
                  {device.settings.pressure !== pressure && <div style={changedTag}>was {device.settings.pressure.toFixed(1)}</div>}
                </div>
                <button onClick={() => setPressure(v => Math.min(30, +(v + 0.5).toFixed(1)))} style={stepBtn}><PlusIcon/></button>
                <div style={{ flex: 1 }}>
                  <StyledSlider value={pressure} min={4} max={30} step={0.5} onChange={setPressure} label="Pressure"/>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <span style={fieldLabel}>Ramp Time</span>
                <button onClick={() => setRamp(v => Math.max(0, v - 1))} style={stepBtn}><MinusIcon/></button>
                <span style={{ fontWeight: 800, fontSize: 20, color: '#163257', minWidth: 32, textAlign: 'center' }}>{ramp}</span>
                <button onClick={() => setRamp(v => Math.min(45, v + 1))} style={stepBtn}><PlusIcon/></button>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>min · Range: 0–45</span>
                {device.settings.ramp !== ramp && <span style={changedTag}>was {device.settings.ramp}</span>}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={fieldLabel}>Auto CPAP Settings</div>
                <span style={{ ...modeBadge, background: '#e0f2fe', color: '#0369a1' }}>Auto Adjusting</span>
              </div>
              <div className="dashboard-two-col" style={{ gap: 20, marginBottom: 16 }}>
                {[
                  { label: 'Min Pressure', val: minPressure, changed: device.settings.min_pressure !== minPressure, was: device.settings.min_pressure, dec: () => setMinPressure(v => Math.max(4, +(v - 0.5).toFixed(1))), inc: () => setMinPressure(v => Math.min(maxPressure - 0.5, +(v + 0.5).toFixed(1))), sliderMax: maxPressure - 0.5, onChange: setMinPressure },
                  { label: 'Max Pressure', val: maxPressure, changed: device.settings.max_pressure !== maxPressure, was: device.settings.max_pressure, dec: () => setMaxPressure(v => Math.max(minPressure + 0.5, +(v - 0.5).toFixed(1))), inc: () => setMaxPressure(v => Math.min(30, +(v + 0.5).toFixed(1))), sliderMax: 30, onChange: setMaxPressure },
                ].map(({ label, val, changed, was, dec, inc, sliderMax, onChange }) => (
                  <div key={label}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>{label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <button onClick={dec} style={stepBtn}><MinusIcon/></button>
                      <span style={{ fontSize: 26, fontWeight: 900, color: '#163257' }}>{val.toFixed(1)}</span>
                      <span style={{ fontSize: 12, color: '#64748b' }}>cmH₂O</span>
                      <button onClick={inc} style={stepBtn}><PlusIcon/></button>
                      {changed && <span style={changedTag}>was {was.toFixed(1)}</span>}
                    </div>
                    <StyledSlider value={val} min={4} max={sliderMax} step={0.5} onChange={onChange} label={label}/>
                  </div>
                ))}
              </div>
              <div className="dashboard-two-col" style={{ gap: 20, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>Aflex (EPR)</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['Off', '1', '2', '3'].map((lbl, idx) => (
                      <button key={lbl} onClick={() => setAflex(idx)} style={{ flex: 1, padding: '10px 4px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: '1.5px solid', cursor: 'pointer', transition: 'all 0.2s', borderColor: aflex === idx ? 'transparent' : 'var(--line)', background: aflex === idx ? 'linear-gradient(135deg,#0d7de6,#27c6c7)' : 'var(--panel)', color: aflex === idx ? '#fff' : 'var(--muted)' }}>{lbl}</button>
                    ))}
                  </div>
                  {device.settings.aflex !== aflex && <div style={{ ...changedTag, marginTop: 4 }}>was: {device.settings.aflex}</div>}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>Ramp Time</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => setRamp(v => Math.max(0, v - 1))} style={stepBtn}><MinusIcon/></button>
                    <span style={{ fontWeight: 900, fontSize: 24, color: '#163257', minWidth: 32, textAlign: 'center' }}>{ramp}</span>
                    <button onClick={() => setRamp(v => Math.min(45, v + 1))} style={stepBtn}><PlusIcon/></button>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>min · 0–45</span>
                    {device.settings.ramp !== ramp && <span style={changedTag}>was {device.settings.ramp}</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Save / Discard bar */}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <button onClick={resetDraft} disabled={!dirty || saving}
              style={{ padding: '11px 22px', borderRadius: 10, fontWeight: 700, fontSize: 13, background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--muted)', cursor: dirty ? 'pointer' : 'not-allowed', opacity: dirty ? 1 : 0.5 }}>
              Discard Changes
            </button>
            <button onClick={saveSettings} disabled={!dirty || saving}
              style={{ flex: 1, padding: '11px 22px', borderRadius: 10, fontWeight: 800, fontSize: 14, background: dirty ? 'linear-gradient(135deg, #0d7de6 0%, #27c6c7 100%)' : '#e2e8f0', color: dirty ? '#fff' : '#94a3b8', border: 'none', cursor: dirty ? 'pointer' : 'not-allowed', boxShadow: dirty ? '0 4px 16px rgba(13,125,230,0.3)' : 'none', transition: 'all 0.25s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {saving
                ? <><span style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }}/> Applying…</>
                : isOnline
                  ? <><SendIcon fontSize="small"/> Push Settings to Device</>
                  : <><SaveIcon fontSize="small"/> Save &amp; Queue for Device</>
              }
            </button>
          </div>
        </div>

        {/* ── 7-Day Trend Charts ──────────────────────────────────────────────── */}
        <div style={{ ...sectionCard, marginBottom: 16 }}>
          <div style={sectionLabel}>7-Day Therapy Trends</div>
          <div className="dashboard-three-col">
            {[
              { label: 'AHI (events/hr)',  key: 'ahi',         maxVal: maxAHI,      goodFn: v => v <= 5,  goodColor: '#1d9e75', badColor: '#f59e0b', target: 'Target ≤ 5.0' },
              { label: 'Usage Hours',      key: 'usage_hours', maxVal: maxUsageHrs, goodFn: v => v >= 4,  goodColor: '#0ea5e9', badColor: '#e24b4a', target: 'Target ≥ 4h'  },
              { label: 'Mask Leak (L/min)',key: 'mask_leak',   maxVal: maxLeak,     goodFn: v => v <= 24, goodColor: '#60a5fa', badColor: '#e24b4a', target: 'Target ≤ 24'  },
            ].map(({ label, key, maxVal, goodFn, goodColor, badColor, target }) => (
              <div key={key} style={{ background: 'var(--panel-strong)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>{label}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{target}</span>
                </div>
                <MiniBarChart sessions={device.sessions} valueKey={key} maxVal={maxVal} goodFn={goodFn} goodColor={goodColor} badColor={badColor}/>
              </div>
            ))}
          </div>
        </div>

        {/* ── Device Info + Maintenance ────────────────────────────────────────── */}
        <div className="dashboard-two-col" style={{ marginBottom: 16 }}>
          <div style={sectionCard}>
            <div style={sectionLabel}>Device Info</div>
            {[
              ['Serial Number', device.serial, true],
              ['Model', device.model, false],
              ['Firmware', device.firmware, false],
              ['Last Session', device.sessions?.slice(-1)[0]?.date ?? '—', false],
              ['Compliance Rate', `${ld.compliance_pct}%`, false],
            ].map(([k, v, mono]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{k}</span>
                <span style={{ fontWeight: 800, color: 'var(--text)', fontFamily: mono ? 'monospace' : 'inherit' }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={sectionCard}>
            <div style={sectionLabel}>Maintenance Status</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {maintenanceItems.map(({ label, value, pct, icon: Icon, color }) => (
                <div key={label} style={{ background: 'var(--panel-strong)', borderRadius: 10, padding: '11px 12px', border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: `${color}18`, display: 'grid', placeItems: 'center', color }}><Icon/></div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>{label}</span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', marginBottom: 5 }}>{value}</div>
                  <div style={{ height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.4s' }}/>
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{pct}% remaining</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Session Log Table ─────────────────────────────────────────────────── */}
        <div style={sectionCard}>
          <div style={sectionLabel}>Session Log — Past 7 Days</div>
          <div className="admin-table-wrap" style={{ margin: 0, borderRadius: 10, border: '1px solid var(--line)' }}>
            <table className="admin-table">
              <thead>
                <tr>{['Date', 'Usage', 'AHI', 'Mask Leak', '95th Pressure', 'Compliance'].map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {[...device.sessions].reverse().map((s, i) => {
                  const compliant = s.usage_hours >= 4;
                  return (
                    <tr key={i}>
                      <td><strong>{s.date}</strong></td>
                      <td>{s.usage_hours}h</td>
                      <td>
                        <span className="admin-badge" style={{ background: s.ahi <= 5 ? '#dcfce7' : '#fef3c7', color: s.ahi <= 5 ? '#15803d' : '#92400e' }}>
                          {s.ahi}
                        </span>
                      </td>
                      <td>{s.mask_leak} L/min</td>
                      <td>{s.pressure_95} cmH₂O</td>
                      <td>
                        <span className="admin-status-pill" style={{ background: compliant ? '#dcfce7' : '#fee2e2', color: compliant ? '#15803d' : '#b91c1c' }}>
                          <span className="admin-status-dot" style={{ background: compliant ? '#16a34a' : '#dc2626' }}/>
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
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const card = {
  background: 'var(--panel-strong, #fff)',
  border: '1px solid var(--line, #e2e8f0)',
  borderRadius: 16,
  padding: '18px 20px',
  boxShadow: '0 1px 8px rgba(0,0,0,0.05)',
};
const sectionCard = {
  background: 'var(--panel-strong, #fff)',
  border: '1px solid var(--line, #e2e8f0)',
  borderRadius: 16,
  padding: '20px 24px',
  boxShadow: '0 1px 8px rgba(0,0,0,0.05)',
};
const sectionLabel = { fontSize: 12, fontWeight: 800, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.6px' };
const cardEyebrow  = { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' };
const fieldLabel   = { fontSize: 13, fontWeight: 800, color: 'var(--text)' };
const modeBadge    = { fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: '#e8f4fd', color: '#0d7de6' };
const stepBtn      = {
  width: 34, height: 34, borderRadius: 8, border: '1px solid var(--line, #e2e8f0)',
  background: 'var(--panel, #f8fafc)', color: 'var(--text)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
  flexShrink: 0,
};
const changedTag   = {
  display: 'inline-block', fontSize: 10, fontWeight: 700,
  background: '#fef9c3', color: '#a16207',
  padding: '2px 7px', borderRadius: 6, marginLeft: 4,
};
