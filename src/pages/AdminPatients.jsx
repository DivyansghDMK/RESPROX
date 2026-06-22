import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMockPatients, getMockStats } from '../services/adminService';
// When real API is ready, swap above import with:
// import { getPatients, getAdminStats } from '../services/adminService';

const STATUS_COLOR = {
  active:   { bg: '#e6f9f0', text: '#0f6e56', dot: '#1d9e75' },
  inactive: { bg: '#f1efe8', text: '#5f5e5a', dot: '#888780' },
  critical: { bg: '#fcebeb', text: '#a32d2d', dot: '#e24b4a' },
};

const AHI_BADGE = (ahi) => {
  if (ahi <= 5)  return { label: 'Normal',   bg: '#e6f9f0', text: '#0f6e56' };
  if (ahi <= 15) return { label: 'Mild',     bg: '#faeeda', text: '#854f0b' };
  if (ahi <= 30) return { label: 'Moderate', bg: '#faece7', text: '#993c1d' };
  return               { label: 'Severe',   bg: '#fcebeb', text: '#a32d2d' };
};

export default function AdminPatients() {
  const navigate = useNavigate();
  const [stats, setStats]         = useState(null);
  const [patients, setPatients]   = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('');
  const [loading, setLoading]     = useState(true);
  const LIMIT = 10;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        getMockPatients({ page, limit: LIMIT, search, status: statusFilter }),
        // replace with getAdminStats() when ready
        getMockStats(),
      ]);
      setPatients(pRes.patients);
      setTotal(pRes.total);
      setTotalPages(pRes.totalPages);
      setStats(sRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // debounce search
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    const now = new Date();
    const diffH = Math.round((now - d) / 3600000);
    if (diffH < 1)  return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;
    if (diffH < 48) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="admin-patients-page">

      {/* ── Stats Bar ── */}
      <div className="admin-stats-bar">
        {stats ? [
          { label: 'Total Patients',    value: stats.total_patients,  icon: '👥' },
          { label: 'Active Tonight',    value: stats.active_tonight,  icon: '🌙' },
          { label: 'Critical Alerts',   value: stats.critical_alerts, icon: '🚨', danger: true },
          { label: 'Avg AHI',           value: `${stats.avg_ahi}`,    icon: '📊' },
          { label: 'Avg Compliance',    value: `${stats.avg_compliance}%`, icon: '✅' },
        ].map(s => (
          <div key={s.label} className={`admin-stat-card ${s.danger ? 'danger' : ''}`}>
            <span className="admin-stat-icon">{s.icon}</span>
            <span className="admin-stat-value">{s.value}</span>
            <span className="admin-stat-label">{s.label}</span>
          </div>
        )) : Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="admin-stat-card skeleton" />
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="admin-toolbar">
        <div className="admin-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="admin-search-input"
            placeholder="Search by name or patient ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="admin-search-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <div className="admin-filter-pills">
          {['', 'active', 'inactive', 'critical'].map(s => (
            <button
              key={s}
              className={`admin-filter-pill ${statusFilter === s ? 'active' : ''}`}
              onClick={() => setStatus(s)}
            >
              {s || 'All'}
            </button>
          ))}
        </div>

        <span className="admin-count-label">
          {loading ? '…' : `${total} patient${total !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="admin-table-wrap">
        {loading ? (
          <div className="admin-loading">
            <div className="admin-spinner" />
            <span>Loading patients…</span>
          </div>
        ) : patients.length === 0 ? (
          <div className="admin-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87m-4-12a4 4 0 0 1 0 7.75"/>
            </svg>
            <p>No patients found</p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Device</th>
                <th>Last Session</th>
                <th>AHI</th>
                <th>Usage</th>
                <th>Compliance</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {patients.map(p => {
                const sc = STATUS_COLOR[p.status] || STATUS_COLOR.inactive;
                const ab = AHI_BADGE(p.ahi);
                const initials = p.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <tr key={p.id} className="admin-table-row" onClick={() => navigate(`/admin/patient/${p.id}`)}>
                    <td>
                      <div className="admin-patient-cell">
                        <div className="admin-avatar">{initials}</div>
                        <div>
                          <div className="admin-patient-name">{p.name}</div>
                          <div className="admin-patient-meta">{p.id} · {p.age}y · {p.gender}</div>
                        </div>
                      </div>
                    </td>
                    <td className="admin-td-secondary">{p.device_model}<br /><span style={{ fontSize: 11 }}>{p.device_id}</span></td>
                    <td className="admin-td-secondary">{fmtDate(p.last_session)}</td>
                    <td>
                      <span className="admin-badge" style={{ background: ab.bg, color: ab.text }}>
                        {p.ahi} — {ab.label}
                      </span>
                    </td>
                    <td className="admin-td-secondary">{p.usage_hours}h</td>
                    <td>
                      <div className="admin-compliance-wrap">
                        <div className="admin-compliance-bar">
                          <div className="admin-compliance-fill" style={{ width: `${p.compliance_pct}%`, background: p.compliance_pct >= 70 ? '#1d9e75' : p.compliance_pct >= 50 ? '#ef9f27' : '#e24b4a' }} />
                        </div>
                        <span className="admin-compliance-num">{p.compliance_pct}%</span>
                      </div>
                    </td>
                    <td>
                      <span className="admin-status-pill" style={{ background: sc.bg, color: sc.text }}>
                        <span className="admin-status-dot" style={{ background: sc.dot }} />
                        {p.status}
                      </span>
                    </td>
                    <td>
                      <button className="admin-view-btn" onClick={e => { e.stopPropagation(); navigate(`/admin/patient/${p.id}`); }}>
                        View →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="admin-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="admin-page-btn">← Prev</button>
          <span className="admin-page-info">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="admin-page-btn">Next →</button>
        </div>
      )}
    </div>
  );
}
