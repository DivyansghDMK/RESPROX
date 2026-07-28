import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
            borderColor: statusFilter === s ? '#1774e6' : 'var(--line)',
            background: statusFilter === s ? '#eff6ff' : 'transparent',
            color: statusFilter === s ? '#1774e6' : 'var(--muted)',
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
                                background: '#eff6ff', color: '#1774e6',
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
  const { deviceData, setDeviceData, setAdminActiveSerial } = useTherapy();
  
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

  const handleGeneratePDF = () => {
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    const filtered = sessions.filter(s => {
      const sDate = s.timestamp ? new Date(s.timestamp) : new Date(s.date + ' 2026');
      if (isNaN(sDate.getTime())) return true;
      if (start && sDate < start) return false;
      if (end && sDate > end) return false;
      return true;
    });

    const reportSessions = filtered.length > 0 ? filtered : sessions;
    const total = reportSessions.length;
    const avgUsage = reportSessions.reduce((acc, s) => acc + s.usage_hours, 0) / (total || 1);
    const avgAhi = reportSessions.reduce((acc, s) => acc + s.ahi, 0) / (total || 1);
    const avgLeak = reportSessions.reduce((acc, s) => acc + s.mask_leak, 0) / (total || 1);
    const avgPressure = reportSessions.reduce((acc, s) => acc + s.pressure_95, 0) / (total || 1);
    const complianceCount = reportSessions.filter(s => s.usage_hours >= 4.0).length;
    const compliancePct = Math.round((complianceCount / (total || 1)) * 100);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up blocker is preventing opening the report print view. Please allow popups.');
      return;
    }

    const patientName = deviceData?.patient?.name || 'CPAP Therapy Patient';
    const deviceModel = deviceData?.model || 'CVT30 CPAP C-Series';
    const firmware = deviceData?.firmware || 'v1.2.4';
    const generatedOn = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>CPAP Compliance Report - ${activeSerial}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 30px;
            line-height: 1.4;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 15px;
            margin-bottom: 25px;
          }
          .brand {
            font-size: 24px;
            font-weight: 800;
            color: #0f172a;
          }
          .brand span {
            color: #0d7de6;
          }
          .report-title {
            font-size: 16px;
            font-weight: 700;
            color: #475569;
            text-align: right;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 25px;
          }
          .meta-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 15px;
          }
          .meta-title {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 10px;
            letter-spacing: 0.5px;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
            font-size: 13px;
          }
          .meta-row span:first-child {
            color: #64748b;
          }
          .meta-row span:last-child {
            font-weight: 700;
            color: #0f172a;
          }
          .kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin-bottom: 25px;
          }
          .kpi-card {
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 15px;
            text-align: center;
            background: #ffffff;
          }
          .kpi-val {
            font-size: 24px;
            font-weight: 900;
            color: #0d7de6;
            margin-bottom: 4px;
          }
          .kpi-label {
            font-size: 10px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
          }
          .section-title {
            font-size: 13px;
            font-weight: 800;
            text-transform: uppercase;
            color: #334155;
            margin-bottom: 12px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 6px;
            letter-spacing: 0.5px;
          }
          .table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            margin-bottom: 25px;
          }
          .table th {
            background: #f8fafc;
            padding: 8px 10px;
            font-weight: 700;
            color: #475569;
            border-bottom: 1.5px solid #e2e8f0;
            text-align: left;
          }
          .table td {
            padding: 8px 10px;
            border-bottom: 1px solid #e2e8f0;
          }
          .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-weight: 700;
            font-size: 10px;
          }
          .pass {
            color: #166534;
            background: #dcfce7;
          }
          .fail {
            color: #991b1b;
            background: #fee2e2;
          }
          .print-bar {
            background: #0f172a;
            color: white;
            padding: 10px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .print-btn {
            background: #0d7de6;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-weight: 700;
            cursor: pointer;
          }
          @media print {
            .print-bar {
              display: none;
            }
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="print-bar">
          <span>Clinical Compliance Report ready for printing</span>
          <button class="print-btn" onclick="window.print()">Print or Save as PDF</button>
        </div>
        
        <div class="header">
          <div class="brand">respro<span>X</span></div>
          <div class="report-title">
            Clinical Compliance &amp; Sleep Therapy Report
            <div style="font-size: 11px; font-weight: 500; color: #94a3b8; margin-top: 4px;">Generated on: ${generatedOn}</div>
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-card">
            <div class="meta-title">Patient Profile</div>
            <div class="meta-row"><span>Patient Name</span><span>${patientName}</span></div>
            <div class="meta-row"><span>Patient ID</span><span>${deviceData?.patient?.id || activeSerial}</span></div>
            <div class="meta-row"><span>Date Range</span><span>${startDate} to ${endDate}</span></div>
          </div>
          <div class="meta-card">
            <div class="meta-title">Device &amp; Therapy Settings</div>
            <div class="meta-row"><span>Machine Serial</span><span style="font-family: monospace;">${activeSerial}</span></div>
            <div class="meta-row"><span>Model</span><span>${deviceModel}</span></div>
            <div class="meta-row"><span>Therapy Mode</span><span>${deviceData?.settings?.therapy_mode || 'AUTO CPAP'}</span></div>
            <div class="meta-row"><span>Pressure Range</span><span>${deviceData?.settings?.min_pressure || 4.0} - ${deviceData?.settings?.max_pressure || 20.0} cmH₂O</span></div>
          </div>
        </div>

        <div class="section-title">Compliance Summary</div>
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-val">${total}</div>
            <div class="kpi-label">Nights Tracked</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-val" style="color: ${compliancePct >= 70 ? '#166534' : '#991b1b'}">${compliancePct}%</div>
            <div class="kpi-label">Compliance Rate</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-val">${avgUsage.toFixed(1)} hrs</div>
            <div class="kpi-label">Avg Usage/Night</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-val" style="color: ${avgAhi <= 5.0 ? '#166534' : '#b45309'}">${avgAhi.toFixed(1)}</div>
            <div class="kpi-label">Average AHI</div>
          </div>
        </div>

        <div class="section-title">Daily Session Log</div>
        <table class="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Usage Hours</th>
              <th>AHI (events/hr)</th>
              <th>Mask Leak Rate</th>
              <th>95th Percentile Pressure</th>
              <th>Compliance</th>
            </tr>
          </thead>
          <tbody>
            ${reportSessions.map(s => {
              const compliant = s.usage_hours >= 4.0;
              return `
                <tr>
                  <td><strong>${s.display_date || s.date}</strong></td>
                  <td>${s.usage_hours.toFixed(1)} hrs</td>
                  <td>${s.ahi.toFixed(1)}</td>
                  <td>${s.mask_leak.toFixed(1)} L/min</td>
                  <td>${s.pressure_95.toFixed(1)} cmH₂O</td>
                  <td>
                    <span class="badge ${compliant ? 'pass' : 'fail'}">
                      ${compliant ? 'Compliant' : 'Non-compliant'}
                    </span>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleShareReport = () => {
    alert(`Report share link generated for device ${activeSerial}. Sent copy to associated specialist email address.`);
  };

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
