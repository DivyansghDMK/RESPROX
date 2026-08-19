import { useNotify } from '../context/NotifyContext';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import { FileIcon, DownloadIcon, ShareIcon, InfoIcon } from '../components/Icons';
import { useTherapy } from '../context/TherapyContext';

const REPORTS_API_URL = import.meta.env.VITE_REVIEWED_REPORTS_API_URL ||
  'https://6jhix49qt6.execute-api.us-east-1.amazonaws.com/api/public/reviewed-reports';
const REPORTS_API_KEY = import.meta.env.VITE_REVIEWED_REPORTS_API_KEY ||
  '9q7RZrcSkc7UMYwXLAJXo33N4AvulrfF5r23KrIL';

// Status badge component
function StatusBadge({ status }) {
  const map = {
    'Reviewed':     { bg: '#dcfce7', color: '#166534', label: 'Reviewed' },
    'Compliant':    { bg: '#dcfce7', color: '#166534', label: 'Compliant' },
    'Pending':      { bg: '#fef9c3', color: '#854d0e', label: 'Pending' },
    'Assigned':     { bg: '#dbeafe', color: '#1e40af', label: 'Assigned' },
    'Under Review': { bg: '#fef3c7', color: '#92400e', label: 'Under Review' },
  };
  const s = map[status] || { bg: '#f1f5f9', color: '#64748b', label: status || 'Unknown' };
  return (
    <span style={{
      background: s.bg, color: s.color, padding: '3px 10px',
      borderRadius: 999, fontSize: 12, fontWeight: 700,
    }}>
      {s.label}
    </span>
  );
}

// Reviewed ECG reports from AWS S3 / API Gateway
function ReviewedReportsPanel({ activeSerial }) {
  const [reports, setReports]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [isLive, setIsLive]       = useState(false);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('All');

  const fetchReports = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const url = activeSerial
        ? `${REPORTS_API_URL}?RhythmUltra_serial=${encodeURIComponent(activeSerial)}`
        : REPORTS_API_URL;
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', 'x-api-key': REPORTS_API_KEY },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const raw = Array.isArray(json) ? json : (json.data || json.reports || []);
      setReports(raw);
      setIsLive(true);
    } catch (err) {
      setError(`Could not reach live reports API: ${err.message}`);
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  }, [activeSerial]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const visible = reports.filter(r => {
    const q = search.toLowerCase();
    const matchQ = !q ||
      (r.patient_name || '').toLowerCase().includes(q) ||
      (r.report_uid || r.report_id || '').toLowerCase().includes(q) ||
      (r.doctor_name || '').toLowerCase().includes(q);
    const matchS = statusFilter === 'All' || r.status === statusFilter;
    return matchQ && matchS;
  });

  return (
    <GlassCard style={{ marginTop: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
            Reviewed ECG Reports
          </h2>
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
            padding: '2px 8px', borderRadius: 4,
            background: isLive ? '#dcfce7' : '#fef9c3',
            color: isLive ? '#166534' : '#854d0e',
          }}>
            {isLive ? '● Live AWS' : '○ Offline'}
          </span>
        </div>
        <button
          onClick={fetchReports}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: '1px solid var(--line)', borderRadius: 8,
            padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--muted)',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search patient, report ID, doctor…"
          style={{
            flex: 1, minWidth: 180, padding: '8px 12px', borderRadius: 8,
            border: '1px solid var(--line)', fontSize: 13, outline: 'none',
            background: '#f8fafc', color: 'var(--text)',
          }}
        />
        {['All', 'Pending', 'Assigned', 'Under Review', 'Reviewed'].map(s => (
          <button key={s} onClick={() => setStatus(s)} style={{
            padding: '7px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 600,
            cursor: 'pointer', border: '1px solid',
            borderColor: statusFilter === s ? 'var(--accent)' : 'var(--line)',
            background: statusFilter === s ? '#eff6ff' : 'transparent',
            color: statusFilter === s ? 'var(--accent)' : 'var(--muted)',
          }}>
            {s}
          </button>
        ))}
      </div>

      {/* States */}
      {loading && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⟳</div>
          <p style={{ margin: 0, fontSize: 14 }}>Fetching reports from AWS…</p>
        </div>
      )}

      {!loading && error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
          padding: '14px 18px', color: '#dc2626', fontSize: 13.5,
        }}>
          ⚠ {error}
        </div>
      )}

      {!loading && !error && (
        visible.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.3 }}>📄</div>
            <p style={{ margin: 0 }}>No reviewed reports found.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Report ID</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Doctor</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => {
                  const dateStr = r.created_at || r.date
                    ? new Date(r.created_at || r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—';
                  const pdfUrl = r.storage_url || r.preview_url || r.presigned_url || r.file_url || '';
                  return (
                    <tr key={r.report_id || r.report_uid || i}>
                      <td><strong>{r.patient_name || '—'}</strong></td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.report_uid || r.report_id || '—'}</td>
                      <td>{dateStr}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td>{r.doctor_name || <span style={{ opacity: 0.4 }}>Unassigned</span>}</td>
                      <td>
                        {pdfUrl ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <a
                              href={pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                                background: '#eff6ff', color: 'var(--accent)',
                                border: '1px solid #bfdbfe', textDecoration: 'none',
                              }}
                            >
                              👁 View
                            </a>
                            <a
                              href={pdfUrl}
                              download
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '4px 10px', borderRadius: 6, fontSize: 12,
                                background: 'transparent', color: 'var(--muted)',
                                border: '1px solid var(--line)', textDecoration: 'none',
                              }}
                            >
                              ↓
                            </a>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: 12, opacity: 0.5 }}>No PDF</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10 }}>
              Showing {visible.length} of {reports.length} report{reports.length !== 1 ? 's' : ''}
            </p>
          </div>
        )
      )}
    </GlassCard>
  );
}

