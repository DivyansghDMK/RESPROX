import React, { useEffect, useMemo, useState } from 'react';
import { CALENDAR_DAYS, HIGH_AHI, calendarWindow, shiftKey } from '../services/therapyCalendar';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STATUS_TEXT = { met: '4 h or more', low: 'Used, under 4 h', none: 'No therapy' };
const fmt = (key, opts) => new Intl.DateTimeFormat('en-GB', opts).format(new Date(`${key}T00:00:00`));
const hm = (m) => `${Math.floor(m / 60)}h ${m % 60}m`;

/**
 * 30 days of therapy, every date shown and coloured by how that night went.
 * Clicking a date picks it as a single day.
 */
export default function TherapyCalendar({ byDay, dataEnd, selection, onPick }) {
  const [end, setEnd] = useState(dataEnd);
  useEffect(() => { setEnd(dataEnd); }, [dataEnd]);

  const win = useMemo(() => (end ? calendarWindow(byDay, end) : null), [byDay, end]);
  if (!win) return null;

  const first = win.cells[0].key;
  const lead = (new Date(`${first}T00:00:00`).getDay() + 6) % 7;
  // A single picked date is outlined; a range is marked lightly.
  const selEnd = selection?.end || selection?.start;
  const single = Boolean(selection?.start) && selection.start === selEnd;
  const mark = (key) => (selection?.start && key >= selection.start && key <= selEnd ? (single ? ' picked' : ' in-range') : '');

  return (
    <div className="therapy-cal">
      <div className="therapy-cal-head">
        <button type="button" onClick={() => setEnd(shiftKey(end, -CALENDAR_DAYS))} aria-label="Earlier 30 days">←</button>
        <strong>{fmt(first, { day: 'numeric', month: 'short' })} – {fmt(end, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
        <button type="button" onClick={() => setEnd(shiftKey(end, CALENDAR_DAYS))} disabled={end >= dataEnd} aria-label="Later 30 days">→</button>
        {end !== dataEnd && <button type="button" className="therapy-cal-latest" onClick={() => setEnd(dataEnd)}>Latest</button>}
        <span className="therapy-cal-sum">
          {win.used} of {CALENDAR_DAYS} days used · {win.met} days ≥ 4 h ({win.compliance}%)
        </span>
      </div>

      <div className="therapy-cal-grid" role="grid" aria-label="Therapy by date">
        {WEEKDAYS.map((w) => <div key={w} className="therapy-cal-wd" role="columnheader">{w}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} aria-hidden="true" />)}
        {win.cells.map((c, i) => {
          const day = Number(c.key.slice(8));
          const tip = [
            fmt(c.key, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
            STATUS_TEXT[c.status],
            c.info && c.status !== 'none' ? `Usage ${hm(c.info.minutes)} · ${c.info.sessions} session${c.info.sessions === 1 ? '' : 's'}` : null,
            c.info?.ahi != null && c.status !== 'none' ? `AHI ${c.info.ahi}` : null,
            c.info?.leak ? `Leak ${c.info.leak} L/min` : null,
          ].filter(Boolean).join('\n');
          return (
            <button key={c.key} type="button" role="gridcell"
              className={`therapy-cal-day ${c.status}${mark(c.key)}`}
              onClick={() => onPick?.(c.key)} title={tip} aria-label={tip.replace(/\n/g, ', ')}>
              <span className="therapy-cal-num">{day === 1 || i === 0 ? fmt(c.key, { day: 'numeric', month: 'short' }) : day}</span>
              {c.status !== 'none' && <span className="therapy-cal-hrs">{(c.info.minutes / 60).toFixed(1)}h</span>}
              {c.highAhi && <span className="therapy-cal-ahi" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div className="therapy-cal-legend">
        <span><i className="met" /> 4 h or more</span>
        <span><i className="low" /> Used, under 4 h</span>
        <span><i className="none" /> No therapy</span>
        <span><i className="ahi" /> AHI ≥ {HIGH_AHI}</span>
        <span className="therapy-cal-hint">Click a date for that day's report</span>
      </div>
    </div>
  );
}
