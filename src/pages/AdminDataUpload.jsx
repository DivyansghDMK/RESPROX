// src/pages/AdminDataUpload.jsx
//
// Admin tool: upload a REPORTFL.TXT pulled off a device (SD card / USB) and
// generate the same printable therapy report the live-telemetry path produces.
//
// The whole pipeline runs in the browser — the file never leaves the machine,
// which matters because it is patient data and this screen is often used on a
// clinic laptop with no upload path to our backend.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import GlassCard from '../components/GlassCard';
import { FileIcon, DownloadIcon, InfoIcon, CheckIcon, TrashIcon } from '../components/Icons';
import { parseReportFile, dateRangeOf, daysToCSV, PARSER_CONSTANTS } from '../services/reportFileParser';

// recharts is ~300 kB; this page is useful before any chart is needed, so the
// charts arrive on their own chunk once a file has actually been parsed.
const ReportCharts = React.lazy(() => import('../components/ReportCharts'));

const ACCEPT = '.txt,.TXT,.csv,.log,text/plain';
const MAX_BYTES = 8 * 1024 * 1024;
const PREVIEW_ROWS = 12;

// Clinical review is normally a 30- or 90-night window; a whole file at once is
// the exception, not the default.
const QUICK_RANGES = [
  { label: 'Last 7', nights: 7 },
  { label: 'Last 30', nights: 30 },
  { label: 'Last 90', nights: 90 },
  { label: 'All', nights: null },
];

function hm(hours) {
  if (!Number.isFinite(hours)) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 60 ? `${h + 1}h 00m` : `${h}h ${String(m).padStart(2, '0')}m`;
}

