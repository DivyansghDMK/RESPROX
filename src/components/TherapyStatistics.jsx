// src/components/TherapyStatistics.jsx
//
// OSCAR-style Statistics table plus the compliance check, for any list of
// daily therapy rows (Reports' sessions or an uploaded file's days).

import React, { useMemo } from 'react';
import GlassCard from './GlassCard';
import { InfoIcon } from './Icons';
import { buildTherapyStatistics, buildComplianceCheck, COMPLIANT_HOURS } from '../services/therapyStatistics';

const fmtDate = (d) => (d ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d) : '—');

function hm(hours) {
  if (!Number.isFinite(hours)) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 60 ? `${h + 1}h 00m` : `${h}h ${String(m).padStart(2, '0')}m`;
}

const fixed = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '—');
const pct = (v) => (Number.isFinite(v) ? `${Math.round(v)}%` : '—');

// Row label → how to read it from a period summary. Order follows OSCAR's page.
const ROWS = [
  { group: 'Usage' },
  { label: 'Days in period', get: (p) => p.periodDays },
  { label: 'Days used', get: (p) => `${p.usedDays} (${pct(p.usedPct)})` },
  { label: `Compliance (≥ ${COMPLIANT_HOURS} h)`, get: (p) => pct(p.compliantPct), tone: (p) => (p.compliantPct >= 70 ? 'good' : 'bad') },
  { label: 'Average usage (days used)', get: (p) => hm(p.avgHoursUsed) },
  { label: 'Average usage (all days)', get: (p) => hm(p.avgHoursAll) },
  { label: 'Total usage', get: (p) => hm(p.totalHours) },
  { group: 'Events per hour' },
  { label: 'AHI', get: (p) => fixed(p.ahi), tone: (p) => (p.ahi == null ? null : p.ahi < 5 ? 'good' : p.ahi < 15 ? 'warn' : 'bad'), strong: true },
  { label: 'Central apnea index (CSA)', get: (p) => fixed(p.csaIndex) },
  { label: 'Obstructive apnea index (OSA)', get: (p) => fixed(p.osaIndex) },
  { label: 'Hypopnea index (HSA)', get: (p) => fixed(p.hsaIndex) },
  { group: 'Leak & pressure' },
  { label: 'Average leak (L/min)', get: (p) => fixed(p.leak, 1) },
  { label: 'Average pressure (cmH₂O)', get: (p) => fixed(p.pressure, 1) },
];

const TONE = { good: 'var(--green, #0f6e56)', warn: '#b45309', bad: '#dc2626' };

const STATUS = {
  met: { label: 'Compliance met', cls: 'pass' },
  'not-met': { label: 'Compliance not met', cls: 'fail' },
  'in-progress': { label: 'In progress', cls: 'progress' },
};

export default function TherapyStatistics({ rows, style }) {
  const stats = useMemo(() => buildTherapyStatistics(rows), [rows]);
  const check = useMemo(() => buildComplianceCheck(rows), [rows]);
  if (!stats || !check) return null;

  const { initial, recent, rule } = check;
  const status = STATUS[initial.status];
  const needed = rule.requiredNights - initial.bestWindow.compliantNights;

  return (
    <>
      <GlassCard style={style}>
        <div className="section-title table-title-row">
          <h2>Compliance Check</h2>
          <span className={`compliance-tag ${status.cls}`}>{status.label}</span>
        </div>
        <p className="stats-note">
          Rule: at least {COMPLIANT_HOURS} hours on {rule.requiredNights} of {rule.windowDays} consecutive nights (70%),
          within the first {rule.initialDays} days of therapy.
        </p>
        <div className="compliance-grid">
          <div>
            <span>Therapy start</span>
            <strong>{fmtDate(initial.firstDay)}</strong>
            <small>Day {initial.daysElapsed} of {rule.initialDays} recorded</small>
          </div>
          <div>
            <span>Best {rule.windowDays}-night window</span>
            <strong>{initial.bestWindow.compliantNights} / {rule.windowDays} nights</strong>
            <small>{fmtDate(initial.bestWindow.start)} – {fmtDate(initial.bestWindow.end)}</small>
          </div>
          <div>
            <span>Latest {rule.windowDays} nights</span>
            <strong style={{ color: recent.met ? TONE.good : TONE.bad }}>
              {recent.compliantNights} / {rule.windowDays} ({Math.round(recent.pct)}%)
            </strong>
            <small>{fmtDate(recent.from)} – {fmtDate(recent.to)}</small>
          </div>
        </div>
        {initial.status === 'in-progress' && (
          <p className="stats-note" style={{ marginTop: 12 }}>
            {needed} more night{needed === 1 ? '' : 's'} of {COMPLIANT_HOURS}+ hours needed in a {rule.windowDays}-night
            window before {fmtDate(initial.initialEnd)}.
          </p>
        )}
      </GlassCard>

      <GlassCard style={{ marginTop: 20 }}>
        <div className="section-title table-title-row">
          <h2>Therapy Statistics</h2>
          <span className="info-badge">
            <InfoIcon /> Up to {fmtDate(stats.lastDay)}
          </span>
        </div>
        <div className="table-responsive">
          <table className="glass-table stats-table">
            <thead>
              <tr>
                <th>Details</th>
                {stats.periods.map((p) => (
                  <th key={p.key} title={`${fmtDate(p.from)} – ${fmtDate(p.to)}`}>
                    {p.label}
                    {p.clipped && <sup title={`Starts at the first recorded day, ${fmtDate(stats.firstDay)}`}>*</sup>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (row.group ? (
                <tr key={row.group} className="stats-group"><td colSpan={stats.periods.length + 1}>{row.group}</td></tr>
              ) : (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {stats.periods.map((p) => {
                    const tone = row.tone?.(p);
                    return (
                      <td key={p.key} style={{ color: tone ? TONE[tone] : undefined, fontWeight: row.strong || tone ? 700 : undefined }}>
                        {row.get(p)}
                      </td>
                    );
                  })}
                </tr>
              )))}
            </tbody>
          </table>
        </div>
        <p className="stats-note" style={{ marginTop: 10 }}>
          Periods end on the last recorded night. Indices are total events ÷ total hours over the period.
          Nights with no record count as not used. * Period is shorter because therapy started later.
          Leak and pressure are averaged by hours used.
        </p>
      </GlassCard>
    </>
  );
}
