import { useNotify } from '../context/NotifyContext';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import { FileIcon, InfoIcon } from '../components/Icons';
import { useTherapy } from '../context/TherapyContext';

import { devicesAPI } from '../services/respireeApi';

export default function Reports() {
  const notify = useNotify();
  const navigate = useNavigate();
  const { deviceData, adminActiveSerial, fetchDeviceData } = useTherapy();

  const sessions = useMemo(() => {
    return deviceData ? deviceData.sessions : [];
  }, [deviceData]);

  const activeSerial = useMemo(() => {
    return deviceData ? deviceData.serial : '';
  }, [deviceData]);

  // The report range defaults to the nights the device actually recorded.
  const dayKey = (ts) => {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const dataRange = useMemo(() => {
    const stamps = sessions.map((s) => s.timestamp).filter(Boolean).sort((a, b) => a - b);
    return stamps.length ? { start: dayKey(stamps[0]), end: dayKey(stamps[stamps.length - 1]) } : { start: '', end: '' };
  }, [sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  useEffect(() => {
    setStartDate(dataRange.start);
    setEndDate(dataRange.end);
  }, [dataRange.start, dataRange.end]);
  const [syncing, setSyncing] = useState(false);

  const handleSyncReports = useCallback(async () => {
    if (!activeSerial || syncing) return;
    setSyncing(true);
    try {
      const { stillRunning } = await devicesAPI.syncReports(activeSerial);
      await fetchDeviceData(activeSerial);
      if (stillRunning) notify.info('Report sync is still running', { message: 'It continues in the background. Refresh later to see new sessions.' });
      else notify.success('Report sync finished');
    } catch (e) {
      notify.fromError(e, { action: 'sync reports', subject: activeSerial });
    } finally {
      setSyncing(false);
    }
  }, [activeSerial, fetchDeviceData, notify, syncing]);



  const reportEntries = useMemo(() => {
    return [...sessions].reverse().map((s, idx) => {
      const has = (v) => v != null && Number.isFinite(Number(v));
      const hoursInt = Math.floor(s.usage_hours);
      const minsInt = Math.round((s.usage_hours - hoursInt) * 60);
      return {
        id: idx.toString(),
        date: s.date,
        usage: has(s.usage_hours) ? `${hoursInt}h ${minsInt}m` : '—',
        ahi: has(s.ahi) ? `${s.ahi} / hr` : '—',
        leak: has(s.mask_leak) ? `${s.mask_leak} L/min` : '—',
        pressure: has(s.pressure_95) ? `${s.pressure_95} cmH₂O` : '—',
        compliance: has(s.usage_hours) ? (s.usage_hours >= 4.0 ? 'Yes' : 'No') : null,
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
            <button className="icon-text-button" onClick={handleSyncReports} disabled={syncing}>
              <span aria-hidden="true">⟳</span>
              <span>{syncing ? 'Syncing reports…' : 'Sync reports'}</span>
            </button>
            <button className="icon-text-button" onClick={handleGeneratePDF} disabled={!sessions.length} title={sessions.length ? 'Opens the report to print or save as PDF' : 'No sessions to report yet'}>
              <FileIcon />
              <span>Open report (print / save PDF)</span>
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
                        <td>{report.ahi}</td>
                        <td>{report.leak}</td>
                        <td>{report.pressure}</td>
                        <td>
                          {report.compliance == null ? '—' : (
                            <span className={`compliance-tag ${report.compliance === 'Yes' ? 'pass' : 'fail'}`}>
                              {report.compliance === 'Yes' ? 'Passed' : 'Failed'}
                            </span>
                          )}
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

    </div>
  );
}
