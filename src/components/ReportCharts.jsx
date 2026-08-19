// src/components/ReportCharts.jsx
//
// The therapy report's charts, on screen.
//
// Same four series and the same thresholds as the printable report, so what an
// operator reviews before generating a PDF is what the PDF contains. Rendered
// with recharts rather than the report's hand-rolled SVG because on screen
// these want a hover layer — with a year of nights in view, reading an exact
// value off a 2 px bar is otherwise impossible.
//
// Colour note: usage keeps the clinical green/red convention, which fails
// colour-vision separation on its own (ΔE 4.1 under deuteranopia). It is never
// the only cue here — the 4 h threshold line gives every bar a position, the
// short nights carry a diagonal hatch, and the legend names both states.

import React, { useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine, Cell,
} from 'recharts';

// Status steps, and a single brand hue for the plain magnitude series.
const C = {
  good: '#0ca30c',
  short: '#d03b3b',
  pressure: '#0047CC',
  leak: '#D97706',
  ahi: '#0047CC',
  grid: 'rgba(28, 50, 87, 0.08)',
  axis: '#71809b',
};

function hm(hours) {
  if (!Number.isFinite(hours)) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function ChartTooltip({ active, payload, unit, format }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const value = payload[0].value;
  return (
    <div className="rc-tooltip">
      <strong>{row.date}</strong>
      <span>{format ? format(value) : `${value}${unit || ''}`}</span>
      {row.sessionCount > 1 && <small>{row.sessionCount} sessions</small>}
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="rc-legend">
      {items.map((it) => (
        <span key={it.label}>
          {it.dashed
            ? <i className="rc-dash" style={{ borderTopColor: it.color }} />
            : <i style={{ background: it.hatch ? `repeating-linear-gradient(45deg, ${it.color}, ${it.color} 2px, #fff 2px, #fff 4px)` : it.color }} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}

/**
 * One chart. `days` is the aggregated daily rows from the parser, already
 * filtered to the selected range by the caller.
 */
function Panel({ title, subtitle, unit, dataKey, days, color, colorFor, threshold, thresholdLabel, domainMax, legend, format, stats, variant = 'bar' }) {
  // Nothing to plot is a real state — a chart axis with no bars reads as a bug.
  const hasData = days.some((d) => Number.isFinite(Number(d[dataKey])) && Number(d[dataKey]) > 0);
  // Each date label needs ~62 px; with a ~470 px plot that is 7 before they
  // start colliding, which is what the earlier 14 did.
  const tickInterval = Math.max(0, Math.ceil(days.length / 7) - 1);
  // A 3 px corner radius on a 2 px bar renders as a blob, not a rounded end.
  const dense = days.length > 60;

  return (
    <section className="rc-panel">
      <header>
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {stats && (
          <dl className="rc-stats">
            {stats.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        )}
      </header>

      {(legend || (Number.isFinite(threshold) && thresholdLabel)) && (
        <Legend items={[
          ...(legend || []),
          ...(Number.isFinite(threshold) && thresholdLabel
            ? [{ label: thresholdLabel, color: C.pressure, dashed: true }]
            : []),
        ]} />
      )}

      {hasData ? (
        <div className="rc-plot">
          <ResponsiveContainer width="100%" height={210}>
            <ComposedChart data={days} margin={{ top: 6, right: 8, left: -18, bottom: 0 }} barCategoryGap="12%">
              <defs>
                <pattern id={`hatch-${dataKey}`} width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                  <rect width="5" height="5" fill={C.short} />
                  <line x1="0" y1="0" x2="0" y2="5" stroke="#fff" strokeWidth="2" />
                </pattern>
              </defs>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis
                dataKey="shortDate" interval={tickInterval} axisLine={false} tickLine={false}
                tick={{ fill: C.axis, fontSize: 10 }} minTickGap={4}
              />
              <YAxis
                axisLine={false} tickLine={false} width={44}
                tick={{ fill: C.axis, fontSize: 10 }}
                domain={[0, domainMax || 'auto']}
              />
              <Tooltip
                cursor={{ fill: 'rgba(28, 50, 87, 0.05)' }}
                content={<ChartTooltip unit={unit} format={format} />}
              />
              {Number.isFinite(threshold) && (
                <ReferenceLine y={threshold} stroke={C.pressure} strokeDasharray="5 4" strokeWidth={1.2} />
              )}
              {variant === 'line' ? (
                // A setting that holds for weeks at a time is a level, not a
                // magnitude per night: 146 touching bars render as one solid
                // block and hide the very thing worth seeing - when it changed.
                <Line
                  type="stepAfter" dataKey={dataKey} stroke={color} strokeWidth={2}
                  dot={days.length <= 45 ? { r: 2.5, fill: color, strokeWidth: 0 } : false}
                  activeDot={{ r: 4 }} isAnimationActive={false} connectNulls
                />
              ) : (
                <Bar
                  dataKey={dataKey} radius={dense ? 0 : [3, 3, 0, 0]}
                  maxBarSize={22} isAnimationActive={false}
                >
                  {colorFor
                    ? days.map((d, i) => <Cell key={i} fill={colorFor(d, `url(#hatch-${dataKey})`)} />)
                    : days.map((d, i) => <Cell key={i} fill={color} />)}
                </Bar>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="rc-empty">No values recorded for this metric in the selected range.</p>
      )}
    </section>
  );
}

export default function ReportCharts({ days = [] }) {
  // recharts needs the label on the row; derive once rather than per render pass.
  const rows = useMemo(() => days.map((d) => ({
    ...d,
    shortDate: d.date?.replace(/(\d+) (\w+) \d+/, '$1 $2') || d.dayKey,
  })), [days]);

  const usedDays = rows.filter((d) => d.usage_hours > 0);
  const compliant = usedDays.filter((d) => d.usage_hours >= 4);
  const totalHours = usedDays.reduce((s, d) => s + d.usage_hours, 0);
  const leakDays = rows.filter((d) => Number.isFinite(d.mask_leak));
  const avgLeak = leakDays.length ? leakDays.reduce((s, d) => s + d.mask_leak, 0) / leakDays.length : NaN;
  const events = rows.reduce((s, d) => s + (d.events || 0), 0);
  const ahi = totalHours > 0 ? events / totalHours : NaN;
  const pressures = rows.map((d) => d.pressure_95).filter(Number.isFinite);

  if (!rows.length) return null;

  return (
    <div className="rc-grid">
      <Panel
        title="Usage" subtitle="Hours of therapy per night" unit=" h"
        dataKey="usage_hours" days={rows}
        colorFor={(d, hatch) => (d.usage_hours >= 4 ? C.good : hatch)}
        threshold={4} thresholdLabel="4 h compliance"
        format={(v) => hm(v)}
        legend={[
          { label: '≥ 4 hours', color: C.good },
          { label: 'Under 4 hours', color: C.short, hatch: true },
        ]}
        stats={[
          ['Nights used', `${usedDays.length}/${rows.length}`],
          ['≥ 4 h', `${compliant.length} (${usedDays.length ? Math.round((compliant.length / usedDays.length) * 100) : 0}%)`],
          ['Total', hm(totalHours)],
        ]}
      />

      <Panel
        title="Set Pressure" subtitle="cmH₂O delivered setting" unit=" cmH₂O"
        dataKey="pressure_95" days={rows} color={C.pressure} variant="line"
        stats={[
          ['Average', pressures.length ? `${(pressures.reduce((a, b) => a + b, 0) / pressures.length).toFixed(1)} cmH₂O` : '—'],
          ['Max', pressures.length ? `${Math.max(...pressures).toFixed(1)}` : '—'],
        ]}
      />

      <Panel
        title="AHI" subtitle="Apnoea–hypopnoea events per hour" unit=" /hr"
        dataKey="ahi" days={rows} color={C.ahi}
        threshold={5} thresholdLabel="AHI 5"
        stats={[
          ['Average', Number.isFinite(ahi) ? ahi.toFixed(2) : '—'],
          ['Events', String(events)],
        ]}
      />

      <Panel
        title="Mask Leak" subtitle="Average leak per night" unit=" L/min"
        dataKey="mask_leak" days={rows} color={C.leak}
        threshold={24} thresholdLabel="24 L/min"
        stats={[
          ['Average', Number.isFinite(avgLeak) ? `${avgLeak.toFixed(1)} L/min` : '—'],
          ['Nights with data', `${leakDays.length}/${rows.length}`],
        ]}
      />
    </div>
  );
}
