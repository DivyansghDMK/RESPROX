// src/services/therapyReport.js
//
// Builds the DeckMount therapy report as a self-contained printable document,
// laid out like the report the DeckMount Android app prints. Every number
// comes from reportCalc.js, which uses the app's formulas.
//
//   CPAP / AUTO   page 1 summary, page 2 Pressure, Usage, Leak, AHI
//   BiPAP S/ST/T  page 1 summary, page 2 Usage, Pressure, AHI, Leak,
//                 page 3 Tidal Volume, Respiratory Rate, Minute Ventilation
//
// Charts are hand-rolled inline SVG rather than a charting library: the report
// opens in a detached window that has no bundler, printing must not depend on
// a JS runtime having finished laying anything out, and it keeps this module
// free of the ~300 kB recharts chunk.

import { buildReportData, fmtHM, MODE_NAMES } from './reportCalc.js';

const ADDRESS = 'DeckMount : 683, Udyog Vihar, Phase V, Gurugram 122016';

const MASK_NAMES = { 1: 'Full Face Mask', 2: 'Nasal Mask', 3: 'Pillow Mask' };

const C = {
  heading: '#1E88E5',
  panel: '#E0E0E0',
  text: '#222222',
  rule: '#CFCFCF',
  grid: '#E6E6E6',
  axis: '#888888',
  threshold: '#3D4FD8',
  usageOk: '#A5CC94',
  usageLow: '#D0342C',
  purple: '#9B59B6',
  pink: '#D58FE0',
  red: '#B03A2E',
  pressure: '#1E6FD9',
  pressureBipap: '#8C99AC',
  ahi: '#8E44AD',
  leak: '#F5C518',
  volume: '#8C99AC',
};

