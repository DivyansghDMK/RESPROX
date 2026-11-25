import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CALENDAR_DAYS, HIGH_AHI, calendarWindow, shiftKey } from '../services/therapyCalendar';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STATUS_TEXT = { met: '4 h or more', low: 'Used, under 4 h', none: 'No therapy' };
const fmt = (key, opts) => new Intl.DateTimeFormat('en-GB', opts).format(new Date(`${key}T00:00:00`));
const hm = (m) => `${Math.floor(m / 60)}h ${m % 60}m`;
const order = (a, b) => (a <= b ? [a, b] : [b, a]);

/**
 * 30 days of therapy, every date shown and coloured by how that night went.
 *
 * Click a date to pick that day and see its sessions; drag across dates, or
 * shift-click, to pick a range. In "From – to" mode (or after a double tap on
 * a date) the first tap is where the report starts and the second where it
 * ends, which is how a range is picked on a phone. Arrow keys move between
 * dates, Enter picks.
 * `records` (reportFileParser records) fill the day panel's session list.
 */
export default function TherapyCalendar({ byDay, records = [], dataEnd, selection, onPick, onReport }) {
  const [end, setEnd] = useState(dataEnd);
  useEffect(() => { setEnd(dataEnd); }, [dataEnd]);

  const selStart = selection?.start || '';
  const selEnd = selection?.end || selStart;
  const single = Boolean(selStart) && selStart === selEnd;

  // Dates typed into the inputs outside the window bring the window to them.
  useEffect(() => {
    if (!selEnd || !end) return;
    if (selEnd > end || selEnd < shiftKey(end, -(CALENDAR_DAYS - 1))) setEnd(selEnd);
  }, [selEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  const win = useMemo(() => (end ? calendarWindow(byDay, end) : null), [byDay, end]);
  const sessionsByDay = useMemo(() => {
    const m = new Map();
    for (const r of records) {
      if (!m.has(r.dayKey)) m.set(r.dayKey, []);
      m.get(r.dayKey).push(r);
    }
    for (const list of m.values()) list.sort((a, b) => a.start - b.start);
    return m;
  }, [records]);

  // "From – to" mode: `anchor` is the first date tapped, waiting for the last.
  const [rangeMode, setRangeMode] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const [hoverKey, setHoverKey] = useState(null);
  // The click that ends a double tap arrives after the range has started from it.
  const startedAt = useRef(0);
  const startRange = (key) => { setRangeMode(true); setAnchor(key); startedAt.current = Date.now(); };
  const tapRange = (key) => {
    if (Date.now() - startedAt.current < 300) return;
    if (!anchor) { setAnchor(key); return; }
    onPick?.(...order(anchor, key));
    setAnchor(null);
  };
  const setMode = (on) => { setRangeMode(on); setAnchor(null); };

  // Drag to pick a range: where it started and where the pointer is now.
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  dragRef.current = drag;
  const lastTap = useRef(null);
  useEffect(() => {
    const up = () => {
      const d = dragRef.current;
      if (!d) return;
      setDrag(null);
      const [a, b] = order(d.from, d.to);
      onPick?.(a, b);
      // A second tap on the same date soon after: start a range from it.
      const now = Date.now();
      if (a === b && lastTap.current?.key === a && now - lastTap.current.t < 400) {
        lastTap.current = null;
        startRange(a);
      } else {
        lastTap.current = a === b ? { key: a, t: now } : null;
      }
    };
    // A touch that turns into a scroll is not a pick.
    const cancel = () => setDrag(null);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); };
  }, [onPick]);

  const [focusKey, setFocusKey] = useState(null);
  const gridRef = useRef(null);
  useEffect(() => {
    if (focusKey && gridRef.current?.contains(document.activeElement)) {
      gridRef.current.querySelector(`[data-key="${focusKey}"]`)?.focus();
    }
  }, [focusKey, end]);

  if (!win) return null;

  const first = win.cells[0].key;
  const lead = (new Date(`${first}T00:00:00`).getDay() + 6) % 7;
  const preview = drag ? order(drag.from, drag.to) : anchor ? order(anchor, hoverKey || anchor) : null;
  // A range is a band joining its dates, its two ends filled in; one picked
  // date is filled in on its own. `col` is the weekday column, where the band
  // breaks onto the next row.
  const band = preview || (selStart && !single ? [selStart, selEnd] : null);
  const mark = (key, col) => {
    if (anchor && key === anchor && !drag && (!hoverKey || hoverKey === anchor)) return ' anchor';
    if (band && key >= band[0] && key <= band[1]) {
      if (band[0] === band[1]) return preview ? ' preview-end' : ' picked';
      const ends = (key === band[0] ? ' band-start' : '') + (key === band[1] ? ' band-end' : '');
      const edges = (col === 0 ? ' row-start' : '') + (col === 6 ? ' row-end' : '');
      const end = key === band[0] || key === band[1];
      return ` band${preview ? ' preview' : ''}${ends}${edges}${end ? (preview ? ' preview-end' : ' picked') : ''}`;
    }
    if (!preview && single && key === selStart) return ' picked';
    return '';
  };
  const RING = 2 * Math.PI * 19;

  const keyAt = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-key]')?.dataset.key;
  const onPointerDown = (e, key) => {
    if (e.button !== 0 || rangeMode) return;
    if (e.shiftKey && selStart) { onPick?.(...order(selStart, key)); return; }
    setDrag({ from: key, to: key });
  };
  const onPointerMove = (e) => {
    if (anchor && e.pointerType === 'mouse') { setHoverKey(keyAt(e) || null); return; }
    if (!drag) return;
    const key = keyAt(e);
    if (key && key !== drag.to) setDrag((d) => d && { ...d, to: key });
  };

  const tabKey = focusKey && win.cells.some((c) => c.key === focusKey) ? focusKey
    : single && win.cells.some((c) => c.key === selStart) ? selStart : win.cells[win.cells.length - 1].key;
  const onKeyDown = (e, key) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) {
      e.preventDefault();
      const next = shiftKey(key, step);
      if (next > end) setEnd(next);
      else if (next < first) setEnd(shiftKey(next, CALENDAR_DAYS - 1));
      setFocusKey(next);
      if (e.shiftKey && selStart) onPick?.(...order(selStart, next));
    } else if (e.key === 'Escape' && rangeMode) {
      setMode(false);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (rangeMode) tapRange(key);
      else if (e.shiftKey && selStart) onPick?.(...order(selStart, key));
      else onPick?.(key, key);
    }
  };

  // The picked day's panel, or a summary of the picked range.
  const stepDay = (n) => {
    const next = shiftKey(selStart, n);
    onPick?.(next, next);
  };
  const dayInfo = single ? byDay.get(selStart) : null;
  const daySessions = single ? sessionsByDay.get(selStart) || [] : [];
  const rangeStats = (() => {
    if (single || !selStart) return null;
    let days = 0; let used = 0; let met = 0; let minutes = 0;
    for (let k = selStart; k <= selEnd && days < 4000; k = shiftKey(k, 1)) {
      days += 1;
      const info = byDay.get(k);
      if (info?.minutes > 0) { used += 1; minutes += info.minutes; if (info.minutes >= 240) met += 1; }
    }
    return { days, used, met, avg: used ? Math.round(minutes / used) : 0 };
  })();

  return (
    <div className="therapy-cal">
      <div className="therapy-cal-head">
        <button type="button" onClick={() => setEnd(shiftKey(end, -CALENDAR_DAYS))} aria-label="Earlier 30 days">←</button>
        <strong>{fmt(first, { day: 'numeric', month: 'short' })} – {fmt(end, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
        <button type="button" onClick={() => setEnd(shiftKey(end, CALENDAR_DAYS))} disabled={end >= dataEnd} aria-label="Later 30 days">→</button>
        {end !== dataEnd && <button type="button" className="therapy-cal-latest" onClick={() => setEnd(dataEnd)}>Latest</button>}
        <button type="button" className="therapy-cal-latest" onClick={() => onPick?.(first, end)} title="Pick these 30 days for the report">Pick these 30 days</button>
        <div className="therapy-cal-mode" role="group" aria-label="How to pick dates">
          <button type="button" className={rangeMode ? '' : 'on'} aria-pressed={!rangeMode} onClick={() => setMode(false)}>One day</button>
          <button type="button" className={rangeMode ? 'on' : ''} aria-pressed={rangeMode} onClick={() => setMode(true)}>From – to</button>
        </div>
        <span className="therapy-cal-sum">
          {win.used} of {CALENDAR_DAYS} days used · {win.met} days ≥ 4 h ({win.compliance}%)
        </span>
      </div>

      {rangeMode && (
        <p className="therapy-cal-step" role="status">
          {anchor
            ? <>From <b>{fmt(anchor, { day: 'numeric', month: 'short' })}</b>: now tap the <b>last date</b> of the report. <button type="button" onClick={() => setAnchor(null)}>Start again</button></>
            : <>Tap the <b>first date</b> of the report, then the <b>last date</b>.</>}
        </p>
      )}

      <div className={`therapy-cal-grid${drag || anchor ? ' is-dragging' : ''}${rangeMode ? ' range-mode' : ''}`} role="grid" aria-label="Therapy by date" ref={gridRef} onPointerMove={onPointerMove}>
        {WEEKDAYS.map((w) => <div key={w} className="therapy-cal-wd" role="columnheader">{w}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} aria-hidden="true" />)}
        {win.cells.map((c, i) => {
          const day = Number(c.key.slice(8));
          const col = (lead + i) % 7;
          const used = c.status !== 'none';
          const label = [
            fmt(c.key, { weekday: 'long', day: 'numeric', month: 'long' }),
            STATUS_TEXT[c.status],
            used ? `usage ${hm(c.info.minutes)}` : null,
            used && c.info.ahi != null ? `AHI ${c.info.ahi}` : null,
          ].filter(Boolean).join(', ');
          return (
            <button key={c.key} type="button" role="gridcell" data-key={c.key}
              className={`therapy-cal-day ${c.status}${mark(c.key, col)}${c.key > dataEnd ? ' future' : ''}`}
              tabIndex={c.key === tabKey ? 0 : -1}
              aria-selected={Boolean(mark(c.key, col))} aria-label={label}
              onPointerDown={(e) => onPointerDown(e, c.key)}
              onClick={() => { if (rangeMode) tapRange(c.key); }}
              onKeyDown={(e) => onKeyDown(e, c.key)}
              onFocus={() => setFocusKey(c.key)}>
              {(day === 1 || i === 0) && <span className="therapy-cal-mon" aria-hidden="true">{fmt(c.key, { month: 'short' })}</span>}
              <span className="therapy-cal-ring" aria-hidden="true">
                {/* The ring fills with the night's use, full at 8 h; a dotted ring is a night without therapy. */}
                <svg viewBox="0 0 44 44">
                  <circle className="therapy-cal-track" cx="22" cy="22" r="19" />
                  {used && (
                    <circle className="therapy-cal-arc" cx="22" cy="22" r="19" transform="rotate(-90 22 22)"
                      strokeDasharray={`${Math.max(0.04, Math.min(1, c.info.minutes / 480)) * RING} ${RING}`} />
                  )}
                </svg>
                <span className="therapy-cal-num">{day}</span>
                {c.highAhi && <span className="therapy-cal-ahi" />}
              </span>
              <span className="therapy-cal-hrs" aria-hidden="true">{used ? `${(c.info.minutes / 60).toFixed(1)}h` : ''}</span>
              <span className={`therapy-cal-tip${col < 2 ? ' left' : col > 4 ? ' right' : ''}`} aria-hidden="true">
                <b>{fmt(c.key, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
                <span className={`therapy-cal-chip ${c.status}`}>{STATUS_TEXT[c.status]}</span>
                {used && (
                  <>
                    <span>Usage {hm(c.info.minutes)} · {c.info.sessions} session{c.info.sessions === 1 ? '' : 's'}</span>
                    {c.info.ahi != null && <span>AHI {c.info.ahi}{c.highAhi ? ' (high)' : ''}</span>}
                    {c.info.leak ? <span>Leak {c.info.leak} L/min</span> : null}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="therapy-cal-legend">
        <span><i className="met" /> 4 h or more</span>
        <span><i className="low" /> Used, under 4 h</span>
        <span><i className="none" /> No therapy</span>
        <span><i className="fill" /> Ring fills with hours (full at 8 h)</span>
        <span><i className="ahi" /> AHI ≥ {HIGH_AHI}</span>
        <span className="therapy-cal-hint">{rangeMode ? 'Tap the first date, then the last' : 'Click a date · double-tap or drag for a range'}</span>
      </div>

      {single && (
        <div className="therapy-cal-panel" aria-live="polite">
          <div className="therapy-cal-panel-head">
            <button type="button" onClick={() => stepDay(-1)} aria-label="Day before">‹</button>
            <strong>{fmt(selStart, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>
            <button type="button" onClick={() => stepDay(1)} disabled={selStart >= dataEnd} aria-label="Day after">›</button>
            <span className={`therapy-cal-chip ${dayInfo?.minutes > 0 ? (dayInfo.minutes >= 240 ? 'met' : 'low') : 'none'}`}>
              {STATUS_TEXT[dayInfo?.minutes > 0 ? (dayInfo.minutes >= 240 ? 'met' : 'low') : 'none']}
            </span>
            {onReport && dayInfo?.minutes > 0 && (
              <button type="button" className="therapy-cal-report" onClick={() => onReport(selStart, selStart)}>Report for this day</button>
            )}
          </div>
          {dayInfo?.minutes > 0 ? (
            <>
              <div className="therapy-cal-stats">
                <div><span>Usage</span><b>{hm(dayInfo.minutes)}</b></div>
                <div><span>Sessions</span><b>{dayInfo.sessions}</b></div>
                <div><span>AHI</span><b className={dayInfo.ahi >= HIGH_AHI ? 'bad' : undefined}>{dayInfo.ahi ?? '—'}</b></div>
                <div><span>Max leak</span><b>{dayInfo.leak ? `${dayInfo.leak} L/min` : '—'}</b></div>
              </div>
              {daySessions.length > 0 && (
                <ul className="therapy-cal-sessions">
                  {daySessions.map((r) => {
                    const ahi = r.durationMinutes > 0 ? (r.events / (r.durationMinutes / 60)).toFixed(1) : '—';
                    return (
                      <li key={`${r.lineNo ?? ''}-${r.start.getTime()}`} className={r.suspect ? 'suspect' : undefined}>
                        <b>{r.startClock} – {r.endClock}</b>
                        <span>{hm(r.durationMinutes)}</span>
                        <span>AHI {ahi}</span>
                        <span>Leak {r.leakValid ? `${r.leak} L/min` : '—'}</span>
                        <span>{r.sessionPressure ? `${r.sessionPressure} cmH₂O` : '—'}</span>
                        {r.suspect && <em>not counted</em>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <p className="therapy-cal-empty">No therapy recorded on this night.</p>
          )}
        </div>
      )}

      {rangeStats && (
        <div className="therapy-cal-panel">
          <div className="therapy-cal-panel-head">
            <strong>{fmt(selStart, { day: 'numeric', month: 'short' })} – {fmt(selEnd, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
            {onReport && <button type="button" className="therapy-cal-report" onClick={() => onReport(selStart, selEnd)}>Report for these dates</button>}
          </div>
          <div className="therapy-cal-stats">
            <div><span>Days</span><b>{rangeStats.days}</b></div>
            <div><span>Days used</span><b>{rangeStats.used}</b></div>
            <div><span>Days ≥ 4 h</span><b>{rangeStats.met} ({Math.round((rangeStats.met / rangeStats.days) * 100)}%)</b></div>
            <div><span>Average use</span><b>{hm(rangeStats.avg)}</b></div>
          </div>
        </div>
      )}
    </div>
  );
}
