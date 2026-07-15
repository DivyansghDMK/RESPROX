import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMockPatients, getMockStats, createMockPatient } from '../services/adminService';
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

  // Patient Onboarding Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPatient, setNewPatient] = useState({
    name: '',
    email: '',
    age: '',
    gender: 'M',
    device_id: '',
    device_model: 'CPAP VT30 D'
  });
  const [creationResult, setCreationResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

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

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const patient = await createMockPatient(newPatient);
      const loginLink = `${window.location.origin}/login?autologin=true&email=${encodeURIComponent(patient.email)}&serial=${encodeURIComponent(patient.device_id)}&name=${encodeURIComponent(patient.name)}`;

      const emailBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #0f172a; margin-top: 0;">Welcome to DeckLink, ${patient.name}!</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">
            Your clinician has configured your CPAP Compliance Portal access on DeckLink.
          </p>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">
            You can view your real-time therapy logs, usage trends, and mask fit settings directly without any password or signup by clicking the link below:
          </p>
          <div style="margin: 28px 0; text-align: center;">
            <a href="${loginLink}" style="background-color: #0ea5e9; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(14, 165, 233, 0.2);">
              Open My CPAP Dashboard
            </a>
          </div>
          <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 24px 0;"/>
          <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
            <strong>Device Details:</strong><br/>
            Serial Number: <strong>${patient.device_id}</strong><br/>
            Device Model: <strong>${patient.device_model}</strong>
          </p>
          <p style="color: #94a3b8; font-size: 11px; margin-top: 20px;">
            This access link is private to your email. Do not share it with others.
          </p>
        </div>
      `;

      let emailSent = false;
      try {
        const res = await fetch('http://localhost:8000/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to_email: patient.email,
            subject: 'Welcome to DeckLink - Your CPAP Compliance Portal is Ready',
            html_body: emailBody
          })
        });
        if (res.ok) {
          emailSent = true;
        }
      } catch (err) {
        console.warn("AWS SES Onboarding email failed:", err);
      }

      setCreationResult({
        patient,
        link: loginLink,
        emailSent
      });

      // reload list
      fetchData();

    } catch (error) {
      alert("Error onboarding patient: " + error.message);
    } finally {
      setSubmitting(false);
    }
  };

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

        <button 
          onClick={() => setShowCreateModal(true)}
          style={{
            background: '#0d7de6',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            marginLeft: 'auto',
            marginRight: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <span>➕</span> Create Patient
        </button>

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

      {showCreateModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000,
          padding: 20
        }}>
          <div style={{
            background: '#0b0f19',
            border: '1px solid #1e293b',
            borderRadius: 16,
            padding: 28,
            width: '100%',
            maxWidth: 500,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
            color: '#f1f5f9',
            display: 'flex',
            flexDirection: 'column',
            gap: 20
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>Create Patient &amp; Send Portal Link</h3>
              <button 
                onClick={() => { setShowCreateModal(false); setCreationResult(null); }}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 18, cursor: 'pointer' }}
              >✕</button>
            </div>

            {!creationResult ? (
              <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* Name */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>Patient Full Name</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. Divyansh Srivastav"
                    value={newPatient.name} 
                    onChange={e => setNewPatient(prev => ({ ...prev, name: e.target.value }))}
                    style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#f8fafc', outline: 'none' }}
                  />
                </div>

                {/* Email */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>Email Address (for portal access link)</label>
                  <input 
                    type="email" 
                    required 
                    placeholder="patient@email.com"
                    value={newPatient.email} 
                    onChange={e => setNewPatient(prev => ({ ...prev, email: e.target.value }))}
                    style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#f8fafc', outline: 'none' }}
                  />
                </div>

                {/* Age / Gender row */}
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>Age</label>
                    <input 
                      type="number" 
                      required 
                      placeholder="e.g. 45"
                      value={newPatient.age} 
                      onChange={e => setNewPatient(prev => ({ ...prev, age: Number(e.target.value) }))}
                      style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#f8fafc', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>Gender</label>
                    <select 
                      value={newPatient.gender} 
                      onChange={e => setNewPatient(prev => ({ ...prev, gender: e.target.value }))}
                      style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#f8fafc', outline: 'none', cursor: 'pointer', height: 35, width: '100%' }}
                    >
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Device Serial */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>Device Serial Number</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. VT30-1002 or CVT30-C-9281"
                    value={newPatient.device_id} 
                    onChange={e => setNewPatient(prev => ({ ...prev, device_id: e.target.value }))}
                    style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#f8fafc', outline: 'none' }}
                  />
                </div>

                {/* Device Model */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>Device Model</label>
                  <input 
                    type="text" 
                    required 
                    value={newPatient.device_model} 
                    onChange={e => setNewPatient(prev => ({ ...prev, device_model: e.target.value }))}
                    style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#f8fafc', outline: 'none' }}
                  />
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
                  <button 
                    type="button" 
                    onClick={() => setShowCreateModal(false)}
                    style={{ background: 'transparent', border: '1px solid #334155', borderRadius: 8, padding: '8px 16px', color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={submitting}
                    style={{ background: '#0d7de6', border: 'none', borderRadius: 8, padding: '8px 20px', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}
                  >
                    {submitting ? 'Registering & Emailing...' : 'Save & Send Link'}
                  </button>
                </div>

              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 24 }}>✓</span>
                  <strong style={{ color: '#10b981', fontSize: 14 }}>Patient Registered Successfully!</strong>
                  <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                    {creationResult.emailSent 
                      ? `Onboarding email has been sent successfully to ${creationResult.patient.email}.`
                      : `Patient created, but AWS SES email delivery failed (ensure SES sender verification is active). You can copy the login link below and send it to them manually.`}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#64748b' }}>User's Direct Passwordless Login URL</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input 
                      type="text" 
                      readOnly 
                      value={creationResult.link} 
                      id="loginLinkUrl"
                      style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#f8fafc', outline: 'none', fontFamily: 'monospace' }}
                    />
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(creationResult.link);
                        alert("Onboarding login link copied to clipboard!");
                      }}
                      style={{ background: '#334155', border: 'none', borderRadius: 8, padding: '0 16px', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Copy Link
                    </button>
                  </div>
                </div>

                <button 
                  onClick={() => { setShowCreateModal(false); setCreationResult(null); }}
                  style={{ width: '100%', background: '#0d7de6', border: 'none', borderRadius: 8, padding: '10px', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 8 }}
                >
                  Done
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
