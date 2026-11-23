import { useNotify } from '../context/NotifyContext';
import DeviceDataState from '../components/DeviceDataState';
import SyncProgress, { useSyncProgress } from '../components/SyncProgress';
import { ReportsSkeleton } from '../components/Skeleton';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import { FileIcon, InfoIcon } from '../components/Icons';
import { useTherapy } from '../context/TherapyContext';

import { devicesAPI } from '../services/respireeApi';
import { parseReportRows } from '../services/reportFileParser';

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
  const sync = useSyncProgress();

  const handleSyncReports = useCallback(async () => {
    if (!activeSerial || syncing) return;
    setSyncing(true);
    sync.begin();
    try {
      const { stillRunning, received } = await devicesAPI.syncReports(activeSerial, { onProgress: sync.progress });
      sync.finishing();
      await fetchDeviceData(activeSerial);
      if (stillRunning) {
        sync.clear();
        notify.info('Report sync is still running', { message: 'It continues in the background. Refresh later to see new sessions.' });
      } else {
        sync.finish(received);
      }
    } catch (e) {
      sync.clear();
      notify.fromError(e, { action: 'sync reports', subject: activeSerial });
    } finally {
      setSyncing(false);
    }
  }, [activeSerial, fetchDeviceData, notify, syncing, sync]);



  // One row per session the device recorded, newest first, so two sessions
  // on one day show as two rows. Compliance is the day's: at least 4 h in
  // all of that day's sessions together.
  const reportEntries = useMemo(() => {
    const has = (v) => v != null && Number.isFinite(Number(v));
    const hm = (minutes) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    const records = parseReportRows(deviceData?.reports || []).records;

    if (!records.length) {
      // No stored session reports (older telemetry): one row per day as before.
      return [...sessions].reverse().map((s, idx) => ({
        id: String(idx),
        date: s.date,
        time: null,
        usage: has(s.usage_hours) ? hm(Math.round(s.usage_hours * 60)) : '—',
        ahi: has(s.ahi) ? `${s.ahi} / hr` : '—',
        leak: has(s.mask_leak) ? `${s.mask_leak} L/min` : '—',
        pressure: has(s.pressure_95) ? `${s.pressure_95} cmH₂O` : '—',
        compliance: has(s.usage_hours) ? (s.usage_hours >= 4.0 ? 'Yes' : 'No') : null,
      }));
    }

    const dayMinutes = new Map();
    const dayCount = new Map();
    for (const r of records) {
      dayMinutes.set(r.dayKey, (dayMinutes.get(r.dayKey) || 0) + r.durationMinutes);
      dayCount.set(r.dayKey, (dayCount.get(r.dayKey) || 0) + 1);
    }
    const seenInDay = new Map();
    const label = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return [...records]
      .sort((a, b) => a.start - b.start)
      .map((r) => {
        const n = (seenInDay.get(r.dayKey) || 0) + 1;
        seenInDay.set(r.dayKey, n);
        const hours = r.durationMinutes / 60;
        return {
          id: `${r.dayKey}-${n}-${r.startClock}`,
          date: label.format(r.start),
          session: dayCount.get(r.dayKey) > 1 ? `Session ${n} of ${dayCount.get(r.dayKey)}` : null,
          time: `${r.startClock} – ${r.endClock}`,
          usage: hm(r.durationMinutes),
          ahi: hours > 0 ? `${(r.events / hours).toFixed(1)} / hr` : '—',
          leak: r.leakValid ? `${r.leak} L/min` : '—',
          pressure: has(r.setPressure) ? `${r.setPressure} cmH₂O` : '—',
          compliance: dayMinutes.get(r.dayKey) >= 240 ? 'Yes' : 'No',
        };
      })
      .reverse();
  }, [sessions, deviceData?.reports]);

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
  const [building, setBuilding] = useState(false);
  const handleGeneratePDF = async () => {
    if (building) return;
    setBuilding(true);
    try {
      const { openTherapyReport } = await import('../services/therapyReport');
      const result = openTherapyReport({ deviceData, sessions, startDate, endDate });
      if (result.reason === 'build-failed') {
        notify.fromError(result.error, { action: 'build the therapy report', subject: activeSerial });
      } else if (!result.ok) {
        notify.error('The report window was blocked', { message: 'Your browser blocked the pop-up. Allow pop-ups for this site, then generate the report again.' });
      }
    } catch (e) {
      notify.fromError(e, { action: 'open the therapy report', subject: activeSerial });
    } finally {
      setBuilding(false);
    }
  };

  // Every block below is gated on deviceData, so without these two states the
  // page rendered as a completely blank panel with no explanation.
  if (!deviceData) return <DeviceDataState what="therapy reports" skeleton={ReportsSkeleton} />;

  return (
    <div className="reports-page">
      {sync.view && !sync.view.hidden && (
        <SyncProgress serial={activeSerial} {...sync.view} onHide={sync.hide} />
      )}


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
            <button className="icon-text-button" onClick={handleGeneratePDF} disabled={!sessions.length || building} title={sessions.length ? 'Opens the report to print or save as PDF' : 'No sessions to report yet'}>
              <FileIcon />
              <span>Open report (print / save PDF)</span>
            </button>
          </div>
        </GlassCard>
      )}

      {/* OSCAR-style compliance check and statistics */}

      {/* Session compliance table */}
      {deviceData && (
        <GlassCard style={{ marginTop: '20px' }}>
          <div className="section-title table-title-row">
            <h2>Compliance &amp; Clinical History</h2>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
              {reportEntries.length} session{reportEntries.length === 1 ? '' : 's'} · compliance is the day's total (≥ 4 h)
            </span>
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
                      <th>Time</th>
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
                        <td>
                          <strong>{report.date}</strong>
                          {report.session && <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{report.session}</div>}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{report.time || '—'}</td>
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
