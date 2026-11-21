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

const ADDRESS = 'DeckMount : 683, Udyog Vihar, Phase V, Gurugram, Haryana, 122016';

const MASK_NAMES = { 1: 'Full Face', 2: 'Nasal', 3: 'Pillow' };

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
  if (/auto/i.test(text)) return { label: 'AUTO', bipap: false };
  return { label: 'CPAP', bipap: false };
}

function maskName(value) {
  if (value == null || value === '') return null;
  return MASK_NAMES[Number(value)] || String(value);
}

// ── SVG chart ─────────────────────────────────────────────────────────────────

const CHART = { w: 400, h: 190, left: 26, right: 6, top: 8, bottom: 30 };

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
      + `<text x="${CHART.left - 5}" y="${(y + 2.5).toFixed(1)}" text-anchor="end" font-size="6.5" fill="${C.axis}">${Number.isInteger(v) ? v : v.toFixed(1)}</text>`;
  }).join('');

  const slot = n ? plotW / n : 0;
  const barW = Math.max(1.2, Math.min(slot * 0.3, 6));

  const bars = days.map((day, i) => {
    const value = Number(day[valueKey]);
    if (!Number.isFinite(value) || value <= 0) return '';
    const height = Math.max(0.8, Math.min(value / yMax, 1) * plotH);
    const x = CHART.left + slot * i + (slot - barW) / 2;
    const fill = colorFor ? colorFor(value, day) : color;
    return `<rect x="${x.toFixed(1)}" y="${(baseY - height).toFixed(1)}" width="${barW.toFixed(1)}" height="${height.toFixed(1)}" fill="${fill}"/>`;
  }).join('');

  // Thin out date labels so they stay legible over long reporting periods.
  const every = Math.max(1, Math.ceil(n / 26));
  const labels = days.map((day, i) => {
    if (i % every !== 0) return '';
    const x = CHART.left + slot * i + slot / 2;
    return `<text x="${x.toFixed(1)}" y="${baseY + 6}" font-size="5.6" fill="${C.axis}" text-anchor="end" transform="rotate(-45 ${x.toFixed(1)} ${baseY + 6})">${esc(shortDate(day.date))}</text>`;
  }).join('');

  const thresholdLine = Number.isFinite(threshold) && threshold > 0 && threshold <= yMax
    ? `<line x1="${CHART.left}" y1="${(baseY - (threshold / yMax) * plotH).toFixed(1)}" x2="${CHART.w - CHART.right}" y2="${(baseY - (threshold / yMax) * plotH).toFixed(1)}" stroke="${C.threshold}" stroke-width="0.9" stroke-dasharray="4 3"/>`
    : '';

  return `<svg class="chart" viewBox="0 0 ${CHART.w} ${CHART.h}" role="img">
    ${gridlines}${bars}${thresholdLine}
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
  return `
    <div class="metric">
      <span class="metric-name">${esc(name)}</span>
      ${pairs.map(([label, value]) => `<span class="pair">${label ? `${esc(label)}: ` : ''}<b>${esc(value)}</b></span>`).join('')}
    </div>`;
}

function statPanel(rows) {
  return `<div class="stat-panel">${rows.filter(Boolean).map(([label, value, color]) => `
    <div class="stat-row">
      <span class="stat-label" ${color ? `style="color:${color}"` : ''}>${esc(label)}</span>
      <span class="stat-value" ${color ? `style="color:${color}"` : ''}>${esc(value)}</span>
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
<svg viewBox="0 0 400 108" class="logo-art" role="img" aria-label="DeckMount Electronics">
  <text x="0" y="62" font-family="Helvetica, Arial, sans-serif" font-size="47"
        font-weight="800" letter-spacing="-0.5" fill="#111111">DECK</text>
  <polygon points="172,4 140,44 154,44 136,80 176,38 160,38 178,4" fill="#FFD200"/>
  <text x="186" y="62" font-family="Helvetica, Arial, sans-serif" font-size="47"
        font-weight="800" letter-spacing="-0.5" fill="#111111">MOUNT</text>
  <text x="362" y="32" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#111111">®</text>
  <text x="3" y="98" font-family="Helvetica, Arial, sans-serif" font-size="15"
        font-weight="500" letter-spacing="20" fill="#3A3A3A">ELECTRONICS</text>
</svg>`;

// The report renders in a detached about:blank window, which has no base URL —
// a root-relative src would not resolve there, so it is made absolute first.
function logoMarkup() {
  const src = typeof window !== 'undefined' && window.location?.origin
    ? new URL(LOGO_FILE, window.location.origin).href
    : null;

  if (!src) return `<div class="logo">${LOGO_SVG}</div>`;

  // The <img> is preferred; on error it hides itself and reveals the vector twin.
  return `
<div class="logo">
  <img src="${esc(src)}" alt="DeckMount Electronics" class="logo-art"
       onerror="this.style.display='none';this.nextElementSibling.style.display='block';"/>
  <span style="display:none">${LOGO_SVG}</span>
</div>`;
}

// ── main builder ──────────────────────────────────────────────────────────────

export function buildTherapyReportHTML({ deviceData, sessions, startDate, endDate }) {
  const r = buildReportData({ rows: sessions, startDate, endDate });
  const { usage, events, days } = r;
  const settings = deviceData?.settings || {};
  const latest = r.latest;
  const mode = modeOf(latest, settings);

  const patient = deviceData?.patient || {};
  const serial = deviceData?.serial || settings.serial || '—';
  const period = `${longDate(r.from)} - ${longDate(r.to)}`;

  const dob = patient.dob ? new Date(patient.dob) : null;
  const age = dob && !Number.isNaN(dob.getTime())
    ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 86400000))
    : null;

  const lastUsed = [...days].reverse().find((d) => d.maxPressure > 0);
  const aflexLevel = Number(settings.aflex);
  const aflexOn = Number.isFinite(aflexLevel) && settings.aflex != null ? aflexLevel > 0 : latest?.aflexOn;
  const level = aflexOn ? (aflexLevel > 0 ? aflexLevel : latest?.aflexLevel) : null;

  const settingsRows = mode.bipap
    ? [
      ['Serial number', serial],
      ['Device', deviceData?.model || '—'],
      ['Mode', mode.label],
      ['IPAP', trimF(settings.max_pressure)],
      ['EPAP', trimF(settings.min_pressure)],
    ]
    : [
      ['Serial number', serial],
      ['Device', deviceData?.model || '—'],
      ['Mode', mode.label],
      ['Set Pressure', trimF(settings.pressure ?? lastUsed?.maxPressure)],
      ['A-Flex', aflexOn == null ? '—' : aflexOn ? 'ON' : 'OFF'],
      aflexOn ? ['A-Flex Level', trimF(level)] : null,
      ['Mask Type', maskName(settings.mask_type) || latest?.maskType || '—'],
    ];

  const usagePanel = chartSection('Usage (Hours)', [
    ['Usage days', `${usage.usedDays}/${usage.totalDays} Days (${usage.usedPct}%)`, C.purple],
    ['>= 4 hour days', `${usage.over4hDays} (${usage.over4hPct}%)`, C.usageOk],
    ['< 4 hour days', `${usage.under4hDays} (${usage.under4hPct}%)`, C.usageLow],
    ['Used Hours', fmtHM(usage.totalMinutes), C.text],
  ], barChart({
    days, valueKey: 'hours', refMax: 24, refStep: 4,
    colorFor: (v) => (v >= 4 ? C.usageOk : C.usageLow), threshold: 4,
  }));

  const pressurePanel = chartSection('Pressure (cmH2O)', [
    ['Mode', mode.label, C.text],
    ['Maximum (avg)', num(r.pressure.max), C.text],
    ['95th % (avg)', num(r.pressure.p95), C.heading],
    ['Median (avg)', num(r.pressure.median), C.text],
  ], barChart({
    days, valueKey: 'maxPressure', refMax: mode.bipap ? 36 : 24, refStep: 4,
    color: mode.bipap ? C.pressureBipap : C.pressure,
  }));

  const leakPanel = chartSection('Leak', [
    ['Set Threshold', `${r.leakThreshold.toFixed(1)} L/min`, C.purple],
    ['Maximum (avg)', num(r.avgLeak), C.text],
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
  @page { size: A4; margin: 12mm 12mm 20mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 14mm 12mm 22mm;
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 10.5px;
    color: ${C.text};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h2 {
    color: ${C.heading};
    font-size: 13px;
    font-weight: 700;
    margin: 0 0 10px;
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

  .logo { width: 186px; margin-bottom: 18px; }
  .logo-art { width: 100%; height: auto; display: block; }
  .patient { text-align: right; line-height: 1.6; margin-bottom: 24px; }
  .patient .name { font-size: 19px; color: #222; margin-bottom: 4px; }
  .patient .meta { font-size: 10px; color: #555; }

  section { margin-bottom: 26px; }

  .kv {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 5px 2px; font-size: 11px;
  }
  .kv span:last-child { text-align: right; }
  .rule { border-bottom: 1px solid ${C.rule}; padding-bottom: 8px; }

  .metric { display: flex; align-items: baseline; padding: 5px 2px; font-size: 11px; }
  .metric .metric-name { width: 168px; flex-shrink: 0; }
  .metric .pair { flex: 1; display: inline-flex; justify-content: space-between; gap: 7px; align-items: baseline; padding-right: 26px; }
  .metric .pair:last-child { padding-right: 0; }
  .metric .pair b { font-weight: 700; }

  .chart-section { break-inside: avoid; page-break-inside: avoid; }
  .chart-row { display: flex; gap: 14px; align-items: stretch; }
  .stat-panel {
    width: 42%; flex-shrink: 0; background: ${C.panel};
    padding: 14px 18px; display: flex; flex-direction: column; justify-content: center; gap: 11px;
  }
  .stat-row { display: flex; gap: 10px; font-size: 10.5px; white-space: nowrap; }
  .stat-label { width: 50%; flex-shrink: 0; }
  .chart-wrap { flex: 1; min-width: 0; }
  .chart { width: 100%; height: auto; display: block; }

  .page-break { page-break-before: always; break-before: page; }

  .footer {
    position: fixed; left: 0; right: 0; bottom: 6mm;
    text-align: center; font-size: 9.5px; font-style: italic; font-weight: 700;
    color: #222; padding-top: 6px; border-top: 1px solid #999;
    margin: 0 12mm;
  }

  @media print {
    .toolbar { display: none; }
    body { padding: 0; }
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
  <div class="rule">${kvRows(settingsRows)}</div>
</section>

<section>
  <h2>Therapy</h2>
  ${metricRow('Events per hour', [['AI', num(events.ai)], ['HI', num(events.hi)], ['AHI', num(events.ahi)]])}
  ${mode.bipap ? '' : `
  ${metricRow('Apnea Index - Events/hr', [['Central', num(events.central, 2)], ['Obstructive', num(events.obstructive, 2)], ['Unknown', num(events.unknown, 2)]])}
  ${metricRow('Average Leak - L/Min', [['', num(r.avgLeak)]])}`}
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
  const win = window.open('', '_blank');
  if (!win) {
    return { ok: false, reason: 'popup-blocked' };
  }
  win.document.open();
  win.document.write(buildTherapyReportHTML(args));
  win.document.close();
  return { ok: true };
}