// ── Main Reports Page ─────────────────────────────────────────────────────────

// ── Main Reports Page ─────────────────────────────────────────────────────────

export default function Reports() {
  const notify = useNotify();
  const navigate = useNavigate();
  const { deviceData, adminActiveSerial } = useTherapy();

  const sessions = useMemo(() => {
    return deviceData ? deviceData.sessions : [];
  }, [deviceData]);

  const activeSerial = useMemo(() => {
    return deviceData ? deviceData.serial : '';
  }, [deviceData]);

  const [startDate, setStartDate] = useState('2026-06-01');
  const [endDate, setEndDate] = useState('2026-06-08');



  const reportEntries = useMemo(() => {
    return [...sessions].reverse().map((s, idx) => {
      const hoursInt = Math.floor(s.usage_hours);
      const minsInt = Math.round((s.usage_hours - hoursInt) * 60);
      return {
        id: idx.toString(),
        date: s.date,
        usage: `${hoursInt}h ${minsInt}m`,
        ahi: s.ahi,
        leak: `${s.mask_leak} L/min`,
        pressure: `${s.pressure_95} cmH₂O`,
        compliance: s.usage_hours >= 4.0 ? 'Yes' : 'No'
      };
    });
  }, [sessions]);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;
  const totalPages = Math.ceil(reportEntries.length / rowsPerPage);

  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return reportEntries.slice(start, start + rowsPerPage);
  }, [reportEntries, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [reportEntries.length]);

  // The report template and its SVG charts live in their own module so this
  // route's chunk stays small — it is fetched the first time a report is asked for.
  const handleGeneratePDF = async () => {
    const { openTherapyReport } = await import('../services/therapyReport');
    const result = openTherapyReport({ deviceData, sessions, startDate, endDate });
    if (!result.ok) {
      notify.error('The report window was blocked', { message: 'Your browser blocked the pop-up. Allow pop-ups for this site, then generate the report again.' });
    }
  };

  const handleShareReport = () => {
    notify.success('Share link sent', { message: `A copy of the ${activeSerial} report went to the associated specialist.` });
  };

  // Every block below is gated on deviceData, so without these two states the
  // page rendered as a completely blank panel with no explanation.
  if (!deviceData) {
    // A serial is selected but its data has not arrived yet — this is a load,
    // not an empty state, and must not be reported as "nothing selected".
    if (adminActiveSerial) {
      return (
        <div className="reports-page" style={{ padding: '40px 20px', textAlign: 'center' }}>
          <GlassCard>
            <div className="admin-spinner" style={{ margin: '0 auto 14px' }} />
            <h2 style={{ color: 'var(--accent)', fontWeight: 800 }}>Loading therapy data…</h2>
            <p style={{ color: 'var(--muted)', marginTop: 8 }}>
              Fetching sessions for device <strong>{adminActiveSerial}</strong>.
            </p>
          </GlassCard>
        </div>
      );
    }

    return (
      <div className="reports-page" style={{ padding: '40px 20px', textAlign: 'center' }}>
        <GlassCard>
          <h2 style={{ color: 'var(--accent)', fontWeight: 800 }}>No Device Selected</h2>
          <p style={{ color: 'var(--muted)', marginTop: 8 }}>
            Please select a device from the Devices registry to generate therapy reports.
          </p>
          <button
            className="icon-text-button"
            style={{ marginTop: 18 }}
            onClick={() => navigate('/devices')}
          >
            <FileIcon />
            <span>Go to Devices</span>
          </button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="reports-page">


      {/* Session filters card */}
      {deviceData && (
        <GlassCard className="reports-header-card">
          <div className="section-title">
            <h2>Clinical Report Filters</h2>
          </div>
          <div className="reports-filters-grid">
            <div className="input-field">
              <label htmlFor="device-serial-display">Active Device</label>
              <input
                id="device-serial-display"
                type="text"
                readOnly
                value={activeSerial}
                style={{
                  background: '#f1f5f9',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  border: '1px solid var(--line)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '13px'
                }}
              />
            </div>
            <div className="input-field">
              <label htmlFor="start-date">Start Date</label>
              <input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="Start Date"
              />
            </div>
            <div className="input-field">
              <label htmlFor="end-date">End Date</label>
              <input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="End Date"
              />
            </div>
          </div>

          <div className="reports-actions-bar">
            <button className="icon-text-button" onClick={handleGeneratePDF}>
              <FileIcon />
              <span>View PDF</span>
            </button>
            <button className="icon-text-button" onClick={handleGeneratePDF}>
              <DownloadIcon />
              <span>Download PDF</span>
            </button>
            <button className="icon-text-button" onClick={handleShareReport}>
              <ShareIcon />
              <span>Share Report</span>
            </button>
          </div>
        </GlassCard>
      )}

      {/* Session compliance table */}
      {deviceData && (
        <GlassCard style={{ marginTop: '20px' }}>
          <div className="section-title table-title-row">
            <h2>Compliance &amp; Clinical History</h2>
            <span className="info-badge" style={{ fontFamily: 'monospace', fontWeight: 700 }}>
              <InfoIcon /> Device Serial: {activeSerial}
            </span>
          </div>
          <div className="table-responsive">
            {paginatedEntries.length ? (
              <>
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Usage</th>
                      <th>AHI</th>
                      <th>Leak Rate</th>
                      <th>Pressure</th>
                      <th>Compliance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEntries.map((report) => (
                      <tr key={report.id}>
                        <td><strong>{report.date}</strong></td>
                        <td>{report.usage}</td>
                        <td>{report.ahi} / hr</td>
                        <td>{report.leak}</td>
                        <td>{report.pressure}</td>
                        <td>
                          <span className={`compliance-tag ${report.compliance === 'Yes' ? 'pass' : 'fail'}`}>
                            {report.compliance === 'Yes' ? 'Passed' : 'Failed'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Table Pagination Controls */}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 15, marginTop: 18 }}>
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      style={{
                        padding: '6px 12px', borderRadius: 6, border: '1px solid var(--line)',
                        background: 'none', color: 'var(--muted)', cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                        fontSize: 12.5, fontWeight: 600, opacity: currentPage === 1 ? 0.4 : 1
                      }}
                    >
                      &larr; Previous
                    </button>
                    <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      style={{
                        padding: '6px 12px', borderRadius: 6, border: '1px solid var(--line)',
                        background: 'none', color: 'var(--muted)', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                        fontSize: 12.5, fontWeight: 600, opacity: currentPage === totalPages ? 0.4 : 1
                      }}
                    >
                      Next &rarr;
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)' }}>
                No records available for this device.
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {/* Live AWS Reviewed ECG Reports */}
      {/* <ReviewedReportsPanel activeSerial={activeSerial} /> */}
    </div>
  );
}
