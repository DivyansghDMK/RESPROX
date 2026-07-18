// src/pages/DeviceList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { devicesAPI } from '../services/respireeApi';
import { useAuth } from '../context/AuthContext';
import { useTherapy } from '../context/TherapyContext';
import gsap from 'gsap';

// Material UI Icons
import DevicesIcon from '@mui/icons-material/Devices';
import BoltIcon from '@mui/icons-material/Bolt';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

const STATUS_COLOR = {
  online:  { bg: '#e6f9f0', text: '#0f6e56', dot: '#1d9e75' },
  offline: { bg: '#f1efe8', text: '#5f5e5a', dot: '#888780' }
};

function formatAdminLabel(username) {
  if (!username) return 'Admin';
  const base = username.includes('@') ? username.split('@')[0] : username;
  return base
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// ── Main DeviceList Component ──────────────────────────────────────────────────
export default function DeviceList() {
  const navigate = useNavigate();
  const { username } = useAuth();
  const { lastServerPull, setLastServerPull } = useTherapy();
  const [devices, setDevices] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const [quickSerial, setQuickSerial] = useState('');

  // Clear any persisted device serial so we don't auto-navigate on load
  useEffect(() => {
    localStorage.removeItem('adminActiveSerial');
  }, []);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const data = await devicesAPI.getDevices(search);
      setDevices(data);
      setLastServerPull(new Date());
    } catch (e) {
      console.error("Error loading devices list:", e);
    } finally {
      setLoading(false);
    }
  }, [search, setLastServerPull]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    if (!loading) {
      // Staggered entry animation for cards and table rows
      gsap.fromTo('.admin-stat-card',
        { opacity: 0, y: 25, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.08, ease: 'back.out(1.2)' }
      );
      gsap.fromTo('.admin-table-row, .mobile-device-card',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, ease: 'power2.out', delay: 0.2 }
      );
    }
  }, [loading]);

  // Handle instant lookup — navigate directly to the device dashboard page
  const handleQuickSubmit = (e) => {
    e.preventDefault();
    const serial = quickSerial.trim().toUpperCase();
    if (!serial) return;
    navigate(`/device/${serial}`);
  };

  // Handle Enter key on general search input to go directly to matching device
  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter' && search.trim()) {
      const match = devices.find(
        d => d.serial.toLowerCase() === search.trim().toLowerCase()
      );
      if (match) {
        navigate(`/device/${match.serial}`);
      }
    }
  };

  // Compute stats on the fly
  const totalCount = devices.length;
  const onlineCount = devices.filter(d => d.status === 'online').length;
  const criticalCount = devices.filter(d => d.ahi > 5.0).length;
  const complianceAvg = totalCount ? Math.round(devices.reduce((acc, d) => acc + d.compliance_pct, 0) / totalCount) : 0;

  const filteredDevices = devices.filter(d => {
    const matchesSearch = d.serial.toLowerCase().includes(search.toLowerCase().trim());
    if (!matchesSearch) return false;
    if (statusFilter === 'online') return d.status === 'online';
    if (statusFilter === 'offline') return d.status === 'offline';
    return true;
  });

  const adminLabel = formatAdminLabel(username);
  function formatLastPulled(date) {
    if (!date) return 'Never';
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 10) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="admin-patients-page">
      {/* Slide-down animation keyframe */}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Hello Admin Welcome Banner ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(13,125,230,0.07) 0%, rgba(99,102,241,0.07) 100%)',
        border: '1px solid rgba(13,125,230,0.12)',
        borderRadius: 18,
        padding: '18px 24px',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 12px rgba(13,125,230,0.06)'
      }}>
        <div>
          <div style={{ fontSize: 13, color: '#6366f1', fontWeight: 700, letterSpacing: '0.5px', marginBottom: 4 }}>ADMIN PORTAL · DeckLink</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#163257', lineHeight: 1.2 }}>
            Hello, {adminLabel}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Manage and monitor all registered CVT30 CPAP C-Series devices below
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8', marginBottom: 2 }}>Last pulled from server</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: lastServerPull ? '#0d7de6' : '#94a3b8' }}>
            {formatLastPulled(lastServerPull)}
          </div>
          {lastServerPull && (
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
              {lastServerPull.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          )}
        </div>
      </div>

      {/* ── Stats Bar ── */}
      <div className="admin-stats-bar">
        {[
          { label: 'Total Devices', value: totalCount, icon: <DevicesIcon style={{ color: '#0d7de6', width: 28, height: 28 }} /> },
          { label: 'Devices Online', value: onlineCount, icon: <BoltIcon style={{ color: '#10b981', width: 28, height: 28 }} /> },
          { label: 'Elevated AHI (>5.0)', value: criticalCount, icon: <WarningIcon style={{ color: '#e24b4a', width: 28, height: 28 }} />, danger: criticalCount > 0 },
          { label: 'Avg Compliance', value: `${complianceAvg}%`, icon: <CheckCircleIcon style={{ color: '#1d9e75', width: 28, height: 28 }} /> }
        ].map(s => (
          <div key={s.label} className={`admin-stat-card ${s.danger ? 'danger' : ''}`}>
            <span className="admin-stat-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.icon}</span>
            <span className="admin-stat-value">{s.value}</span>
            <span className="admin-stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── Quick Lookup Card ── */}
      <div className="admin-quick-lookup-card" style={{ marginBottom: 24 }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(13, 125, 230, 0.05) 0%, rgba(39, 198, 199, 0.05) 100%)',
          border: '1px solid rgba(13, 125, 230, 0.15)',
          borderRadius: '16px',
          padding: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.02)'
        }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: 15, fontWeight: 750, color: '#0d7de6', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SearchIcon style={{ color: '#0d7de6' }} /> Instant Serial Dashboard Lookup
          </h3>
          <form onSubmit={handleQuickSubmit} style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              placeholder="Enter serial number (e.g. CVT30-C-9281)..."
              value={quickSerial}
              onChange={e => setQuickSerial(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                fontSize: 14,
                fontFamily: 'monospace',
                letterSpacing: '0.5px'
              }}
            />
            <button
              type="submit"
              style={{
                background: 'linear-gradient(135deg, #0d7de6 0%, #27c6c7 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 20px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(13, 125, 230, 0.2)',
                display: 'flex', alignItems: 'center', gap: 8
              }}
            >
              Show Metrics
            </button>
          </form>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="admin-toolbar">
        <div className="admin-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="admin-search-input"
            placeholder="Search by serial number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyPress}
          />
          {search && (
            <button className="admin-search-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <div className="admin-filter-pills">
          {['all', 'online', 'offline'].map(s => (
            <button
              key={s}
              className={`admin-filter-pill ${statusFilter === s ? 'active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'All Devices' : s}
            </button>
          ))}
        </div>

        <span className="admin-count-label">
          {loading ? '…' : `${filteredDevices.length} device${filteredDevices.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* ── Grid/Table Content ── */}
      {loading ? (
        <div className="admin-loading" style={{ background: 'var(--panel-strong)', borderRadius: 16, padding: 32, border: '1px solid var(--line)', textAlign: 'center' }}>
          <div className="admin-spinner" style={{ margin: '0 auto 12px' }} />
          <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Loading devices registry…</span>
        </div>
      ) : filteredDevices.length === 0 ? (
        <div className="admin-empty" style={{ background: 'var(--panel-strong)', borderRadius: 16, padding: 32, border: '1px solid var(--line)', textAlign: 'center' }}>
          <p style={{ margin: 0, color: 'var(--muted)', fontWeight: 600 }}>No devices found matching current filters.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="desktop-table-view admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Device Serial</th>
                  <th>Model</th>
                  <th>Compliance</th>
                  <th>AHI</th>
                  <th>Usage</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map(d => {
                  const sc = STATUS_COLOR[d.status] || STATUS_COLOR.offline;
                  return (
                    <tr
                      key={d.serial}
                      className="admin-table-row"
                      onClick={() => { navigate(`/device/${d.serial}`); }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <strong style={{ color: '#0d7de6', fontFamily: 'monospace', fontSize: 15 }}>{d.serial}</strong>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>FW: {d.firmware}</div>
                      </td>
                      <td className="admin-td-secondary">{d.model}</td>
                      <td>
                        <div className="admin-compliance-wrap">
                          <div className="admin-compliance-bar">
                            <div className="admin-compliance-fill" style={{
                              width: `${d.compliance_pct}%`,
                              background: d.compliance_pct >= 70 ? '#1d9e75' : d.compliance_pct >= 50 ? '#ef9f27' : '#e24b4a'
                            }} />
                          </div>
                          <span className="admin-compliance-num">{d.compliance_pct}%</span>
                        </div>
                      </td>
                      <td>
                        <span className="admin-badge" style={{
                          background: d.ahi <= 5.0 ? '#e6f9f0' : '#faece7',
                          color: d.ahi <= 5.0 ? '#0f6e56' : '#993c1d'
                        }}>
                          {d.ahi}
                        </span>
                      </td>
                      <td className="admin-td-secondary">{d.usage_hours}h</td>
                      <td>
                        <span className="admin-status-pill" style={{ background: sc.bg, color: sc.text }}>
                          <span className="admin-status-dot" style={{ background: sc.dot }} />
                          {d.status}
                        </span>
                      </td>
                      <td>
                        <button
                          className="admin-view-btn"
                          onClick={e => { e.stopPropagation(); navigate(`/device/${d.serial}`); }}
                        >
                          View Metrics
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="mobile-cards-view mobile-device-cards-grid">
            {filteredDevices.map(d => {
              const sc = STATUS_COLOR[d.status] || STATUS_COLOR.offline;
              return (
                <div
                  key={d.serial}
                  className="mobile-device-card"
                  onClick={() => navigate(`/device/${d.serial}`)}
                >
                  <div className="mobile-device-card-header">
                    <span className="mobile-device-card-serial">{d.serial}</span>
                    <span className="admin-status-pill" style={{ background: sc.bg, color: sc.text, margin: 0 }}>
                      <span className="admin-status-dot" style={{ background: sc.dot }} />
                      {d.status}
                    </span>
                  </div>
                  <div className="mobile-device-card-info">
                    {d.model} · FW: {d.firmware}
                  </div>

                  {/* Compliance bar */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                      <span>Compliance</span>
                      <span>{d.compliance_pct}%</span>
                    </div>
                    <div className="admin-compliance-bar" style={{ height: 6, margin: 0 }}>
                      <div className="admin-compliance-fill" style={{
                        width: `${d.compliance_pct}%`,
                        background: d.compliance_pct >= 70 ? '#1d9e75' : d.compliance_pct >= 50 ? '#ef9f27' : '#e24b4a'
                      }} />
                    </div>
                  </div>

                  {/* Stat pills */}
                  <div className="mobile-device-card-metrics">
                    <div className="mobile-device-metric-pill">
                      <div className="mobile-device-metric-label">AHI</div>
                      <div className="mobile-device-metric-value" style={{ color: d.ahi <= 5.0 ? '#1d9e75' : '#e24b4a' }}>
                        {d.ahi}
                      </div>
                    </div>
                    <div className="mobile-device-metric-pill">
                      <div className="mobile-device-metric-label">Usage</div>
                      <div className="mobile-device-metric-value">
                        {d.usage_hours}h
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
