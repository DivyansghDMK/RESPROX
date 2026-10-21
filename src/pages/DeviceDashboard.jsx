// src/pages/DeviceDashboard.jsx — Admin Device Dashboard (no inline tabs)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DeviceDashboardSkeleton } from '../components/Skeleton';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { devicesAPI } from '../services/respireeApi';
import { useTherapy } from '../context/TherapyContext';
import { useNotify } from '../context/NotifyContext';
import { describeCommandStatus, describeError } from '../services/apiError';
import SendIcon from '@mui/icons-material/Send';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  MinusIcon, PlusIcon,
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
const RingProgress = React.memo(function RingProgress({ pct, size = 72, stroke = 6, color = '#0ea5e9' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * circ;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ width: size, height: size }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke}
          transform={`rotate(-90 ${size/2} ${size/2})`}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}/>
      </svg>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: color,
        fontSize: `${size * 0.22}px`,
        fontWeight: 800,
        pointerEvents: 'none',
        lineHeight: 1
      }}>
        {pct}%
      </div>
    </div>
  );
});

// ── Mini Bar Chart ────────────────────────────────────────────────────────────
const MiniBarChart = React.memo(function MiniBarChart({ sessions = [], valueKey, maxVal, goodFn, goodColor = '#1d9e75', badColor = '#e24b4a' }) {
  return (
    <div className="mini-bar-chart-container">
      {sessions.map((s, i) => {
        const val = s[valueKey];
        const pct = Math.min((val / maxVal) * 100, 100);
        const clr = goodFn(val) ? goodColor : badColor;
        return (
          <div key={i} title={`${s.date}: ${val}`}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <span className="bar-chart-val" style={{ fontSize: 9, color: '#64748b', fontWeight: 700 }}>{val}</span>
            <div style={{
              width: '100%', height: `${Math.max(pct * 0.44, 6)}px`,
              background: `linear-gradient(180deg, ${clr}dd, ${clr})`,
              borderRadius: '4px 4px 2px 2px', minHeight: 6,
              boxShadow: `0 2px 8px ${clr}44`, transition: 'height 0.5s ease'
            }}/>
            <span className="bar-chart-date" style={{ fontSize: 9, color: '#94a3b8' }}>{s.date}</span>
          </div>
        );
      })}
    </div>
  );
});

// ── Styled Slider ─────────────────────────────────────────────────────────────
const StyledSlider = React.memo(function StyledSlider({ value, min, max, step, onChange, label }) {
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
});

// The backend's last_synced is a 10-digit YYMMDDHHMM string (e.g. 2608151430).
function formatSyncStamp(value) {
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(value));
  if (!m) return String(value);
  const [, yy, mo, dd, hh, mi] = m;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mo) - 1];
  return month ? `${dd} ${month} 20${yy}, ${hh}:${mi}` : String(value);
}

// ── Therapy control ────────────────────────────────────────────────────────────
// Start/stop changes what the patient is breathing, so it is always a two-step
// action: press the button, then confirm in a dialog that names the device.
function TherapyControl({ status, applying, online, onRequest }) {
  const running = status === 'RUNNING';
  const stopped = status === 'STOPPED';
  const known = running || stopped;
  const busy = Boolean(applying);
  const headline = busy
    ? `${applying === 'start' ? 'Starting' : 'Stopping'} therapy…`
    : running ? 'Therapy is running' : stopped ? 'Therapy is stopped' : 'Therapy status unknown';
  const detail = busy
    ? 'Waiting for the device to confirm. Do not close this page.'
    : running ? 'Settings are locked while therapy is running.'
    : stopped ? 'Settings can be changed. Starting therapy locks them.'
    : 'Refresh to read the current state before sending a command.';
  const btn = (action, label) => (
    <button type="button" className={`therapy-btn ${action}`} onClick={() => onRequest(action)} disabled={busy}>
      {busy && applying === action ? <span className="therapy-spinner" aria-hidden="true" /> : <span aria-hidden="true">{action === 'start' ? '▶' : '■'}</span>}
      {label}
    </button>
  );
  return (
    <section className={`therapy-control${running ? ' running' : ''}${known ? '' : ' unknown'}`} aria-busy={busy} aria-label="Therapy control">
      <div className="therapy-control-info">
        <div className="therapy-eyebrow">Therapy Control</div>
        <div className="therapy-headline" role="status" aria-live="polite">
          {running && !busy && <span className="therapy-live-dot" aria-hidden="true" />}
          {headline}
        </div>
        <div className="therapy-detail">{detail}</div>
      </div>
      <div className="therapy-actions">
        {!online ? (
          <div className="therapy-offline" role="status">Device offline. Commands cannot reach it.</div>
        ) : (
          <>
            {(stopped || !known) && btn('start', busy && applying === 'start' ? 'Starting…' : 'Start therapy')}
            {(running || !known) && btn('stop', busy && applying === 'stop' ? 'Stopping…' : 'Stop therapy')}
          </>
        )}
      </div>
      {busy && <div className="therapy-progress" aria-hidden="true"><span /></div>}
    </section>
  );
}

