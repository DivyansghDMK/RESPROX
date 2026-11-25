import { useNotify } from '../context/NotifyContext';
import DeviceDataState from '../components/DeviceDataState';
import SyncProgress, { useSyncProgress } from '../components/SyncProgress';
import { ReportsSkeleton } from '../components/Skeleton';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import { FileIcon, InfoIcon } from '../components/Icons';
import { useTherapy } from '../context/TherapyContext';

import { devicesAPI } from '../services/respireeApi';
import { parseReportRows } from '../services/reportFileParser';
import SessionLog from '../components/SessionLog';

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
    // A session's therapy day (noon to noon) when it has one, else its date.
    const keys = sessions.map((s) => s.dayKey || dayKey(s.timestamp)).filter(Boolean).sort();
    return keys.length ? { start: keys[0], end: keys[keys.length - 1] } : { start: '', end: '' };
  }, [sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Filled in from the data once per device; after that the dates are the
  // user's, and new sessions arriving (live refresh, sync) don't move them.
  const rangeFor = useRef(null);
  useEffect(() => {
    if (!dataRange.start || rangeFor.current === activeSerial) return;
    rangeFor.current = activeSerial;
    setStartDate(dataRange.start);
    setEndDate(dataRange.end);
  }, [activeSerial, dataRange.start, dataRange.end]);

  const rangeInvalid = Boolean(startDate && endDate && startDate > endDate);
  const inRange = useCallback((key) => Boolean(key) && (!startDate || key >= startDate) && (!endDate || key <= endDate), [startDate, endDate]);

  /** Quick ranges end on the last day with data, so "Last 7 days" is never empty for an idle device. */
  // Single-day mode: picking a start date moves the end date with it.
  const [singleDay, setSingleDay] = useState(false);
  const preset = (days) => {
    if (!dataRange.end) return;
    setSingleDay(days === 1);
    if (days === 'all') { setStartDate(dataRange.start); setEndDate(dataRange.end); return; }
    const end = new Date(`${dataRange.end}T00:00:00`);
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1));
    setStartDate(dayKey(start.getTime()));
    setEndDate(dataRange.end);
  };
  // A new device starts over in range mode.
  useEffect(() => { setSingleDay(false); }, [activeSerial]);
  const rangeLabel = (key) => (key ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${key}T00:00:00`)) : '…');
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
        dayKey: dayKey(s.timestamp),
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
    return [...records]
      .sort((a, b) => a.start - b.start)
      .map((r) => {
        const n = (seenInDay.get(r.dayKey) || 0) + 1;
        seenInDay.set(r.dayKey, n);
        const hours = r.durationMinutes / 60;
        return {
          id: `${r.dayKey}-${n}-${r.startClock}`,
          dayKey: r.dayKey,
          date: r.dateLabel,
          session: dayCount.get(r.dayKey) > 1 ? `Session ${n} of ${dayCount.get(r.dayKey)}` : null,
          time: `${r.startClock} – ${r.endClock}`,
          usage: hm(r.durationMinutes),
          ahi: hours > 0 ? `${(r.events / hours).toFixed(1)} / hr` : '—',
          leak: r.leakValid ? `${r.leak} L/min` : '—',
          pressure: has(r.sessionPressure) ? `${r.sessionPressure} cmH₂O` : '—',
          compliance: dayMinutes.get(r.dayKey) >= 240 ? 'Yes' : 'No',
          record: r,
        };
      })
      .reverse();
  }, [sessions, deviceData?.reports]); // eslint-disable-line react-hooks/exhaustive-deps

  // The table shows what the report will cover: only the chosen dates.
  const shownEntries = useMemo(() => reportEntries.filter((e) => inRange(e.dayKey)), [reportEntries, inRange]);
  const shownDays = useMemo(() => new Set(shownEntries.map((e) => e.dayKey)).size, [shownEntries]);

  // The session whose log is open under its row.
  const [openLog, setOpenLog] = useState(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;
  const totalPages = Math.ceil(shownEntries.length / rowsPerPage);

  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return shownEntries.slice(start, start + rowsPerPage);
  }, [shownEntries, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [shownEntries.length, startDate, endDate]);

  // The report template and its SVG charts live in their own module so this
  // route's chunk stays small — it is fetched the first time a report is asked for.
  const [building, setBuilding] = useState(false);
  /** The report for [from, to]: the chosen range, or one day from a session row. */
  const handleGeneratePDF = async (from = startDate, to = endDate) => {
    if (building) return;
    setBuilding(true);
    try {
      const { openTherapyReport } = await import('../services/therapyReport');
      const result = openTherapyReport({ deviceData, sessions, startDate: from, endDate: to });
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
                  background: 'var(--bg-f1f5f9)',
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
                max={singleDay ? undefined : endDate || undefined}
                onChange={(e) => { setStartDate(e.target.value); if (singleDay) setEndDate(e.target.value); }}
                aria-label="Start Date"
              />
            </div>
            <div className="input-field">
              <label htmlFor="end-date">End Date</label>
              <input
                id="end-date"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => { setEndDate(e.target.value); setSingleDay(false); }}
                aria-label="End Date"
              />
            </div>
          </div>

          <div className="reports-range-presets" role="group" aria-label="Quick date ranges">
            <span>Quick range:</span>
            {[[1, 'Single day'], [7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], ['all', 'All data']].map(([d, label]) => (
              <button key={label} type="button" onClick={() => preset(d)} disabled={!dataRange.end}
                className={d === 1 && singleDay ? 'on' : ''} aria-pressed={d === 1 ? singleDay : undefined}
                title={d === 1 ? 'One day: pick it with Start Date' : undefined}>{label}</button>
            ))}
          </div>
          {rangeInvalid && <p className="reports-range-error" role="alert">The end date is before the start date. Pick an end date on or after {rangeLabel(startDate)}.</p>}

          <div className="reports-actions-bar">
            <button className="icon-text-button" onClick={handleSyncReports} disabled={syncing}>
              <span aria-hidden="true">⟳</span>
              <span>{syncing ? 'Syncing reports…' : 'Sync reports'}</span>
            </button>
            <button className="icon-text-button" onClick={() => handleGeneratePDF()} disabled={!sessions.length || building || rangeInvalid} title={sessions.length ? 'Opens the report for the chosen dates, to print or save as PDF' : 'No sessions to report yet'}>
              <FileIcon />
              <span>{building ? 'Building report…' : startDate && startDate === endDate ? `Open report · ${rangeLabel(startDate)}` : `Open report · ${rangeLabel(startDate)} – ${rangeLabel(endDate)}`}</span>
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
              {shownEntries.length} session{shownEntries.length === 1 ? '' : 's'} on {shownDays} day{shownDays === 1 ? '' : 's'}, {rangeLabel(startDate)} – {rangeLabel(endDate)} · compliance is the day's total (≥ 4 h)
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
                      <th><span className="sr-only">Report</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEntries.map((report) => (
                      <React.Fragment key={report.id}>
                      <tr>
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
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {/* One day's report: every session of that date, not just this row. */}
                          {report.dayKey && (
                            <button type="button" className="day-report-btn" disabled={building}
                              onClick={() => handleGeneratePDF(report.dayKey, report.dayKey)}
                              title={`Therapy report for ${rangeLabel(report.dayKey)} (all sessions that day)`}>
                              <FileIcon /> Day report
                            </button>
                          )}
                          {report.record && (
                            <button type="button" className="day-report-btn" style={{ marginLeft: 6 }}
                              aria-expanded={openLog === report.id}
                              onClick={() => setOpenLog((id) => (id === report.id ? null : report.id))}
                              title="How this session was worked out, with its raw payload">
                              {openLog === report.id ? 'Hide log' : 'Log'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {openLog === report.id && report.record && (
                        <tr className="session-log-row">
                          <td colSpan={8}><SessionLog record={report.record} /></td>
                        </tr>
                      )}
                      </React.Fragment>
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
                {reportEntries.length
                  ? `No sessions between ${rangeLabel(startDate)} and ${rangeLabel(endDate)}. Pick other dates or use a quick range.`
                  : 'No sessions for this device yet. Use Sync reports to pull them from the device.'}
              </div>
            )}
          </div>
        </GlassCard>
      )}

    </div>
  );
}
