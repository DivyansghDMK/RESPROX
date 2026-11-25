// src/pages/SdCardReport.jsx
//
// Public page (/sd-report, no sign-in) that DeckMount sends to a patient or
// clinic: choose the REPORTFL.TXT or .td1 file from the device's SD card and
// open the same therapy report the portal prints, for a single day or the
// last 7, 30 or 90 days.
//
// Everything runs in this browser. The file is never uploaded, so the page
// needs no account and no server.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseReportFile, parseTd1File, isTd1Data, dateRangeOf, daysFromRecords } from '../services/reportFileParser';
// Imported up front, not on click: the report opens in a new window, and a
// window opened after an await is blocked as a pop-up on most phones.
import { buildTherapyReportHTML, openTherapyReport } from '../services/therapyReport';
import { RANGE_PRESETS as PRESETS, presetRange } from '../services/reportRange';
import ThemeToggle from '../components/ThemeToggle';
import TherapyCalendar from '../components/TherapyCalendar';
import { calendarSummary } from '../services/therapyCalendar';

const MAX_BYTES = 8 * 1024 * 1024;
const today = () => localKeyNow(new Date());
function localKeyNow(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole years from a YYYY-MM-DD birth date to today; '' when it isn't one. */
export function ageFrom(dob) {
  const d = new Date(`${dob}T00:00:00`);
  if (!dob || Number.isNaN(d.getTime())) return '';
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) years -= 1;
  return years >= 0 ? String(years) : '';
}

const label = (key) => (key
  ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${key}T00:00:00`))
  : '…');

function readError(file, bytes, binary) {
  if (!bytes.length) return 'This file is empty. Check you picked the right file from the SD card.';
  return binary
    ? `No therapy sessions could be read from ${file.name}. It may be damaged or not a DeckMount .td1 file.`
    : `No therapy sessions could be read from ${file.name}. Pick REPORTFL.TXT or the .td1 file from the device's SD card.`;
}