function TherapyConfirmDialog({ action, serial, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const start = action === 'start';
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  // Portalled: the dashboard's entrance animation puts a transform on its children,
  // which would otherwise turn this fixed overlay into a box inside the page.
  return createPortal(
    <div className="therapy-dialog-backdrop" role="presentation" onClick={onCancel}>
      <div className="therapy-dialog" role="alertdialog" aria-modal="true" aria-labelledby="therapy-dialog-title" aria-describedby="therapy-dialog-body" onClick={(e) => e.stopPropagation()}>
        <div className={`therapy-dialog-icon ${start ? 'start' : 'stop'}`} aria-hidden="true">{start ? '▶' : '■'}</div>
        <h2 id="therapy-dialog-title">{start ? 'Start therapy?' : 'Stop therapy?'}</h2>
        <p className="therapy-dialog-device">Device <strong>{serial}</strong></p>
        <p id="therapy-dialog-body">
          {start
            ? 'The device will begin delivering pressure right away. Confirm the patient is wearing the mask and the circuit is connected.'
            : 'The patient will stop receiving therapy. Only stop if the session should end now.'}
        </p>
        <div className="therapy-dialog-actions">
          <button type="button" ref={cancelRef} className="ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className={start ? 'start' : 'stop'} onClick={onConfirm}>{start ? 'Start therapy' : 'Stop therapy'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Missing values read as "—", never as a 0 that looks like a measurement.
const dash = (v, unit = '') => (v == null || Number.isNaN(Number(v)) ? '—' : `${v}${unit}`);

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function DeviceDashboard() {
  const notify = useNotify();
  const { serial } = useParams();
  const navigate   = useNavigate();
  const { setAdminActiveSerial, setLastServerPull, setDeviceData } = useTherapy();

  useEffect(() => {
    if (serial) setAdminActiveSerial(serial);
  }, [serial, setAdminActiveSerial]);

  const [device, setDevice]           = useState(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [reportSyncing, setReportSyncing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [therapyAction, setTherapyAction] = useState(null);
  const [confirmTherapyAction, setConfirmTherapyAction] = useState(null);
  const [offlineNoticeClosedFor, setOfflineNoticeClosedFor] = useState(null);
  const [mode, setMode]               = useState(null);
  const [pressure, setPressure]       = useState(null);
  const [minPressure, setMinPressure] = useState(null);
  const [maxPressure, setMaxPressure] = useState(null);
  const [aflex, setAflex]             = useState(null);
  const [ramp, setRamp]               = useState(null);
  const [saving, setSaving]           = useState(false);
  const [toast, setToast]             = useState(null);
  const [lastPull, setLastPull]       = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const RECORDS_PER_PAGE = 10;

  // Guards against a slow response for a previous serial landing after a newer
  // one and clobbering state (and forcing another full re-render pass).
  const requestId = useRef(0);
  const animatedSerial = useRef(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [serial]);

  const applyDeviceState = (data) => {
    setMode(data.settings.therapy_mode);
    setPressure(data.settings.pressure);
    setMinPressure(data.settings.min_pressure);
    setMaxPressure(data.settings.max_pressure);
    setAflex(data.settings.aflex);
    setRamp(data.settings.ramp);
  };

  const fetchDevice = useCallback(async (silent = false, force = false) => {
    const id = ++requestId.current;
    if (!silent) setLoading(true);
    try {
      const data = await devicesAPI.getDeviceDetail(serial, { force });
      if (id !== requestId.current) return; // stale response, ignore
      setLoadError(null);
      setDevice(data);
      // Sync to TherapyContext so Therapy/Trends/Reports/MaskFit pages auto-read live data
      setDeviceData(data);
      const now = new Date();
      setLastPull(now);
      setLastServerPull(now);
      if (!silent) applyDeviceState(data);
      return data;
    } catch (e) {
      if (id !== requestId.current) return;
      // A first load has nothing to show, so the page explains the failure; a
      // refresh keeps the data already on screen and reports it instead.
      if (!silent) setLoadError(e);
      else notify.fromError(e, { action: 'refresh the device data', subject: serial });
    }
    finally { if (!silent && id === requestId.current) setLoading(false); }
  }, [serial, setLastServerPull, setDeviceData, notify]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDevice(false, true);
    setRefreshing(false);
  };

  // Report sync is asynchronous; syncReports waits until the backend says it is done.
  const handleReportSync = async () => {
    setReportSyncing(true);
    try {
      const reportsBefore = device?.reports?.length ?? 0;
      const { stillRunning } = await devicesAPI.syncReports(serial);

      const data = await fetchDevice(true, true);
      const added = Math.max(0, (data?.reports?.length ?? reportsBefore) - reportsBefore);
      if (stillRunning) {
        notify.info('Report sync is still running', { message: 'It continues in the background. Refresh later to see new sessions.' });
      } else {
        notify.success('Report sync finished', {
          message: added ? `${added} new session report${added === 1 ? '' : 's'}.` : 'No new sessions. The device was already up to date.',
        });
      }
    } catch (e) {
      notify.fromError(e, { action: 'sync reports', subject: serial });
    } finally {
      setReportSyncing(false);
    }
  };

  // Therapy commands are asynchronous: a successful POST only means the
  // command was queued. Keep the button in an applying state until the device
  // appears in the expected RUNNING/STOPPED state.
  const handleTherapyAction = async (action) => {
    const expected = action === 'start' ? 'RUNNING' : 'STOPPED';
    setTherapyAction(action);
    try {
      await devicesAPI.setTherapy(serial, action);
      notify.info(`${action === 'start' ? 'Starting' : 'Stopping'} therapy`, {
        message: 'Waiting for the device to confirm the change…',
      });
      await devicesAPI.pollTherapyStatus(serial, expected);
      await fetchDevice(true, true);
      notify.success(`Therapy ${action === 'start' ? 'started' : 'stopped'}`);
    } catch (e) {
      if (e?.status === 409) {
        // 409 is an idempotent outcome here: the device is already where the
        // user asked it to be, so refresh and explain rather than showing an
        // alarming server error.
        await fetchDevice(true, true).catch(() => {});
        notify.warning(`Therapy already ${action === 'start' ? 'running' : 'stopped'}`, {
          message: 'No change was needed.',
        });
      } else if (e?.code === 'THERAPY_STATUS_TIMEOUT') {
        notify.warning('Therapy command is still applying', {
          message: 'The device has not confirmed the change yet. Refresh shortly to see its state.',
        });
      } else {
        notify.fromError(e, { action: `${action} therapy`, subject: serial });
      }
    } finally {
      setTherapyAction(null);
    }
  };

  const requestTherapyAction = (action) => {
    if (!isOnline || therapyAction) return;
    setConfirmTherapyAction(action);
  };

  useEffect(() => {
    // Initial load only (no background polling). The device list is not used on
    // this page — fetching it here cost an extra full /devices round-trip.
    fetchDevice();
  }, [fetchDevice]);

  useEffect(() => {
    // Entrance animation runs once per device, not on every data refresh.
    // Re-animating ~10 cards (opacity + scale + transform) on each pull was
    // forcing a full layout/paint cycle every time data arrived.
    if (loading || !device || animatedSerial.current === serial) return undefined;
    animatedSerial.current = serial;
    let cancelled = false;
    // gsap is loaded on demand so it stays out of this route's chunk.
    import('gsap').then(({ default: gsap }) => {
      if (cancelled) return;
      gsap.fromTo('.dashboard-metrics-grid > div',
        { opacity: 0, scale: 0.95, y: 25 },
        { opacity: 1, scale: 1, y: 0, duration: 0.5, stagger: 0.08, ease: 'back.out(1.2)' }
      );
      gsap.fromTo('.dashboard-main-content > div:not(.dashboard-metrics-grid)',
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: 'power2.out', delay: 0.2 }
      );
    });
    return () => { cancelled = true; };
  }, [loading, device, serial]);

  const dirty = useMemo(() => {
    if (!device) return false;
    const s = device.settings;
    return mode !== s.therapy_mode || pressure !== s.pressure || minPressure !== s.min_pressure ||
      maxPressure !== s.max_pressure || aflex !== s.aflex || ramp !== s.ramp;
  }, [device, mode, pressure, minPressure, maxPressure, aflex, ramp]);

  const sortedSessions = useMemo(() => {
    const rows = [...(device?.sessions || []), ...(device?.settings_history || [])];
    return rows.sort((a, b) => {
      const getMs = (item) => {
        if (item.timestamp) return item.timestamp;
        const rawTs = item.raw?.server_timestamp || item.raw?.serverTimestamp;
        if (rawTs) return new Date(rawTs).getTime();
        return 0;
      };
      return getMs(b) - getMs(a); // Descending order: Newest dates on top!
    });
  }, [device?.sessions, device?.settings_history]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(sortedSessions.length / RECORDS_PER_PAGE));
  }, [sortedSessions.length]);

  const paginatedSessions = useMemo(() => {
    const start = (currentPage - 1) * RECORDS_PER_PAGE;
    return sortedSessions.slice(start, start + RECORDS_PER_PAGE);
  }, [sortedSessions, currentPage]);

  // Stable identity for the 7-day charts so the memoized MiniBarChart is not
  // re-rendered (and re-laid-out) on every unrelated state change.
  const trend = useMemo(() => {
    const all = device?.sessions || [];
    return {
      sessions: all.slice(-7),
      maxAHI: Math.max(...all.map(s => s.ahi), 5),
      maxUsageHrs: Math.max(...all.map(s => s.usage_hours), 8),
      maxLeak: Math.max(...all.map(s => s.mask_leak), 24),
    };
  }, [device?.sessions]);

  const resetDraft = () => { if (device) applyDeviceState(device); };

  const saveSettings = async () => {
    if (settingsLocked) return;
    setSaving(true);
    showToast('Pushing settings...', 'info');
    try {
      const payload = {
        therapy_mode: mode, // CPAP or AUTO CPAP
        pressure,
        min_pressure: minPressure,
        max_pressure: maxPressure,
        aflex,
        ramp,
      };
      
      const res = await devicesAPI.updateDeviceSettings(serial, payload);
      // The draft becomes the device's settings only once the device has them.
      const confirmed = () => setDevice((d) => (d ? {
        ...d,
        settings: { ...d.settings, therapy_mode: mode, pressure, min_pressure: minPressure, max_pressure: maxPressure, aflex, ramp },
      } : d));

      if (res && res.status === 'NO_CHANGE') {
        confirmed();
        showToast('Nothing to send: the device already has these values.', 'warning');
      } else if (res && res.commandId) {
        showToast('Sent. Waiting for the device to confirm…', 'info');
        const pollRes = await devicesAPI.pollCommandStatus(serial, res.commandId, { timeoutMs: 20000 });
        if (pollRes.status === 'ACKED') {
          confirmed();
          showToast('Settings applied — the device confirmed them ✓', 'success');
        } else {
          const described = describeCommandStatus(pollRes.status, { subject: serial })
            || { title: 'The device did not apply the settings', message: `Status: ${pollRes.status}`, retryable: true };
          notify.fromDescription(described);
          showToast(described.title, 'error');
          applyDeviceState(device); // back to what the device actually holds
          return;
        }
      } else {
        showToast('Sent to the server. The device has not confirmed it yet.', 'info');
      }
    } catch (e) {
      // The inline toast is easy to miss and disappears; the frame keeps the
      // reason on screen until the user has dealt with it.
      notify.fromError(e, { action: 'save these settings', subject: serial });
      showToast(describeError(e, { action: 'save these settings' }).title, 'error');
    } finally {
      setSaving(false);
    }
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
    <div className="dashboard-main-content" style={{ width: '100%', padding: '20px 24px' }}>
      <DeviceDashboardSkeleton serial={serial} />
    </div>
  );
  if (!device) {
    const problem = loadError
      ? describeError(loadError, { action: 'load this device', subject: serial })
      : { title: 'Device not found', message: `The server has no record of ${serial}.`, retryable: false };
    return (
      <div className="admin-detail-page">
        <div className="load-error" role="alert">
          <strong>{problem.title}</strong>
          <p>{problem.message}</p>
          {problem.detail && <code>{problem.detail}</code>}
          <div className="load-error-actions">
            {problem.retryable && <button className="admin-page-btn primary" onClick={() => fetchDevice(false, true)}>Try again</button>}
            <button className="admin-page-btn" onClick={() => navigate('/devices')}>← Back to Devices</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Computed values ───────────────────────────────────────────────────────
  const ld          = device.live_data;
  const hoursInt    = Math.floor(ld.usage_hours);
  const minsInt     = Math.round((ld.usage_hours - hoursInt) * 60);
  const usagePct    = Math.min(Math.round((ld.usage_hours / 8) * 100), 100);
  const isOnline    = device.device_online;
  const isReadOnly  = device.readOnly !== false;
  const therapyStatus = String(device.therapy_status || '').toUpperCase();
  const isTherapyRunning = therapyStatus === 'RUNNING';
  // The device refuses setting changes mid-therapy (409), so the UI does not offer them.
  const settingsLocked = isTherapyRunning || Boolean(therapyAction);


  return (
    <div className="dashboard-layout-container" style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Main Content ──────────────────────────────────────────────────────── */}
      <div className="dashboard-main-content" style={{ width: '100%', maxWidth: '100%', padding: '20px 24px' }}>

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', top: 16, right: 24, zIndex: 9999,
            background: toast.type === 'success' ? '#0f766e' : toast.type === 'warning' ? '#b45309' : toast.type === 'info' ? '#1d4ed8' : '#9f1239',
            color: '#fff', padding: '12px 20px', borderRadius: 12, fontWeight: 700,
            fontSize: 13, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', animation: 'slideDown 0.3s ease',
            display: 'flex', alignItems: 'center', gap: 10, maxWidth: 340,
          }}>
            <span>{toast.type === 'success' ? '✓' : toast.type === 'info' ? 'i' : '⚠'}</span> {toast.msg}
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
                <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, fontFamily: 'monospace', color: 'var(--accent)', letterSpacing: '-0.5px' }}>
                  {device.serial}
                </h1>
                {device.model && device.model !== device.serial && (
                  <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{device.model}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
                {device.device_type && <span style={{ fontSize: 10, background: '#e8f4fd', color: 'var(--accent)', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>{device.device_type}</span>}
                <span style={{ fontSize: 10, background: '#f0f4ff', color: '#6366f1', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>FW: {device.firmware}</span>
              </div>
            </div>
          </div>

          <div className="dashboard-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--muted)' }}>
              <div style={{ fontWeight: 600 }}>Page refreshed</div>
              <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 12 }}>{formatPull(lastPull)}</div>
              {device.sync_state?.lastSynced && (
                <div style={{ marginTop: 2 }}>Reports to {formatSyncStamp(device.sync_state.lastSynced)}</div>
              )}
            </div>
            <button onClick={handleReportSync} disabled={reportSyncing || !isOnline}
              title={isOnline ? 'Pull new therapy reports from the device' : 'Device is offline'}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 9, fontSize: 12, fontWeight: 700, color: 'var(--muted)', cursor: 'pointer', opacity: reportSyncing || !isOnline ? 0.6 : 1 }}>
              {reportSyncing ? 'Syncing…' : 'Sync reports'}
            </button>
            <button onClick={handleRefresh} disabled={refreshing}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 9, fontSize: 12, fontWeight: 700, color: 'var(--muted)', cursor: 'pointer', opacity: refreshing ? 0.6 : 1 }}>
              <RefreshIcon fontSize="small" style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}/>
              Refresh
            </button>
            <span style={{ padding: '7px 12px', borderRadius: 20, background: isTherapyRunning ? '#dcfce7' : '#f1f5f9', color: isTherapyRunning ? '#15803d' : '#64748b', fontSize: 12, fontWeight: 800 }}>
              Therapy: {therapyStatus || 'UNKNOWN'}
            </span>
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

        {/* ── Therapy control ─────────────────────────────────────────────────── */}
        <TherapyControl status={therapyStatus} applying={therapyAction} online={isOnline} onRequest={requestTherapyAction} />

        {confirmTherapyAction && (
          <TherapyConfirmDialog
            action={confirmTherapyAction}
            serial={serial}
            onCancel={() => setConfirmTherapyAction(null)}
            onConfirm={() => { const action = confirmTherapyAction; setConfirmTherapyAction(null); handleTherapyAction(action); }}
          />
        )}

        {!loading && device && !isOnline && therapyStatus !== 'RUNNING' && offlineNoticeClosedFor !== serial && createPortal((
          <div role="presentation" onClick={() => setOfflineNoticeClosedFor(serial)} style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(15, 23, 42, 0.48)' }}>
            <div role="dialog" aria-modal="true" aria-labelledby="offline-therapy-title" onClick={(event) => event.stopPropagation()} style={{ width: 'min(460px, 100%)', padding: 28, borderRadius: 18, background: '#fff', boxShadow: '0 24px 70px rgba(15,23,42,0.28)' }}>
              <div style={{ width: 52, height: 52, display: 'grid', placeItems: 'center', borderRadius: 16, background: '#fff7ed', color: '#c2410c', fontSize: 27, marginBottom: 14 }}>!</div>
              <h2 id="offline-therapy-title" style={{ margin: 0, color: '#163257', fontSize: 21, fontWeight: 900 }}>Device is offline</h2>
              <p style={{ margin: '10px 0 22px', color: '#64748b', fontSize: 14, lineHeight: 1.55 }}>
                This device is not connected to the server, so therapy and settings commands cannot reach it. They become available again when the device reconnects.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" onClick={() => setOfflineNoticeClosedFor(serial)} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 800, cursor: 'pointer' }}>Close</button>
                <button type="button" onClick={() => { setOfflineNoticeClosedFor(serial); handleRefresh(); }} style={{ padding: '10px 18px', borderRadius: 10, border: 0, background: '#2563eb', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Refresh device</button>
              </div>
            </div>
          </div>
        ), document.body)}

        {/* ── 4 Metric Cards ─────────────────────────────────────────────────── */}
        {device.has_session_data ? (
          <>
        <div className="dashboard-metrics-grid" style={{ marginBottom: 18 }}>

          {/* Usage */}
          <div style={card}>
            <div style={cardEyebrow}>Usage</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <div>
                <div style={{ fontSize: 30, fontWeight: 900, color: '#163257', lineHeight: 1 }}>{ld.usage_hours == null ? '—' : `${hoursInt}h ${minsInt}m`}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, fontWeight: 600 }}>Last night usage</div>
                <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, marginTop: 2 }}>{ld.usage_hours == null ? 'Not reported' : `${usagePct}% of goal`}</div>
              </div>
              {ld.usage_hours != null && <RingProgress pct={usagePct} size={68} stroke={6} color="var(--accent)"/>}
            </div>
          </div>

          {/* AHI */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={cardEyebrow}>AHI</div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: ld.ahi == null ? '#f1f5f9' : ld.ahi <= 5 ? '#dcfce7' : '#fef3c7', color: ld.ahi == null ? '#64748b' : ld.ahi <= 5 ? '#15803d' : '#92400e' }}>
                {ld.ahi == null ? 'No data' : ld.ahi <= 5 ? 'Normal' : 'Elevated'}
              </span>
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, color: ld.ahi == null ? '#94a3b8' : ld.ahi <= 5 ? '#15803d' : '#b45309', lineHeight: 1, marginTop: 8 }}>{dash(ld.ahi)}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, fontWeight: 600 }}>Events per hour · Target ≤ 5.0</div>
          </div>

          {/* Mask Seal */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={cardEyebrow}>Mask Seal</div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: ld.mask_leak == null ? '#f1f5f9' : ld.mask_leak <= 24 ? '#dcfce7' : '#fee2e2', color: ld.mask_leak == null ? '#64748b' : ld.mask_leak <= 24 ? '#15803d' : '#b91c1c' }}>
                {ld.mask_leak == null ? 'No data' : ld.mask_leak <= 24 ? 'Good' : 'High Leak'}
              </span>
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#163257', lineHeight: 1, marginTop: 8 }}>
              {dash(ld.mask_leak)} {ld.mask_leak != null && <span style={{ fontSize: 16, color: '#64748b' }}>L/min</span>}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, fontWeight: 600 }}>Leak Rate · Target ≤ 24 L/min</div>
          </div>

          {/* Pressure */}
          <div style={card}>
            <div style={cardEyebrow}>Pressure · latest session</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#163257', lineHeight: 1, marginTop: 8 }}>
              {dash(ld.pressure_95)} {ld.pressure_95 != null && <span style={{ fontSize: 16, color: '#64748b' }}>cmH₂O</span>}
            </div>
            {device.settings.max_pressure != null && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, fontWeight: 600 }}>Max set: {device.settings.max_pressure} cmH₂O</div>}
            <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, transition: 'width 0.5s', width: `${device.settings.max_pressure && ld.pressure_95 != null ? Math.min((ld.pressure_95 / device.settings.max_pressure) * 100, 100) : 0}%`, background: 'var(--brand-gradient)' }}/>
            </div>
          </div>
        </div>
          </>
        ) : (
          <div className="no-session-data" role="status">
            <strong>No therapy sessions on the server yet.</strong>
            <span>Usage, AHI, leak and pressure appear here once the device's session reports are synced. Use <b>Sync reports</b> above to pull them.</span>
          </div>
        )}

        {/* ── Therapy Settings Panel ──────────────────────────────────────────── */}
        <div style={{ ...sectionCard, marginBottom: 16 }}>
          <div style={sectionLabel}>Therapy Settings</div>
          {isReadOnly && (
            <div style={{
              marginBottom: 14,
              padding: '10px 12px',
              borderRadius: 10,
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1d4ed8',
              fontSize: 12,
              fontWeight: 600,
            }}>
              Read-only staging API: controls are shown for reference, but pushes are disabled.
            </div>
          )}

          {settingsLocked && (
            <div className="therapy-lock-note" role="status">
              <strong>Settings are locked.</strong> {therapyAction ? 'A therapy command is being applied.' : 'Stop therapy to change pressure, ramp or mode.'}
            </div>
          )}

          <fieldset className="settings-fieldset" disabled={settingsLocked}>
          {/* Mode Toggle */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 22, background: 'var(--panel-strong)', borderRadius: 12, padding: 6, border: '1px solid var(--line)' }}>
            {['CPAP', 'AUTO CPAP'].map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                  border: 'none', cursor: 'pointer', transition: 'all 0.25s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  background: mode === m ? 'var(--brand-gradient)' : 'transparent',
                  color: mode === m ? '#fff' : 'var(--muted)',
                  boxShadow: mode === m ? '0 2px 12px rgba(13,125,230,0.25)' : 'none',
                }}>
                {m === 'CPAP' ? <CpapIcon/> : <AutoIcon/>} {m}
              </button>
            ))}
          </div>

          {(() => {
            const maxLimit = 20;
            const RAMP_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45];
            const stepRampDown = (val) => {
              const idx = RAMP_STEPS.indexOf(val);
              if (idx <= 0) return RAMP_STEPS[0];
              return RAMP_STEPS[idx - 1];
            };
            const stepRampUp = (val) => {
              const idx = RAMP_STEPS.indexOf(val);
              if (idx === -1 || idx >= RAMP_STEPS.length - 1) return RAMP_STEPS[RAMP_STEPS.length - 1];
              return RAMP_STEPS[idx + 1];
            };
            const formatRampDisplay = (val) => {
              if (val === 0) return 'Off';
              if (val === 30) return '30 min (Auto)';
              return `${val} min`;
            };

            const s0 = device.settings;
            const reported = mode === 'CPAP'
              ? s0.pressure != null && s0.ramp != null
              : mode === 'AUTO CPAP' && s0.min_pressure != null && s0.max_pressure != null && s0.aflex != null && s0.ramp != null;
            if (!reported) {
              return (
                <div className="therapy-lock-note" role="status">
                  {mode
                    ? <><strong>Not reported by the device.</strong> It has not sent its {mode} settings, so they can't be shown or changed here.</>
                    : <><strong>Mode not reported.</strong> The device has not said which therapy mode it is in. Choose a mode above to see its settings.</>}
                </div>
              );
            }

            return mode === 'CPAP' ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={fieldLabel}>Fixed Pressure</div>
                  <span style={modeBadge}>Fixed Mode (Range: 4–{maxLimit} cmH₂O)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button aria-label="Decrease pressure" onClick={() => setPressure(v => Math.max(4, +(v - 0.1).toFixed(1)))} style={stepBtn}><MinusIcon/></button>
                    <div style={{ textAlign: 'center', minWidth: 110 }}>
                      <span style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent)' }}>{pressure.toFixed(1)}</span>
                      <span style={{ fontSize: 14, color: '#64748b', marginLeft: 4 }}>cmH₂O</span>
                      {device.settings.pressure !== pressure && <div style={{ ...changedTag, display: 'block', margin: '2px auto 0' }}>was {device.settings.pressure.toFixed(1)}</div>}
                    </div>
                    <button aria-label="Increase pressure" onClick={() => setPressure(v => Math.min(maxLimit, +(v + 0.1).toFixed(1)))} style={stepBtn}><PlusIcon/></button>
                  </div>
                  <div style={{ flex: '1 1 200px', minWidth: 150 }}>
                    <StyledSlider value={Math.min(pressure, maxLimit)} min={4} max={maxLimit} step={0.1} onChange={setPressure} label="Pressure"/>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 14, borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
                  <span style={fieldLabel}>Ramp Time</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button aria-label="Decrease ramp time" onClick={() => setRamp(v => stepRampDown(v))} style={stepBtn}><MinusIcon/></button>
                    <span style={{ fontWeight: 800, fontSize: 16, color: '#163257', minWidth: 110, textAlign: 'center' }}>{formatRampDisplay(ramp)}</span>
                    <button aria-label="Increase ramp time" onClick={() => setRamp(v => stepRampUp(v))} style={stepBtn}><PlusIcon/></button>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Range: Off (0) to 45 min · Auto (30 min)</span>
                  {device.settings.ramp !== ramp && <span style={changedTag}>was {device.settings.ramp}</span>}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={fieldLabel}>{mode === 'BiPAP' ? 'BiPAP Settings' : 'Auto CPAP Settings'}</div>
                  <span style={{ ...modeBadge, background: '#e0f2fe', color: '#0369a1' }}>Auto Adjusting (Range: 4–{maxLimit} cmH₂O)</span>
                </div>
                <div className="dashboard-two-col" style={{ gap: 20, marginBottom: 16 }}>
                  {[
                    { label: 'Min Pressure', val: Math.min(minPressure, maxPressure), changed: device.settings.min_pressure !== minPressure, was: device.settings.min_pressure, dec: () => setMinPressure(v => Math.max(4, +(v - 0.1).toFixed(1))), inc: () => setMinPressure(v => Math.min(maxPressure, +(v + 0.1).toFixed(1))), sliderMax: maxPressure, onChange: setMinPressure },
                    { label: 'Max Pressure', val: Math.min(maxPressure, maxLimit), changed: device.settings.max_pressure !== maxPressure, was: device.settings.max_pressure, dec: () => setMaxPressure(v => Math.max(minPressure, +(v - 0.1).toFixed(1))), inc: () => setMaxPressure(v => Math.min(maxLimit, +(v + 0.1).toFixed(1))), sliderMax: maxLimit, onChange: setMaxPressure },
                  ].map(({ label, val, changed, was, dec, inc, sliderMax, onChange }) => (
                    <div key={label}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>{label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <button aria-label={`Decrease ${label}`} onClick={dec} style={stepBtn}><MinusIcon/></button>
                        <span style={{ fontSize: 26, fontWeight: 900, color: '#163257' }}>{val.toFixed(1)}</span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>cmH₂O</span>
                        <button aria-label={`Increase ${label}`} onClick={inc} style={stepBtn}><PlusIcon/></button>
                        {changed && <span style={changedTag}>was {was.toFixed(1)}</span>}
                      </div>
                      <StyledSlider value={val} min={4} max={sliderMax} step={0.1} onChange={onChange} label={label}/>
                    </div>
                  ))}
                </div>
                <div className="dashboard-two-col" style={{ gap: 20, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>Aflex (EPR)</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {['Off', '1', '2', '3'].map((lbl, idx) => (
                        <button key={lbl} onClick={() => setAflex(idx)} style={{ flex: 1, padding: '10px 4px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: '1.5px solid', cursor: 'pointer', transition: 'all 0.2s', borderColor: aflex === idx ? 'transparent' : 'var(--line)', background: aflex === idx ? 'var(--brand-gradient)' : 'var(--panel)', color: aflex === idx ? '#fff' : 'var(--muted)' }}>{lbl}</button>
                      ))}
                    </div>
                    {device.settings.aflex !== aflex && <div style={{ ...changedTag, marginTop: 4 }}>was: {device.settings.aflex}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>Ramp Time</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button aria-label="Decrease ramp time" onClick={() => setRamp(v => stepRampDown(v))} style={stepBtn}><MinusIcon/></button>
                      <span style={{ fontWeight: 800, fontSize: 15, color: '#163257', minWidth: 100, textAlign: 'center' }}>{formatRampDisplay(ramp)}</span>
                      <button aria-label="Increase ramp time" onClick={() => setRamp(v => stepRampUp(v))} style={stepBtn}><PlusIcon/></button>
                      {device.settings.ramp !== ramp && <span style={changedTag}>was {device.settings.ramp}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          </fieldset>

          {/* Save / Discard bar */}
          <div className="dashboard-save-bar" style={{ display: 'flex', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <button onClick={resetDraft} disabled={isReadOnly || settingsLocked || !dirty || saving}
              style={{ padding: '11px 22px', borderRadius: 10, fontWeight: 700, fontSize: 13, background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--muted)', cursor: dirty ? 'pointer' : 'not-allowed', opacity: dirty ? 1 : 0.5 }}>
              Discard Changes
            </button>
            <button onClick={saveSettings} disabled={isReadOnly || settingsLocked || !dirty || saving}
              style={{ flex: 1, padding: '11px 22px', borderRadius: 10, fontWeight: 800, fontSize: 14, background: dirty ? 'var(--brand-gradient)' : '#e2e8f0', color: dirty ? '#fff' : '#94a3b8', border: 'none', cursor: dirty ? 'pointer' : 'not-allowed', boxShadow: dirty ? '0 4px 16px rgba(0,71,204,0.3)' : 'none', transition: 'all 0.25s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {isReadOnly
                ? <><SaveIcon fontSize="small"/> Read-only</>
                : saving
                  ? <><span style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }}/> Applying…</>
                  : isOnline
                    ? <><SendIcon fontSize="small"/> Push Settings to Device</>
                    : <><SaveIcon fontSize="small"/> Save &amp; Queue for Device</>
              }
            </button>
          </div>
        </div>

        {/* ── 7-Day Trend Charts ──────────────────────────────────────────────── */}
        {device.has_session_data && (
        <div style={{ ...sectionCard, marginBottom: 16 }}>
          <div style={sectionLabel}>7-Day Therapy Trends</div>
          <div className="dashboard-three-col">
            {[
              { label: 'AHI (events/hr)',  key: 'ahi',         maxVal: trend.maxAHI,      goodFn: v => v <= 5,  goodColor: '#1d9e75', badColor: '#f59e0b', target: 'Target ≤ 5.0' },
              { label: 'Usage Hours',      key: 'usage_hours', maxVal: trend.maxUsageHrs, goodFn: v => v >= 4,  goodColor: '#0ea5e9', badColor: '#e24b4a', target: 'Target ≥ 4h'  },
              { label: 'Mask Leak (L/min)',key: 'mask_leak',   maxVal: trend.maxLeak,     goodFn: v => v <= 24, goodColor: '#60a5fa', badColor: '#e24b4a', target: 'Target ≤ 24'  },
            ].map(({ label, key, maxVal, goodFn, goodColor, badColor, target }) => (
              <div key={key} style={{ background: 'var(--panel-strong)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>{label}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{target}</span>
                </div>
                <MiniBarChart sessions={trend.sessions} valueKey={key} maxVal={maxVal} goodFn={goodFn} goodColor={goodColor} badColor={badColor}/>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* ── Device Info ───────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div style={sectionCard}>
            <div style={sectionLabel}>Device Info</div>
            {[
              ['Serial Number', device.serial, true],
              ['Model', device.model || '—', false],
              ['Device Type', device.device_type || '—', false],
              ['Firmware', device.firmware, false],
              ['Last Session', device.sessions?.slice(-1)[0]?.date ?? '—', false],
              ['Compliance Rate', device.has_session_data ? `${ld.compliance_pct}%` : '—', false],
            ].map(([k, v, mono]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{k}</span>
                <span style={{ fontWeight: 800, color: 'var(--text)', fontFamily: mono ? 'monospace' : 'inherit' }}>{v}</span>
              </div>
            ))}
          </div>

        </div>

        {/* ── Session Log Table ─────────────────────────────────────────────────── */}
        <div style={sectionCard}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={sectionLabel}>Session Log</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
              Page {currentPage} of {totalPages} ({sortedSessions.length} total records)
            </div>
          </div>
          <div className="admin-table-wrap" style={{ margin: 0, borderRadius: '10px 10px 0 0', border: '1px solid var(--line)' }}>
            <table className="admin-table">
              <thead>
                <tr>{['Date', 'Usage', 'AHI', 'Mask Leak', '95th Pressure', 'Compliance'].map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {paginatedSessions.map((s, i) => {
                  const isSettings = s.type === 'SETTINGS_UPDATE';
                  const compliant = s.usage_hours >= 4;
                  const globalIdx = (currentPage - 1) * RECORDS_PER_PAGE + i;
                  const isExpanded = expandedRow === globalIdx;
                  const rawPayload = s.raw?.decoded_payload || s.raw;
                  const rawBytes = rawPayload?.raw;

                  return (
                    <React.Fragment key={globalIdx}>
                      <tr 
                        onClick={() => setExpandedRow(isExpanded ? null : globalIdx)}
                        style={{ cursor: 'pointer', transition: 'background 0.2s' }}
                        className={isExpanded ? 'admin-table-row-selected' : ''}
                      >
                        <td><strong>{s.date}</strong></td>
                        <td>
                          {isSettings ? (
                            <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 11 }}>
                              ⚙ Settings
                            </span>
                          ) : (
                            dash(s.usage_hours, 'h')
                          )}
                        </td>
                        <td>
                          <span className="admin-badge" style={{
                            background: isSettings ? '#f0f4ff' : s.ahi == null ? '#f1f5f9' : (s.ahi <= 5 ? '#dcfce7' : '#fef3c7'),
                            color: isSettings ? '#4338ca' : s.ahi == null ? '#64748b' : (s.ahi <= 5 ? '#15803d' : '#92400e'),
                          }}>
                            {isSettings ? (s.mode || '—') : dash(s.ahi)}
                          </span>
                        </td>
                        <td>
                          {isSettings ? (
                            s.mode === 'CPAP' ? `Set: ${dash(s.pressure, ' cmH₂O')}` : s.mode ? `Min: ${dash(s.min_pressure)} / Max: ${dash(s.max_pressure)}` : '—'
                          ) : (
                            dash(s.mask_leak, ' L/min')
                          )}
                        </td>
                        <td>
                          {isSettings ? (
                            `Ramp: ${s.ramp == null ? '—' : s.ramp === 0 ? 'Off' : s.ramp === 30 ? '30m Auto' : `${s.ramp}m`}`
                          ) : (
                            dash(s.pressure_95, ' cmH₂O')
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            {isSettings ? (
                              <span className="admin-status-pill" style={{ background: '#dbeafe', color: '#1e40af' }}>
                                <span className="admin-status-dot" style={{ background: '#2563eb' }}/>
                                Settings frame
                              </span>
                            ) : (
                              s.usage_hours == null ? (
                                <span className="admin-status-pill" style={{ background: '#f1f5f9', color: '#64748b' }}>No usage data</span>
                              ) : (
                              <span className="admin-status-pill" style={{ background: compliant ? '#dcfce7' : '#fee2e2', color: compliant ? '#15803d' : '#b91c1c' }}>
                                <span className="admin-status-dot" style={{ background: compliant ? '#16a34a' : '#dc2626' }}/>
                                {compliant ? 'Compliant' : 'Non-compliant'}
                              </span>
                              )
                            )}
                            <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 8 }}>
                              {isExpanded ? '▲ Hide' : '▼ Inspect'}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ background: 'var(--panel-deep, #f8fafc)' }}>
                          <td colSpan={6} style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                              <div>
                                <strong style={{ color: 'var(--text-strong)' }}>Packet ID:</strong>{' '}
                                <code style={{ background: 'rgba(0,0,0,0.05)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                                  {s.raw?.id || '—'}
                                </code>
                              </div>
                              <div>
                                <strong style={{ color: 'var(--text-strong)' }}>Server Ingestion Time:</strong>{' '}
                                <span style={{ color: 'var(--muted)' }}>{s.raw?.server_timestamp || '—'}</span>
                              </div>
                              <div>
                                <strong style={{ color: 'var(--text-strong)' }}>{isSettings ? 'Decoded Payload JSON:' : 'Raw Payload Bytes:'}</strong>
                                <div style={{ 
                                  background: '#0f172a', 
                                  color: isSettings ? '#38bdf8' : '#e2e8f0', 
                                  padding: '10px 14px', 
                                  borderRadius: '8px', 
                                  fontFamily: 'monospace', 
                                  fontSize: '11px', 
                                  marginTop: '4px',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-all',
                                  lineHeight: '1.4'
                                }}>
                                  {isSettings
                                    ? JSON.stringify(rawPayload, null, 2)
                                    : (rawBytes ? JSON.stringify(rawBytes) : JSON.stringify(rawPayload, null, 2))}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination Controls ───────────────────────────────────────────── */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justify: 'space-between',
            padding: '12px 16px',
            border: '1px solid var(--line)',
            borderTop: 'none',
            background: 'var(--panel-strong)',
            borderRadius: '0 0 10px 10px',
            fontSize: '12px',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div style={{ color: 'var(--muted)', fontWeight: 600 }}>
              Showing {sortedSessions.length > 0 ? (currentPage - 1) * RECORDS_PER_PAGE + 1 : 0}–{Math.min(currentPage * RECORDS_PER_PAGE, sortedSessions.length)} of {sortedSessions.length} records
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '6px 12px',
                  borderRadius: '7px',
                  border: '1px solid var(--line)',
                  background: 'var(--panel)',
                  color: currentPage === 1 ? '#cbd5e1' : 'var(--text)',
                  fontWeight: 700,
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  transition: 'all 0.2s'
                }}
              >
                ← Previous
              </button>
              
              <div style={{ display: 'flex', gap: 4 }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: page === currentPage ? 'none' : '1px solid var(--line)',
                      background: page === currentPage ? 'var(--brand-gradient)' : 'var(--panel)',
                      color: page === currentPage ? '#ffffff' : 'var(--text)',
                      fontWeight: 800,
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center'
                    }}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '6px 12px',
                  borderRadius: '7px',
                  border: '1px solid var(--line)',
                  background: 'var(--panel)',
                  color: currentPage === totalPages ? '#cbd5e1' : 'var(--text)',
                  fontWeight: 700,
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  transition: 'all 0.2s'
                }}
              >
                Next →
              </button>
            </div>
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
const modeBadge    = { fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: '#e8f4fd', color: 'var(--accent)' };
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