// ── formatting helpers ────────────────────────────────────────────────────────

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function num(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

/** For values the device's data can't give (pressure median/95th, unknown apnea): "N/A", not "—" or a guess. */
function na(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'N/A';
}

/** Leak is read in whole L/min, so its average is shown that way too: 43.7 → "44". */
function whole(value) {
  return Number.isFinite(value) ? String(Math.round(value)) : '—';
}

/** Whole numbers without a decimal, others with one: 12 → "12", 8.5 → "8.5". */
function trimF(value) {
  const n = Number(value);
  if (value == null || value === '' || !Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function shortDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(date);
}

function longDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

/** Mode name and BiPAP layout, from the report's mode code or the settings. */
function modeOf(latest, settings) {
  const code = Number(latest?.modeCode);
  if (MODE_NAMES[code]) return { label: MODE_NAMES[code], bipap: code >= 3 && code <= 5 };
  const text = String(settings.therapy_mode || '');
  if (/bipap|bilevel/i.test(text)) return { label: 'BiPAP', bipap: true };
  if (/auto/i.test(text)) return { label: 'AUTO CPAP', bipap: false };
  return { label: 'CPAP', bipap: false };
}

function maskName(value) {
  if (value == null || value === '') return null;
  if (MASK_NAMES[Number(value)]) return MASK_NAMES[Number(value)];
  // Names from a file or the settings screen ("Pillow", "Full Face") read as the report names them.
  const text = String(value);
  return /mask$/i.test(text) ? text : `${text} Mask`;
}

// ── SVG chart ─────────────────────────────────────────────────────────────────

const CHART = { w: 400, h: 172, left: 24, right: 4, top: 6, bottom: 28 };

/**
 * Axis scale for a series: the app's fixed range, growing only when the data
 * goes past it.
 */
function scaleFor(values, refMax, refStep) {
  const peak = Math.max(0, ...values.filter(Number.isFinite));
  if (peak <= refMax) return { max: refMax, step: refStep };

  // Round the step up to a 1/2/5×10ⁿ value so ticks stay whole numbers.
  const rough = peak / (refMax / refStep);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  return { max: Math.ceil(peak / step) * step, step };
}

function barChart({ days, valueKey, refMax, refStep, color, colorFor, threshold }) {
  const { max: yMax, step: yStep } = scaleFor([...days.map((d) => d[valueKey]), threshold ?? 0], refMax, refStep);
  const plotW = CHART.w - CHART.left - CHART.right;
  const plotH = CHART.h - CHART.top - CHART.bottom;
  const baseY = CHART.top + plotH;
  const n = days.length;

  const ticks = [];
  for (let v = 0; v <= yMax + 1e-9; v += yStep) ticks.push(v);

  const gridlines = ticks.map((v) => {
    const y = baseY - (v / yMax) * plotH;
    return `<line x1="${CHART.left}" y1="${y.toFixed(1)}" x2="${CHART.w - CHART.right}" y2="${y.toFixed(1)}" stroke="${C.grid}" stroke-width="0.6"/>`
      + `<text x="${CHART.left - 5}" y="${(y + 2.5).toFixed(1)}" text-anchor="end" font-size="7" fill="${C.axis}">${Number.isInteger(v) ? v : v.toFixed(1)}</text>`;
  }).join('');

  const slot = n ? plotW / n : 0;
  const barW = Math.max(1.2, Math.min(slot * 0.55, 8));

  const bars = days.map((day, i) => {
    const value = Number(day[valueKey]);
    if (!Number.isFinite(value) || value <= 0) return '';
    const height = Math.max(0.8, Math.min(value / yMax, 1) * plotH);
    const x = CHART.left + slot * i + (slot - barW) / 2;
    const fill = colorFor ? colorFor(value, day) : color;
    return `<rect x="${x.toFixed(1)}" y="${(baseY - height).toFixed(1)}" width="${barW.toFixed(1)}" height="${height.toFixed(1)}" fill="${fill}"/>`;
  }).join('');

  // Thin out date labels so they stay legible over long reporting periods.
  const every = Math.max(1, Math.ceil(n / 45));
  const labels = days.map((day, i) => {
    if (i % every !== 0) return '';
    const x = CHART.left + slot * i + slot / 2;
    return `<text x="${x.toFixed(1)}" y="${baseY + 6}" font-size="${n > 25 ? 5.4 : 6.8}" fill="${C.axis}" text-anchor="end" transform="rotate(-45 ${x.toFixed(1)} ${baseY + 6})">${esc(shortDate(day.date))}</text>`;
  }).join('');

  const thresholdLine = Number.isFinite(threshold) && threshold > 0 && threshold <= yMax
    ? `<line x1="${CHART.left}" y1="${(baseY - (threshold / yMax) * plotH).toFixed(1)}" x2="${CHART.w - CHART.right}" y2="${(baseY - (threshold / yMax) * plotH).toFixed(1)}" stroke="${C.threshold}" stroke-width="0.9" stroke-dasharray="4 3"/>`
    : '';

  const dayLines = n && n <= 90
    ? days.map((_, i) => {
      const x = (CHART.left + slot * (i + 1)).toFixed(1);
      return `<line x1="${x}" y1="${CHART.top}" x2="${x}" y2="${baseY}" stroke="${C.grid}" stroke-width="0.35"/>`;
    }).join('')
    : '';

  return `<svg class="chart" viewBox="0 0 ${CHART.w} ${CHART.h}" role="img">
    ${dayLines}${gridlines}${bars}${thresholdLine}
    <line x1="${CHART.left}" y1="${baseY}" x2="${CHART.w - CHART.right}" y2="${baseY}" stroke="${C.axis}" stroke-width="0.7"/>
    ${labels}
  </svg>`;
}

// ── document fragments ────────────────────────────────────────────────────────

function kvRows(rows) {
  return rows
    .filter(Boolean)
    .map(([label, value]) => `<div class="kv"><span>${esc(label)}</span><span>${esc(value)}</span></div>`)
    .join('');
}

function metricRow(name, pairs) {
  // One table row: name, then label | value cells. A lone value (Average Leak)
  // sits under the first label, as on DeckMount's report.
  return `<tr><td class="metric-name">${esc(name)}</td>${pairs.map(([label, value]) => (label
    ? `<td class="ml">${esc(label)}:</td><td class="mv">${esc(value)}</td>`
    : `<td class="mv">${esc(value)}</td>`)).join('')}</tr>`;
}

function statPanel(rows) {
  return `<div class="stat-panel">${rows.filter(Boolean).map(([label, value, color, small]) => `
    <div class="stat-row">
      <span class="stat-label" ${color ? `style="color:${color}"` : ''}>${esc(label)}</span>
      <span class="stat-value${small ? ' small' : ''}" ${color ? `style="color:${color}"` : ''}>${esc(value)}</span>
    </div>`).join('')}</div>`;
}

function chartSection(title, panelRows, chartSvg) {
  return `
    <section class="chart-section">
      <h2>${esc(title)}</h2>
      <div class="chart-row">
        ${statPanel(panelRows)}
        <div class="chart-wrap">${chartSvg}</div>
      </div>
    </section>`;
}

// ── Brand mark ────────────────────────────────────────────────────────────────

/**
 * Drop the official artwork at `public/deckmount-logo.png` and it is used
 * automatically. Until then the vector reproduction below renders instead —
 * it is also the fallback if the file is ever missing or fails to load, so the
 * report is never headed by a broken image.
 */
export const LOGO_FILE = '/deckmount-logo.png';

// Vector reproduction of the DECK⚡MOUNT ELECTRONICS lockup. Vector rather than
// raster so it stays sharp at print resolution and needs no network fetch
// before the user hits Print.
// Geometry is set from Helvetica Bold advance widths at 47px: "DECK" runs
// 0→133 and "MOUNT" needs ~172, so the bolt occupies the gap between them and
// the box is wide enough that neither the wordmark nor the ® is clipped.
const LOGO_SVG = `
<svg viewBox="0 0 400 80" class="logo-art" role="img" aria-label="DeckMount">
  <text x="0" y="64" font-family="Verdana, Helvetica, Arial, sans-serif" font-size="46"
        font-weight="900" font-style="italic" letter-spacing="-2" fill="#111111">DECK</text>
  <polygon points="176,2 150,44 162,44 140,80 184,30 170,30 190,2" fill="#FFD200"/>
  <text x="192" y="64" font-family="Verdana, Helvetica, Arial, sans-serif" font-size="46"
        font-weight="900" font-style="italic" letter-spacing="-2" fill="#111111">MOUNT</text>
</svg>`;

const TAGLINE = '<div class="tagline">Saving Millions of lives</div>';

// The report renders in a detached about:blank window, which has no base URL —
// a root-relative src would not resolve there, so it is made absolute first.
function logoMarkup() {
  const src = typeof window !== 'undefined' && window.location?.origin
    ? new URL(LOGO_FILE, window.location.origin).href
    : null;

  if (!src) return `<div class="logo">${LOGO_SVG}${TAGLINE}</div>`;

  // The <img> is preferred; on error it hides itself and reveals the vector twin.
  return `
<div class="logo">
  <img src="${esc(src)}" alt="DeckMount" class="logo-art"
       onerror="this.style.display='none';this.nextElementSibling.style.display='block';"/>
  <span style="display:none">${LOGO_SVG}</span>
  ${TAGLINE}
</div>`;
}

// ── main builder ──────────────────────────────────────────────────────────────

/** `note`: an optional line under the title, e.g. which sessions a report covers. */
export function buildTherapyReportHTML({ deviceData, sessions, startDate, endDate, note }) {
  const r = buildReportData({ rows: sessions, startDate, endDate });
  const { usage, events, days } = r;
  const settings = deviceData?.settings || {};
  const latest = r.latest;
  const mode = modeOf(latest, settings);

  const patient = deviceData?.patient || {};
  const serial = deviceData?.serial || settings.serial || '—';
  // "15 Mar - 21 Apr"; the year only when the range crosses into another year.
  const sameYear = r.from && r.to && r.from.getFullYear() === r.to.getFullYear();
  const period = sameYear ? `${shortDate(r.from)} - ${shortDate(r.to)}` : `${longDate(r.from)} - ${longDate(r.to)}`;
  const auto = /auto/i.test(mode.label);

  const dob = patient.dob ? new Date(patient.dob) : null;
  // Worked out from the date of birth; an age typed in is used when there is none.
  const typedAge = Number(patient.age);
  const age = dob && !Number.isNaN(dob.getTime())
    ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 86400000))
    : patient.age !== '' && patient.age != null && Number.isInteger(typedAge) && typedAge >= 0 ? typedAge : null;

  const lastUsed = [...days].reverse().find((d) => d.maxPressure > 0);
  // Pressure settings as recorded by the sessions in this range; the device's
  // current settings only when the sessions don't carry them.
  // Each mode's settings from the last session that ran in it: a range that
  // mixes AUTO and CPAP must not print AUTO's max as the CPAP pressure.
  const setMax = (auto ? r.set?.autoMax : null) ?? r.set?.max ?? settings.max_pressure;
  const setMin = (auto ? r.set?.autoMin : null) ?? r.set?.min ?? settings.min_pressure;
  const setFixed = r.set?.fixed ?? settings.pressure ?? r.set?.max ?? lastUsed?.maxPressure;
  // A-Flex and mask as the sessions in the range recorded them (the same from
  // a server sync, a .td1 or REPORTFL.TXT); today's settings only as fallback.
  const aflexLevel = Number(settings.aflex);
  const aflexOn = latest?.aflexOn != null ? latest.aflexOn
    : Number.isFinite(aflexLevel) && settings.aflex != null ? aflexLevel > 0 : null;
  const level = aflexOn ? (latest?.aflexOn ? latest.aflexLevel : aflexLevel) : null;

  const settingsRows = mode.bipap
    ? [
      ['Serial number', serial],
      ['Device', deviceData?.model || '—'],
      ['Mode', mode.label],
      ['IPAP', trimF(setMax)],
      ['EPAP', trimF(setMin)],
    ]
    : [
      ['Serial number', serial],
      ['Device', deviceData?.model || '—'],
      ['Mode', mode.label],
      // AUTO CPAP moves between a set min and max; CPAP holds one pressure.
      ...(auto
        ? [['Min Pressure', trimF(setMin)], ['Max Pressure', trimF(setMax)]]
        : [['Set Pressure', trimF(setFixed)]]),
      ['A-Flex', aflexOn == null ? '—' : aflexOn ? 'ON' : 'OFF'],
      aflexOn ? ['A-Flex Level', trimF(level)] : null,
      ['Mask Type', maskName(latest?.maskType) || maskName(settings.mask_type) || '—'],
    ];

  const usagePanel = chartSection('Usage (Hours)', [
    ['Usage days', `${usage.usedDays}/${usage.totalDays} Days (${usage.usedPct}%)`, C.purple],
    ['>= 4 hour days', `${usage.over4hDays} (${usage.over4hPct}%)`, C.usageOk],
    ['< 4 hour days', `${usage.under4hDays} (${usage.under4hPct}%)`, C.usageLow],
    ['Used Hours', `${Math.floor(usage.totalMinutes / 60)} Hours, ${String(usage.totalMinutes % 60).padStart(2, '0')} Minutes`, C.text, true],
  ], barChart({
    days, valueKey: 'hours', refStep: 4,
    // At least 0-16 h, then up in 4 h steps to clear the longest day (DeckMount's scale).
    refMax: Math.max(16, Math.ceil(Math.max(0, ...days.map((d) => d.hours)) / 4) * 4),
    colorFor: (v) => (v >= 4 ? C.usageOk : C.usageLow), threshold: 4,
  }));

  const pressurePanel = chartSection('Pressure (cmH2O)', [
    ['Mode', mode.label, C.text],
    ...(mode.bipap ? [] : auto
      ? [['Set Max Pressure', trimF(setMax), C.text], ['Set Min Pressure', trimF(setMin), C.text]]
      : [['Set Pressure', trimF(setFixed), C.text]]),
    ['Maximum (avg)', num(r.pressure.max), C.text],
    ['95th % (avg)', na(r.pressure.p95), C.heading],
    ['Median (avg)', na(r.pressure.median), C.text],
  ], barChart({
    days, valueKey: 'maxPressure', refMax: mode.bipap ? 36 : 24, refStep: 4,
    color: mode.bipap ? C.pressureBipap : C.pressure,
  }));

  const leakPanel = chartSection('Leak', [
    ['Set Threshold', `${r.leakThreshold.toFixed(1)} L/min`, C.purple],
    ['Maximum (avg)', whole(r.avgLeak), C.text],
  ], barChart({ days, valueKey: 'leak', refMax: 100, refStep: 20, color: C.leak, threshold: r.leakThreshold }));

  const ahiPanel = chartSection('AHI (Events/Hour)', [
    ['AHI', num(events.ahi), C.purple],
    ['HI', num(events.hi), C.pink],
    ['AI', num(events.ai), C.red],
  ], barChart({ days, valueKey: 'ahi', refMax: 40, refStep: 4, color: C.ahi }));

  const chartPages = mode.bipap
    ? `${usagePanel}${pressurePanel}${ahiPanel}${leakPanel}
<div class="page-break"></div>
${chartSection('Tidal Volume (mL)', [
  ['Maximum', num(r.tidal.max, 0), C.text],
  ['95th %', num(r.tidal.p95, 0), C.heading],
  ['Median', num(r.tidal.median, 0), C.text],
], barChart({ days, valueKey: 'tidal', refMax: 1000, refStep: 200, color: C.volume }))}
${chartSection('Respiratory Rate (BPM)', [
  ['Maximum', num(r.respMax), C.text],
], barChart({ days, valueKey: 'resp', refMax: 100, refStep: 10, color: C.volume }))}
${chartSection('Minute Ventilation (L/min)', [
  ['Maximum', num(r.minuteVent.max), C.text],
  ['95th %', num(r.minuteVent.p95), C.heading],
  ['Median', num(r.minuteVent.median), C.text],
], barChart({ days, valueKey: 'minuteVent', refMax: 50, refStep: 5, color: C.volume }))}`
    : `${pressurePanel}${usagePanel}${leakPanel}${ahiPanel}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Therapy Report — ${esc(patient.name || serial)}</title>
<style>
  @page { size: A4; margin: 12mm 12mm 15mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 14mm 12mm 22mm;
    font-family: 'DejaVu Sans', Verdana, Geneva, 'Helvetica Neue', Arial, sans-serif;
    font-size: 13px;
    color: ${C.text};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h2 {
    color: ${C.heading};
    font-size: 17px;
    font-weight: 700;
    margin: 0 0 12px;
  }

  .toolbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; margin-bottom: 22px; padding: 10px 16px;
    background: #0F172A; color: #fff; border-radius: 8px; font-size: 12px;
  }
  .toolbar button {
    background: ${C.heading}; color: #fff; border: 0;
    padding: 8px 16px; border-radius: 6px; font-weight: 700; cursor: pointer;
  }

  .logo { width: 220px; margin-bottom: 4px; }
  .logo-art { width: 100%; height: auto; display: block; }
  .tagline { margin: 2px 0 0 72px; font-size: 13px; color: ${C.heading}; white-space: nowrap; }
  .patient { text-align: right; line-height: 1.6; margin-bottom: 18px; }
  .patient .name { font-size: 22px; color: #222; line-height: 1.3; margin-bottom: 4px; }
  .patient .meta { font-size: 11.5px; color: #555; }

  section { margin-bottom: 26px; }
  section.therapy { margin-bottom: 34px; }

  .kv {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 5.5px 0; font-size: 12.5px;
  }
  .kv span:last-child { text-align: right; }
  .rule { border-bottom: 1px solid ${C.rule}; padding-bottom: 12px; }

  table.metrics { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  table.metrics td { padding: 5.5px 0; vertical-align: baseline; white-space: nowrap; }
  table.metrics td.metric-name { width: 32%; }
  table.metrics td.ml { padding-right: 10px; }
  table.metrics td.mv { font-weight: 700; padding-right: 18px; }

  .chart-section { break-inside: avoid; page-break-inside: avoid; margin-bottom: 22px; }
  .chart-row { display: flex; gap: 12px; align-items: stretch; }
  .stat-panel {
    width: 42%; flex-shrink: 0; background: ${C.panel};
    padding: 18px 24px; display: flex; flex-direction: column; justify-content: center; gap: 20px;
  }
  .stat-row { display: flex; align-items: baseline; font-size: 13px; white-space: nowrap; }
  .stat-label { width: 54%; flex-shrink: 0; padding-right: 8px; }
  .stat-value.small { font-size: 10.5px; }
  .chart-wrap { flex: 1; min-width: 0; display: flex; align-items: center; }
  .chart { width: 100%; height: auto; display: block; }

  .page-break { page-break-before: always; break-before: page; }

  .footer {
    position: fixed; left: 0; right: 0; bottom: 6mm;
    text-align: center; font-size: 10.5px; font-style: italic; font-weight: 700;
    color: #222; padding-top: 8px; border-top: 1px solid #bbb;
    margin: 0 12mm;
  }

  .report-note { margin: -6px 0 10px; font-size: 12px; color: #555; }

  @media print {
    .toolbar { display: none; }
    body { padding: 0; }
    .footer { margin: 0; bottom: 0; }
  }
</style>
</head>
<body>

<div class="toolbar">
  <span>Therapy report ready — ${esc(patient.name || serial)} (${esc(period)})</span>
  <button onclick="window.print()">Print or Save as PDF</button>
</div>

${logoMarkup()}
<div class="patient">
  <div class="name">${esc(patient.name || 'Patient Name')}</div>
  <div class="meta">Patient ID: ${esc(patient.id || '—')}</div>
  <div class="meta">DOB: ${esc(patient.dob || '—')}</div>
  <div class="meta">Age: ${age != null ? `${age} Years` : '—'}</div>
  <div class="meta">Gender: ${esc(patient.gender || '—')}</div>
</div>

<section>
  <h2>Therapy Report (${esc(period)})</h2>
  ${note ? `<p class="report-note">${esc(note)}</p>` : ''}
  <div class="rule">${kvRows(settingsRows)}</div>
</section>

<section class="therapy">
  <h2>Therapy</h2>
  <table class="metrics"><tbody>
  ${mode.bipap ? '' : metricRow('Pressure-cmH2O', [['Median', na(r.pressure.median)], ['95th percentile', na(r.pressure.p95)], ['Maximum', num(r.pressure.max)]])}
  ${metricRow('Events per hour', [['AI', num(events.ai, 2)], ['HI', num(events.hi, 2)], ['AHI', num(events.ahi, 2)]])}
  ${mode.bipap ? '' : `
  ${metricRow('Apnea Index - L/Min', [['Central', num(events.central, 2)], ['Obstructive', num(events.obstructive, 2)], ['Unknown', na(events.unknown, 2)]])}
  ${metricRow('Average Leak - L/Min', [['', whole(r.avgLeak)]])}`}
  </tbody></table>
</section>

<section>
  <h2>Usage</h2>
  ${kvRows([
    ['Usage days', `${usage.usedDays}/${usage.totalDays} Days (${usage.usedPct}%)`],
    ['>= 4 hours', `${usage.over4hDays} (${usage.over4hPct}%)`],
    ['< 4 hours', `${usage.under4hDays} (${usage.under4hPct}%)`],
    ['Usage hours', fmtHM(usage.totalMinutes)],
    ['Average usage (Total Days)', fmtHM(usage.avgTotalDaysMin)],
    ['Average usage (Days Used)', fmtHM(usage.avgUsedDaysMin)],
    ['Median usage (Days Used)', fmtHM(usage.medianUsedDaysMin)],
  ])}
</section>

<div class="page-break"></div>

${chartPages}

<div class="footer">${esc(ADDRESS)}</div>

</body>
</html>`;
}

/** Open the report in a new window, ready to print or save as PDF. */
export function openTherapyReport(args) {
  // Build first: if the data can't be turned into a report, no blank tab is
  // left behind and the caller gets the reason.
  let html;
  try {
    html = buildTherapyReportHTML(args);
  } catch (error) {
    return { ok: false, reason: 'build-failed', error };
  }
  const win = window.open('', '_blank');
  if (!win) {
    return { ok: false, reason: 'popup-blocked' };
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  return { ok: true };
}