function StatTile({ label, value, sub, tone = 'default' }) {
  const tones = {
    default: { color: 'var(--text)' },
    good: { color: '#0f6e56' },
    warn: { color: '#854f0b' },
    bad: { color: '#a32d2d' },
  };
  return (
    <div style={{
      background: 'rgba(255,255,255,0.6)', border: '1px solid var(--line)',
      borderRadius: 12, padding: '14px 16px', minWidth: 0,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--muted)' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, ...tones[tone] }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Notice({ tone = 'info', title, children }) {
  const palette = {
    info: { bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af' },
    warn: { bg: '#fffbeb', border: '#fde68a', color: '#854d0e' },
    error: { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c' },
    good: { bg: '#f0fdf4', border: '#bbf7d0', color: '#166534' },
  }[tone];
  return (
    <div style={{
      background: palette.bg, border: `1px solid ${palette.border}`, color: palette.color,
      borderRadius: 10, padding: '12px 16px', fontSize: 13, lineHeight: 1.6, marginTop: 14,
    }}>
      {title && <strong style={{ display: 'block', marginBottom: 4 }}>{title}</strong>}
      {children}
    </div>
  );
}

export default function AdminDataUpload() {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showAllErrors, setShowAllErrors] = useState(false);

  const [range, setRange] = useState({ start: '', end: '' });
  const [patient, setPatient] = useState({ name: '', id: '', dob: '', gender: '' });
  const [serial, setSerial] = useState('');
  const [model, setModel] = useState('');

  const reset = useCallback(() => {
    setParsed(null); setError(null); setFileName(''); setFileSize(0);
    setRange({ start: '', end: '' });
    setSerial(''); setShowAllErrors(false);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const ingest = useCallback(async (file) => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      if (file.size > MAX_BYTES) {
        throw new Error(`File is ${(file.size / 1048576).toFixed(1)} MB — the limit is ${MAX_BYTES / 1048576} MB.`);
      }
      const text = await file.text();
      const result = parseReportFile(text);

      if (!result.records.length) {
        throw new Error(
          result.errors.length
            ? `No usable session records found. ${result.errors.length} line(s) could not be read — check this is a REPORTFL.TXT session log.`
            : 'The file is empty.'
        );
      }

      setParsed(result);
      setFileName(file.name);
      setFileSize(file.size);
      setRange(dateRangeOf(result));
      setSerial(result.serial || '');
      // Only prefill the patient ID when it is still untouched, so re-uploading
      // a second file does not quietly overwrite what the operator typed.
      setPatient((prev) => ({ ...prev, id: prev.id || result.serial || '' }));
    } catch (err) {
      setParsed(null);
      setError(err.message || 'Could not read the file.');
    } finally {
      setBusy(false);
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    ingest(e.dataTransfer.files?.[0]);
  }, [ingest]);

  // Days actually inside the chosen range — the report applies the same filter,
  // so the counts on screen must be the counts in the PDF.
  const daysInRange = useMemo(() => {
    if (!parsed) return [];
    return parsed.days.filter((d) => (
      (!range.start || d.dayKey >= range.start) && (!range.end || d.dayKey <= range.end)
    ));
  }, [parsed, range]);

  const rangeStats = useMemo(() => {
    const used = daysInRange.filter((d) => d.usage_hours > 0);
    const hours = used.reduce((sum, d) => sum + d.usage_hours, 0);
    const events = daysInRange.reduce((sum, d) => sum + d.events, 0);
    return {
      days: daysInRange.length,
      used: used.length,
      compliant: used.filter((d) => d.usage_hours >= 4).length,
      hours,
      avg: used.length ? hours / used.length : NaN,
      ahi: hours > 0 ? events / hours : NaN,
      sessions: daysInRange.reduce((sum, d) => sum + d.sessionCount, 0),
    };
  }, [daysInRange]);

  const applyQuickRange = useCallback((q) => {
    if (!parsed?.days.length) return;
    const all = parsed.days;
    if (!q.nights) { setRange(dateRangeOf(parsed)); return; }
    const slice = all.slice(Math.max(0, all.length - q.nights));
    setRange({ start: slice[0].dayKey, end: all[all.length - 1].dayKey });
  }, [parsed]);

  // Which preset (if any) the current range corresponds to.
  const activeQuickRange = useMemo(() => {
    if (!parsed?.days.length) return null;
    const all = parsed.days;
    const inRange = all.filter((d) => (!range.start || d.dayKey >= range.start) && (!range.end || d.dayKey <= range.end));
    if (inRange.length === all.length) return 'All';
    const match = QUICK_RANGES.find((q) => q.nights && q.nights === inRange.length);
    return match?.label ?? null;
  }, [parsed, range]);

  const deviceData = useMemo(() => {
    if (!parsed) return null;
    return {
      serial: serial || parsed.serial || '—',
      model: model || '—',
      sourceLabel: `an uploaded device file (${fileName})`,
      settings: { ...parsed.settings, serial: serial || parsed.settings.serial },
      patient: {
        name: patient.name.trim(),
        id: patient.id.trim() || serial,
        dob: patient.dob,
        gender: patient.gender,
      },
      sessions: parsed.days,
    };
  }, [parsed, serial, model, patient, fileName]);

  const generate = useCallback(async () => {
    if (!parsed) return;
    const { openTherapyReport } = await import('../services/therapyReport');
    const result = openTherapyReport({
      deviceData,
      sessions: parsed.days,
      startDate: range.start,
      endDate: range.end,
      // The file records set pressure, never a measured trace.
      pressureSource: 'set',
    });
    if (!result.ok) {
      setError('The browser blocked the report window. Allow pop-ups for this site and try again.');
    }
  }, [parsed, deviceData, range]);

  const downloadCSV = useCallback(() => {
    const blob = new Blob([daysToCSV(daysInRange)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${serial || 'device'}-daily-${range.start || 'all'}-to-${range.end || 'all'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [daysInRange, serial, range]);

  const summary = parsed?.summary;
  const visibleErrors = showAllErrors ? parsed?.errors : parsed?.errors?.slice(0, 5);

  return (
    <div className="reports-page">
      <GlassCard>
        <div className="section-title">
          <h2>Upload Device Data File</h2>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 16px', lineHeight: 1.6 }}>
          Drop the <strong>REPORTFL.TXT</strong> copied from a device&apos;s SD card or USB export.
          Every session line is parsed, grouped into nights, and turned into the standard
          therapy report. The file is processed in this browser and is never uploaded.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
          aria-label="Choose a device data file"
          style={{
            border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--line)'}`,
            background: dragging ? '#eff6ff' : 'rgba(255,255,255,0.45)',
            borderRadius: 14, padding: '30px 20px', textAlign: 'center',
            cursor: 'pointer', transition: 'all .15s ease',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            style={{ display: 'none' }}
            onChange={(e) => ingest(e.target.files?.[0])}
          />
          <div style={{ fontSize: 30, marginBottom: 8, opacity: 0.5 }}>📄</div>
          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>
            {busy ? 'Reading file…' : 'Drop REPORTFL.TXT here, or click to browse'}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 6 }}>
            Plain-text session log · up to {MAX_BYTES / 1048576} MB
          </div>
        </div>

        {fileName && !error && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, marginTop: 14, padding: '10px 14px', flexWrap: 'wrap',
            background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
          }}>
            <span style={{ color: '#166534', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckIcon />
              <strong>{fileName}</strong>
              <span style={{ opacity: 0.75 }}>
                ({(fileSize / 1024).toFixed(0)} KB · {summary?.records} records · {summary?.days} days)
              </span>
            </span>
            <button className="icon-text-button remove" onClick={(e) => { e.stopPropagation(); reset(); }}>
              <TrashIcon />
              <span>Clear</span>
            </button>
          </div>
        )}

        {error && <Notice tone="error" title="Could not use this file">{error}</Notice>}
      </GlassCard>

      {parsed && (
        <>
          {/* ── What the file contains ─────────────────────────────────────── */}
          <GlassCard style={{ marginTop: 20 }}>
            <div className="section-title table-title-row">
              <h2>File Contents</h2>
              <span className="info-badge" style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                <InfoIcon /> Serial: {parsed.serial || 'not recorded'}
              </span>
            </div>

            <div style={{
              display: 'grid', gap: 12, marginTop: 4,
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            }}>
              <StatTile label="Sessions" value={summary.records} sub={`${summary.days} calendar days`} />
              <StatTile label="Days used" value={`${summary.usedDays}/${summary.days}`} sub="days with therapy" />
              <StatTile
                label="≥ 4 hours"
                value={summary.compliantDays}
                sub={`${summary.usedDays ? Math.round((summary.compliantDays / summary.usedDays) * 100) : 0}% of used days`}
                tone={summary.compliantDays / (summary.usedDays || 1) >= 0.7 ? 'good' : 'warn'}
              />
              <StatTile label="Total usage" value={hm(summary.totalHours)} sub={`avg ${hm(summary.avgHours)} / night`} />
              <StatTile
                label="AHI"
                value={Number.isFinite(summary.ahi) ? summary.ahi.toFixed(2) : '—'}
                sub={`${summary.events} events`}
                tone={summary.ahi <= 5 ? 'good' : summary.ahi <= 15 ? 'warn' : 'bad'}
              />
              <StatTile label="Mode" value={parsed.modeLabel || '—'} sub={`${parsed.settings.min_pressure}–${parsed.settings.max_pressure} cmH₂O`} />
            </div>

            {parsed.multipleSerials && (
              <Notice tone="warn" title="More than one serial number in this file">
                Records reference {parsed.serials.join(', ')}. A report covers one device, so confirm the
                serial below or split the file before generating.
              </Notice>
            )}

            {summary.dropped > 0 && (
              <Notice tone="warn" title={`${summary.dropped} line(s) skipped`}>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {visibleErrors.map((e) => (
                    <li key={e.lineNo}>
                      Line {e.lineNo}: {e.reason} — <code style={{ fontSize: 12 }}>{e.text.slice(0, 48)}{e.text.length > 48 ? '…' : ''}</code>
                    </li>
                  ))}
                </ul>
                {parsed.errors.length > 5 && (
                  <button
                    onClick={() => setShowAllErrors((v) => !v)}
                    style={{ marginTop: 8, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}
                  >
                    {showAllErrors ? 'Show fewer' : `Show all ${parsed.errors.length}`}
                  </button>
                )}
              </Notice>
            )}

            {summary.suspect > 0 && (
              <Notice tone="warn" title={`${summary.suspect} session(s) excluded from the statistics`}>
                Their own timestamps make them impossible as a single night — they end before they start,
                or run longer than {PARSER_CONSTANTS.MAX_SESSION_HOURS} hours. They are usually a device
                clock reset. Counting them would inflate usage, so they are left out of every figure above.
              </Notice>
            )}

            {summary.leakSentinel > 0 && (
              <Notice tone="warn" title={`Leak unavailable for ${summary.leakSentinel} of ${summary.records - summary.suspect} sessions`}>
                Those records carry {summary.leakSentinelValues.join(', ')} in the leak field. Values at or
                above {PARSER_CONSTANTS.LEAK_SENTINEL} are status codes rather than litres per minute
                (a real reading sits in the 0–30 range), so they are excluded from the leak average and the
                leak chart instead of being reported as a blown mask.
                <strong> Worth confirming the encoding with the firmware team.</strong>
              </Notice>
            )}
          </GlassCard>

          {/* ── Report details ─────────────────────────────────────────────── */}
          <GlassCard style={{ marginTop: 20 }}>
            <div className="section-title">
              <h2>Report Details</h2>
            </div>

            <div className="reports-filters-grid">
              <div className="input-field">
                <label htmlFor="up-serial">Device Serial</label>
                <input id="up-serial" type="text" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="From file" />
              </div>
              <div className="input-field">
                <label htmlFor="up-start">Start Date</label>
                <input id="up-start" type="date" value={range.start} min={parsed.days[0]?.dayKey} max={range.end || undefined} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} />
              </div>
              <div className="input-field">
                <label htmlFor="up-end">End Date</label>
                <input id="up-end" type="date" value={range.end} min={range.start || undefined} max={parsed.days[parsed.days.length - 1]?.dayKey} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
              </div>
            </div>

            <div className="reports-filters-grid" style={{ marginTop: 12 }}>
              <div className="input-field">
                <label htmlFor="up-name">Patient Name</label>
                <input id="up-name" type="text" value={patient.name} onChange={(e) => setPatient((p) => ({ ...p, name: e.target.value }))} placeholder="Shown on the report header" />
              </div>
              <div className="input-field">
                <label htmlFor="up-id">Patient ID</label>
                <input id="up-id" type="text" value={patient.id} onChange={(e) => setPatient((p) => ({ ...p, id: e.target.value }))} />
              </div>
              <div className="input-field">
                <label htmlFor="up-dob">Date of Birth</label>
                <input id="up-dob" type="date" value={patient.dob} onChange={(e) => setPatient((p) => ({ ...p, dob: e.target.value }))} />
              </div>
              <div className="input-field">
                <label htmlFor="up-gender">Gender</label>
                <select id="up-gender" value={patient.gender} onChange={(e) => setPatient((p) => ({ ...p, gender: e.target.value }))}>
                  <option value="">Not stated</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="input-field">
                <label htmlFor="up-model">Device Model</label>
                <input id="up-model" type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. CPAP VT30 D" />
              </div>
            </div>

            <div style={{ marginTop: 14, fontSize: 13, color: 'var(--muted)' }}>
              Selected range covers <strong style={{ color: 'var(--text)' }}>{rangeStats.days} day(s)</strong> ·{' '}
              {rangeStats.sessions} session(s) · {rangeStats.used} used · {rangeStats.compliant} at ≥ 4 h ·{' '}
              {hm(rangeStats.hours)} total · AHI {Number.isFinite(rangeStats.ahi) ? rangeStats.ahi.toFixed(2) : '—'}
            </div>

            {rangeStats.days === 0 && (
              <Notice tone="warn">No days fall inside this range — widen it before generating the report.</Notice>
            )}

            <div className="quick-range" role="group" aria-label="Quick date ranges">
              <span>Range</span>
              {QUICK_RANGES.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  className={activeQuickRange === q.label ? 'active' : ''}
                  onClick={() => applyQuickRange(q)}
                >
                  {q.label}{q.nights ? ' nights' : ''}
                </button>
              ))}
            </div>

            <div className="reports-actions-bar">
              <button className="icon-text-button" onClick={generate} disabled={rangeStats.days === 0}>
                <FileIcon />
                <span>Generate Therapy Report</span>
              </button>
              <button className="icon-text-button outline" onClick={downloadCSV} disabled={rangeStats.days === 0}>
                <DownloadIcon />
                <span>Download Daily CSV</span>
              </button>
            </div>
          </GlassCard>

          {/* ── Charts (the same series the report prints) ──────────────────── */}
          <GlassCard style={{ marginTop: 20 }}>
            <div className="section-title table-title-row">
              <h2>Therapy Charts</h2>
              <span className="info-badge">
                <InfoIcon /> {daysInRange.length} night(s) plotted
              </span>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 14px' }}>
              These are the charts the generated report contains, over the selected date range.
              Hover any bar for that night&apos;s exact values.
            </p>
            <React.Suspense fallback={<div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)' }}>Loading charts…</div>}>
              <ReportCharts days={daysInRange} />
            </React.Suspense>
          </GlassCard>

          {/* ── Parsed nights ──────────────────────────────────────────────── */}
          <GlassCard style={{ marginTop: 20 }}>
            <div className="section-title table-title-row">
              <h2>Parsed Nights</h2>
              <span className="info-badge">
                <InfoIcon /> {daysInRange.length} day(s) in range
              </span>
            </div>
            <div className="table-responsive">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Sessions</th>
                    <th>Usage</th>
                    <th>AHI</th>
                    <th>Events (C/O/H)</th>
                    <th>Leak</th>
                    <th>Set Pressure</th>
                    <th>Compliance</th>
                  </tr>
                </thead>
                <tbody>
                  {daysInRange.slice(0, PREVIEW_ROWS).map((d) => (
                    <tr key={d.dayKey}>
                      <td><strong>{d.date}</strong></td>
                      <td>
                        {d.sessionCount}
                        {d.suspectSessions > 0 && (
                          <span title="Excluded: impossible duration" style={{ color: '#a32d2d', marginLeft: 6, fontSize: 12 }}>
                            −{d.suspectSessions}
                          </span>
                        )}
                      </td>
                      <td>{hm(d.usage_hours)}</td>
                      <td>{d.ahi} / hr</td>
                      <td>{d.csa} / {d.osa} / {d.hsa}</td>
                      <td>{d.mask_leak == null ? <span style={{ opacity: 0.45 }}>—</span> : `${d.mask_leak} L/min`}</td>
                      <td>{d.pressure_95 == null ? '—' : `${d.pressure_95} cmH₂O`}</td>
                      <td>
                        <span className={`compliance-tag ${d.usage_hours >= 4 ? 'pass' : 'fail'}`}>
                          {d.usage_hours >= 4 ? 'Passed' : 'Failed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {daysInRange.length > PREVIEW_ROWS && (
                <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 10 }}>
                  Showing the first {PREVIEW_ROWS} of {daysInRange.length} days. The report and the CSV
                  cover all of them.
                </p>
              )}
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}