export default function SdCardReport() {
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [range, setRange] = useState({ start: '', end: '' });
  const [singleDay, setSingleDay] = useState(false);
  const [preset, setPreset] = useState('all');
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [fallbackUrl, setFallbackUrl] = useState(null);
  // On a single day, the sessions left out of the report (by line number).
  const [leftOut, setLeftOut] = useState(() => new Set());
  const inputRef = useRef(null);

  const dataRange = useMemo(() => (parsed ? dateRangeOf(parsed) : { start: '', end: '' }), [parsed]);

  const ingest = useCallback(async (file) => {
    if (!file || reading) return;
    setReading(true);
    setError(null);
    setFallbackUrl(null);
    try {
      if (file.size > MAX_BYTES) throw new Error(`This file is ${(file.size / 1048576).toFixed(1)} MB; the device's report file is far smaller. Check you picked REPORTFL.TXT or the .td1 file.`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const binary = isTd1Data(bytes) || /\.td1$/i.test(file.name);
      const result = binary ? parseTd1File(bytes, { fileName: file.name }) : parseReportFile(new TextDecoder().decode(bytes));
      if (!result.records.length) throw new Error(readError(file, bytes, binary));
      const whole = dateRangeOf(result);
      setParsed(result);
      setFileName(file.name);
      // Opens on the last 30 days, the usual review window.
      setRange(presetRange(30, whole));
      setPreset(30);
      setSingleDay(false);
    } catch (e) {
      setParsed(null);
      setFileName('');
      setError(e?.message || 'This file could not be read.');
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [reading]);

  const choose = (days) => {
    const next = presetRange(days, dataRange);
    if (!next) return;
    setSingleDay(days === 1);
    setPreset(days);
    // Single day starts on the last day in the file; pick another with the date.
    setRange(days === 1 ? { start: next.end, end: next.end } : next);
  };

  const calendarDays = useMemo(() => calendarSummary(parsed?.days || []), [parsed]);
  const pickDates = (start, end) => { setSingleDay(start === end); setPreset(start === end ? 1 : null); setRange({ start, end }); };

  const rangeInvalid = Boolean(range.start && range.end && range.start > range.end);

  // One day picked: its sessions, each with a tick box; all ticked to start with.
  const oneDay = Boolean(range.start) && range.start === range.end;
  const daySessions = useMemo(() => (parsed && oneDay
    ? parsed.records.filter((r) => r.dayKey === range.start).sort((a, b) => a.start - b.start)
    : []), [parsed, oneDay, range.start]);
  useEffect(() => { setLeftOut(new Set()); }, [parsed, range.start, range.end]);
  const chosen = daySessions.filter((r) => !leftOut.has(r.lineNo));
  const toggleSession = (lineNo) => setLeftOut((s) => {
    const next = new Set(s);
    if (next.has(lineNo)) next.delete(lineNo); else next.add(lineNo);
    return next;
  });
  const sessionsInRange = useMemo(() => (parsed
    ? parsed.records.filter((r) => r.dayKey >= range.start && r.dayKey <= range.end).length
    : 0), [parsed, range]);

  const deviceData = useMemo(() => (parsed ? {
    serial: parsed.serial || '—',
    model: '—',
    sourceLabel: `the device's SD card (${fileName})`,
    settings: { ...parsed.settings, serial: parsed.serial || parsed.settings?.serial },
    patient: { name: name.trim(), id: parsed.serial || '', dob, age: age.trim(), gender },
    sessions: parsed.days,
  } : null), [parsed, fileName, name, dob, age, gender]);

  const openReport = () => {
    if (!parsed || rangeInvalid) return;
    setError(null);
    setFallbackUrl(null);
    // Some of the day's sessions unticked: the report covers only the ticked ones.
    const partial = oneDay && leftOut.size > 0;
    if (partial && !chosen.length) { setError('Tick at least one session for the report.'); return; }
    const times = chosen.map((r) => `${r.startClock} – ${r.endClock}`).join(', ');
    const args = {
      deviceData,
      sessions: partial ? daysFromRecords(chosen) : parsed.days,
      startDate: range.start,
      endDate: range.end,
      note: partial ? `Selected ${chosen.length} of ${daySessions.length} sessions: ${times}` : undefined,
    };
    const result = openTherapyReport(args);
    if (result.ok) return;
    if (result.reason === 'build-failed') {
      setError(`The report could not be made from this file (${result.error?.message || result.error}). Please send the file to DeckMount support.`);
      return;
    }
    // Pop-ups blocked: offer the same report as a link the browser will open.
    try {
      const html = buildTherapyReportHTML(args);
      setFallbackUrl(URL.createObjectURL(new Blob([html], { type: 'text/html' })));
    } catch (e) {
      setError(`The report could not be opened: ${e?.message || e}.`);
    }
  };

  const reset = () => {
    setParsed(null); setFileName(''); setError(null); setFallbackUrl(null);
    setRange({ start: '', end: '' });
  };

  const rangeText = range.start && range.start === range.end ? label(range.start) : `${label(range.start)} – ${label(range.end)}`;

  return (
    <div className="sdr-page">
      <ThemeToggle className="sdr-theme" />
      <header className="sdr-head">
        <img src="/deckmount-logo.png" alt="DeckMount" className="sdr-logo" />
        <h1>Therapy report from your SD card</h1>
        <p>Make a printable therapy report from your DeckMount CPAP's SD card, for one day or the last 7, 30 or 90 days.</p>
      </header>

      <main className="sdr-card">
        <section className="sdr-step">
          <h2><span className="sdr-num">1</span> Choose the file from the SD card</h2>
          <p className="sdr-help">Take the SD card out of the device and open it on this computer or phone. Pick <b>REPORTFL.TXT</b> or the file ending in <b>.td1</b> (for example CVT3000001.td1).</p>
          {!parsed ? (
            <label
              className={`sdr-drop${dragging ? ' over' : ''}${reading ? ' busy' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); ingest(e.dataTransfer.files?.[0]); }}
            >
              <input ref={inputRef} type="file" accept=".txt,.TXT,.td1,.TD1,text/plain" onChange={(e) => ingest(e.target.files?.[0])} disabled={reading} />
              <span className="sdr-drop-icon" aria-hidden="true">⬆</span>
              <b>{reading ? 'Reading the file…' : 'Choose file'}</b>
              <span>or drag it here</span>
            </label>
          ) : (
            <div className="sdr-file">
              <div>
                <b>{fileName}</b>
                <span>
                  {parsed.serial ? `Device ${parsed.serial} · ` : ''}
                  {parsed.records.length} sessions · {label(dataRange.start)} – {label(dataRange.end)}
                </span>
              </div>
              <button type="button" className="sdr-link" onClick={reset}>Choose another file</button>
            </div>
          )}
          <p className="sdr-privacy">The file is read inside this browser. It is not uploaded or sent anywhere.</p>
        </section>

        <section className={`sdr-step${parsed ? '' : ' off'}`} aria-disabled={!parsed}>
          <h2><span className="sdr-num">2</span> Pick the dates</h2>
          <div className="sdr-presets" role="group" aria-label="Quick date ranges">
            {PRESETS.map(([d, text]) => (
              <button key={text} type="button" disabled={!parsed} onClick={() => choose(d)}
                className={parsed && preset === d ? 'on' : ''} aria-pressed={parsed ? preset === d : undefined}>{text}</button>
            ))}
          </div>
          <div className="sdr-dates">
            <label>
              <span>{singleDay ? 'Day' : 'From'}</span>
              <input type="date" value={range.start} disabled={!parsed}
                min={dataRange.start || undefined} max={(singleDay ? dataRange.end : range.end) || undefined}
                onChange={(e) => { const v = e.target.value; setPreset(singleDay ? 1 : null); setRange((r) => (singleDay ? { start: v, end: v } : { ...r, start: v })); }} />
            </label>
            {!singleDay && (
              <label>
                <span>To</span>
                <input type="date" value={range.end} disabled={!parsed}
                  min={range.start || undefined} max={dataRange.end || undefined}
                  onChange={(e) => { const v = e.target.value; setPreset(null); setRange((r) => ({ ...r, end: v })); }} />
              </label>
            )}
          </div>
          {parsed && dataRange.end && (
            <TherapyCalendar byDay={calendarDays} dataEnd={dataRange.end} selection={range} onPick={pickDates}
              onReport={() => openReport()} />
          )}
          {parsed && !rangeInvalid && (
            <p className="sdr-help">{sessionsInRange ? `${sessionsInRange} session${sessionsInRange === 1 ? '' : 's'} on these dates.` : 'No therapy on these dates. The report will show them as unused.'}</p>
          )}
          {rangeInvalid && <p className="sdr-error" role="alert">The “To” date is before the “From” date.</p>}
          {daySessions.length > 1 && (
            <fieldset className="sdr-sessions">
              <legend>Sessions in the report <small>({chosen.length} of {daySessions.length} ticked)</small></legend>
              {daySessions.map((r) => {
                const h = r.durationMinutes;
                const ahi = h > 0 ? (r.events / (h / 60)).toFixed(1) : '—';
                return (
                  <label key={r.lineNo} className={leftOut.has(r.lineNo) ? 'off' : undefined}>
                    <input type="checkbox" checked={!leftOut.has(r.lineNo)} onChange={() => toggleSession(r.lineNo)} />
                    <b>{r.startClock} – {r.endClock}</b>
                    <span>{Math.floor(h / 60)}h {h % 60}m · AHI {ahi} · leak {r.leakValid ? `${r.leak} L/min` : '—'}{r.suspect ? ' · not counted' : ''}</span>
                  </label>
                );
              })}
              <p className="sdr-help">Untick a session to leave it out, for example a short test run.</p>
            </fieldset>
          )}
        </section>

        <section className={`sdr-step${parsed ? '' : ' off'}`}>
          <h2><span className="sdr-num">3</span> Patient details <small>(optional, printed on the report)</small></h2>
          <div className="sdr-dates">
            <label className="sdr-wide">
              <span>Name</span>
              <input className="sdr-name" type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={!parsed} placeholder="Patient name" maxLength={80} autoComplete="name" />
            </label>
          </div>
          <div className="sdr-dates" style={{ marginTop: 12 }}>
            <label>
              <span>Date of birth</span>
              <input type="date" value={dob} max={today()} disabled={!parsed}
                onChange={(e) => { setDob(e.target.value); setAge(ageFrom(e.target.value)); }} />
            </label>
            <label>
              <span>Age (years)</span>
              <input type="number" inputMode="numeric" min="0" max="120" step="1" value={age} disabled={!parsed || Boolean(dob)}
                title={dob ? 'Worked out from the date of birth' : undefined}
                onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="e.g. 54" />
            </label>
            <label>
              <span>Gender</span>
              <select value={gender} onChange={(e) => setGender(e.target.value)} disabled={!parsed}>
                <option value="">Not stated</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </label>
          </div>
        </section>

        {error && <div className="sdr-error-box" role="alert">{error}</div>}

        <button type="button" className="sdr-go" onClick={openReport} disabled={!parsed || rangeInvalid || !range.start}>
          {parsed ? `Open report · ${rangeText}${oneDay && leftOut.size ? ` · ${chosen.length} of ${daySessions.length} sessions` : ''}` : 'Open report'}
        </button>
        {fallbackUrl && (
          <p className="sdr-help" role="status">
            Your browser blocked the new window. <a href={fallbackUrl} target="_blank" rel="noopener">Open the report here</a>.
          </p>
        )}
        <p className="sdr-help sdr-center">In the report, choose <b>Print</b>, then <b>Save as PDF</b> to keep or share it.</p>
      </main>

      <footer className="sdr-foot">
        DeckMount · 683, Udyog Vihar, Phase V, Gurugram 122016 · <a href="mailto:support@deckmount.in">support@deckmount.in</a>
      </footer>
    </div>
  );
}
