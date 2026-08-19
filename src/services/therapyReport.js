// src/services/therapyReport.js
//
// Builds the DeckMount therapy report as a self-contained printable document.
//
// Charts are hand-rolled inline SVG rather than a charting library: the report
// opens in a detached window that has no bundler, printing must not depend on
// a JS runtime having finished laying anything out, and it keeps this module
// free of the ~300 kB recharts chunk.
//
// Metrics that the CPAP telemetry frame does not carry (the AI/HI split, daily
// median pressure, tidal volume, respiratory rate, minute ventilation) are
// rendered as "—" and their sections are omitted entirely. This is a clinical
// document: a blank is correct where an estimate would be invented.

const ADDRESS = 'DeckMount - 683, Phase V, Udyog Vihar, Sector 19, Gurugram, Haryana 122016';

const C = {
  heading: '#1E88E5',
  panel: '#E4E4E4',
  text: '#333333',
  rule: '#CFCFCF',
  grid: '#E6E6E6',
  axis: '#888888',
  threshold: '#3D6FD8',
  usageOk: '#9CBF8E',
  usageLow: '#D0342C',
  usagePurple: '#8B80B8',
  usageGreen: '#A8C8A0',
  pressureAuto: '#2196F3',
  pressureBipap: '#8C99AC',
  ahiBar: '#F2C94C',
  ahiPink: '#C7527E',
  ahiPinkLight: '#E4A3BE',
  leak: '#F5A623',
  volume: '#8C99AC',
  volumeLabel: '#7A8B9A',
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

/** "05 Hours, 00 Minutes" — the report pads hours to two digits. */
function hoursMinutes(totalHours) {
  if (!Number.isFinite(totalHours)) return '—';
  const h = Math.floor(totalHours);
  const m = Math.round((totalHours - h) * 60);
  const carry = m === 60;
  return `${String(carry ? h + 1 : h).padStart(2, '0')} Hours, ${String(carry ? 0 : m).padStart(2, '0')} Minutes`;
}

/** "339 Hours, 44 Minutes" — totals are not zero-padded. */
function longHoursMinutes(totalHours) {
  if (!Number.isFinite(totalHours)) return '—';
  const h = Math.floor(totalHours);
  const m = Math.round((totalHours - h) * 60);
  const carry = m === 60;
  return `${carry ? h + 1 : h} Hours, ${carry ? 0 : m} Minutes`;
}

function shortDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(date);
}

function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
}

function pct(part, whole) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

function sessionDate(session) {
  const raw = session.timestamp ?? session.raw?.server_timestamp;
  const date = typeof raw === 'number' ? new Date(raw) : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ── metric derivation ─────────────────────────────────────────────────────────

export function deriveReport({ deviceData, sessions = [], startDate, endDate, pressureSource = 'measured' }) {
  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const end = endDate ? new Date(`${endDate}T23:59:59.999`) : null;

  // Settings frames are configuration echoes, not nights of therapy.
  const nights = sessions
    .filter((s) => s.type !== 'SETTINGS_UPDATE')
    .map((s) => ({ ...s, when: sessionDate(s) }))
    .filter((s) => s.when && (!start || s.when >= start) && (!end || s.when <= end))
    .sort((a, b) => a.when - b.when);

  // One row per calendar day; a later frame for the same day supersedes earlier ones.
  const byDay = new Map();
  for (const night of nights) {
    byDay.set(night.when.toDateString(), night);
  }
  const days = [...byDay.values()];

  const first = days[0]?.when ?? start;
  const last = days[days.length - 1]?.when ?? end;

  // Inclusive day count. `end` carries a 23:59:59 time component, so the
  // difference is floored rather than rounded to avoid counting an extra day.
  const spanDays = (a, b) => Math.floor((b - a) / 86400000) + 1;
  const periodDays = start && end
    ? spanDays(start, end)
    : (first && last ? spanDays(first, last) : days.length);

  const used = days.filter((d) => (d.usage_hours ?? 0) > 0);
  const usageHours = used.map((d) => d.usage_hours);
  const compliant = used.filter((d) => d.usage_hours >= 4);
  const nonCompliant = used.filter((d) => d.usage_hours < 4);
  const totalHours = usageHours.reduce((a, b) => a + b, 0);

  const pressures = days.map((d) => d.pressure_95).filter(Number.isFinite);
  const leaks = days.map((d) => d.mask_leak).filter(Number.isFinite);
  const ahis = days.map((d) => d.ahi).filter(Number.isFinite);

  const settings = deviceData?.settings || {};
  const rawMode = String(settings.therapy_mode || days[days.length - 1]?.mode || 'CPAP');
  const mode = /bipap/i.test(rawMode) ? 'bipap' : /auto/i.test(rawMode) ? 'auto' : 'cpap';

  // A file export carries the pressure the device was *told* to deliver, not a
  // measured trace. Reporting a set value under "median"/"95th percentile"
  // would misstate it, so those stay blank and the set value is reported as
  // exactly that.
  const measured = pressureSource !== 'set';

  return {
    mode,
    pressureSource,
    modeLabel: mode === 'bipap' ? 'BiPAP (ST MODE)' : mode === 'auto' ? 'AUTO CPAP' : 'CPAP',
    settings,
    days,
    periodStart: start || first,
    periodEnd: end || last,

    usage: {
      periodDays,
      usedDays: used.length,
      usedPct: pct(used.length, periodDays),
      compliantDays: compliant.length,
      compliantPct: pct(compliant.length, periodDays),
      shortDays: nonCompliant.length,
      shortPct: pct(nonCompliant.length, periodDays),
      totalHours,
      avgTotalDays: periodDays ? totalHours / periodDays : NaN,
      avgUsedDays: used.length ? totalHours / used.length : NaN,
      medianUsedDays: median(usageHours),
    },

    // The telemetry frame reports a combined AHI only — the apnea/hypopnea
    // split is not transmitted, so it is reported as unavailable.
    therapy: {
      ahi: mean(ahis),
      hi: NaN,
      ai: NaN,
      centralAi: NaN,
      obstructiveAi: NaN,
      unknownAi: NaN,
      avgLeak: mean(leaks),
      leakThreshold: 24,
      pressureMedian: NaN,
      pressure95: measured ? mean(pressures) : NaN,
      pressureMax: measured && pressures.length ? Math.max(...pressures) : NaN,
      pressureSet: measured ? NaN : mean(pressures),
    },

    // Not present in the CVT30 telemetry payload; sections stay hidden.
    ventilation: { tidal: null, respiratoryRate: null, minuteVentilation: null },
  };
}

// ── SVG chart ─────────────────────────────────────────────────────────────────

const CHART = { w: 560, h: 215, left: 34, right: 8, top: 10, bottom: 52 };

/**
 * Axis scale for a series. Each chart has the reference report's fixed range as
 * its floor so a well-controlled patient's chart is not zoomed in to the point
 * of exaggerating tiny variations; it only grows past that if the data demands.
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

function barChart({ days, valueKey, yMax, yStep, color, colorFor, threshold }) {
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

  // Vertical guides mirror the reference report's ruled plot area.
  const columnGuides = n
    ? Array.from({ length: Math.min(n, 40) + 1 }, (_, i) => {
      const x = CHART.left + (plotW / Math.min(n, 40)) * i;
      return `<line x1="${x.toFixed(1)}" y1="${CHART.top}" x2="${x.toFixed(1)}" y2="${baseY}" stroke="${C.grid}" stroke-width="0.4"/>`;
    }).join('')
    : '';

  const slot = n ? plotW / n : 0;
  const barW = Math.max(1.2, Math.min(slot * 0.62, 9));

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
    const text = shortDate(day.when) || esc(day.date || '');
    return `<text x="${x.toFixed(1)}" y="${baseY + 6}" font-size="5.6" fill="${C.axis}" text-anchor="end" transform="rotate(-45 ${x.toFixed(1)} ${baseY + 6})">${esc(text)}</text>`;
  }).join('');

  const thresholdLine = Number.isFinite(threshold) && threshold > 0 && threshold <= yMax
    ? `<line x1="${CHART.left}" y1="${(baseY - (threshold / yMax) * plotH).toFixed(1)}" x2="${CHART.w - CHART.right}" y2="${(baseY - (threshold / yMax) * plotH).toFixed(1)}" stroke="${C.threshold}" stroke-width="0.9" stroke-dasharray="4 3"/>`
    : '';

  return `<svg class="chart" viewBox="0 0 ${CHART.w} ${CHART.h}" role="img">
    ${columnGuides}${gridlines}${bars}${thresholdLine}
    <line x1="${CHART.left}" y1="${baseY}" x2="${CHART.w - CHART.right}" y2="${baseY}" stroke="${C.axis}" stroke-width="0.7"/>
    <line x1="${CHART.left}" y1="${CHART.top}" x2="${CHART.left}" y2="${baseY}" stroke="${C.axis}" stroke-width="0.7"/>
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

export function buildTherapyReportHTML({ deviceData, sessions, startDate, endDate, pressureSource }) {
  const r = deriveReport({ deviceData, sessions, startDate, endDate, pressureSource });
  const { usage, therapy, settings, days } = r;

  const patient = deviceData?.patient || {};
  const serial = deviceData?.serial || settings.serial || '—';
  const period = `${shortDate(r.periodStart)} - ${shortDate(r.periodEnd)}`;

  const dob = patient.dob ? new Date(patient.dob) : null;
  const age = dob && !Number.isNaN(dob.getTime())
    ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 86400000))
    : null;

  // Mode-specific settings block, mirroring the two reference layouts.
  const settingsRows = r.mode === 'bipap'
    ? [
      ['Serial number', serial],
      ['Device', deviceData?.model || '—'],
      ['Mode', r.modeLabel],
      ['IPAP', num(settings.max_pressure, 0)],
      ['EPAP', num(settings.min_pressure, 0)],
    ]
    : r.mode === 'auto'
      ? [
        ['Serial number', serial],
        ['Device', deviceData?.model || '—'],
        ['Mode', r.modeLabel],
        ['Min Pressure', num(settings.min_pressure, 0)],
        ['Max Pressure', num(settings.max_pressure, 0)],
        ['A-Flex', settings.aflex > 0 ? 'ON' : 'OFF'],
        settings.aflex > 0 ? ['A-Flex Level', String(settings.aflex)] : null,
      ]
      : [
        ['Serial number', serial],
        ['Device', deviceData?.model || '—'],
        ['Mode', r.modeLabel],
        ['Pressure', num(settings.pressure, 1)],
        ['Ramp', settings.ramp ? `${settings.ramp} min` : 'Off'],
      ];

  // Axis ranges default to the reference report's, growing only if data exceeds them.
  const usageScale = scaleFor(days.map((d) => d.usage_hours), 24, 4);
  const pressureScale = scaleFor(days.map((d) => d.pressure_95), r.mode === 'bipap' ? 36 : 24, 4);
  const ahiScale = scaleFor(days.map((d) => d.ahi), 40, 4);
  const leakScale = scaleFor([...days.map((d) => d.mask_leak), 24], 100, 20);

  const usagePanel = [
    ['Usage days', `${usage.usedDays}/${usage.periodDays} Days (${usage.usedPct}%)`, C.usagePurple],
    ['>= 4 hour days', `${usage.compliantDays} (${usage.compliantPct}%)`, C.usageGreen],
    ['< 4 hour days', `${usage.shortDays} (${usage.shortPct}%)`, C.usageLow],
    ['Used Hours', longHoursMinutes(usage.totalHours), C.text],
  ];

  const setPressureRows = [
    ['Mode', r.modeLabel, C.text],
    r.mode === 'bipap' ? ['IPAP', num(settings.max_pressure, 0), C.text] : ['Set Max Pressure', num(settings.max_pressure, 0), C.text],
    r.mode === 'bipap' ? ['EPAP', num(settings.min_pressure, 0), C.text] : ['Set Min Pressure', num(settings.min_pressure, 0), C.text],
    ['Set Pressure (avg)', num(therapy.pressureSet), C.pressureAuto],
  ];

  const pressurePanel = r.pressureSource === 'set'
    ? setPressureRows
    : r.mode === 'bipap'
    ? [
      ['Mode', r.modeLabel, C.text],
      ['IPAP', num(settings.max_pressure, 0), C.text],
      ['EPAP', num(settings.min_pressure, 0), C.text],
    ]
    : [
      ['Mode', r.modeLabel, C.text],
      ['Set Max Pressure', num(settings.max_pressure, 0), C.text],
      ['Set Min Pressure', num(settings.min_pressure, 0), C.text],
      ['Maximum (avg)', num(therapy.pressureMax), C.text],
      ['95th % (avg)', num(therapy.pressure95), C.pressureAuto],
      ['Median (avg)', num(therapy.pressureMedian), C.text],
    ];

  const pressureColor = r.mode === 'bipap' ? C.pressureBipap : C.pressureAuto;

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

  .doc-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 26px; }
  .logo { width: 186px; flex-shrink: 0; }
  .logo-art { width: 100%; height: auto; display: block; }
  .patient { text-align: right; line-height: 1.55; }
  .patient .name { font-size: 19px; color: #222; margin-bottom: 4px; }
  .patient .meta { font-size: 11px; color: #444; }

  section { margin-bottom: 26px; }

  .kv {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 5px 2px; font-size: 11px;
  }
  .kv span:last-child { text-align: right; }
  .rule { border-bottom: 1px solid ${C.rule}; padding-bottom: 8px; }

  .metric { display: flex; align-items: baseline; padding: 5px 2px; font-size: 11px; }
  .metric .metric-name { width: 168px; flex-shrink: 0; }
  .metric .pair { display: inline-flex; gap: 7px; align-items: baseline; margin-right: 26px; }
  .metric .pair b { font-weight: 700; }

  .chart-section { break-inside: avoid; page-break-inside: avoid; }
  .chart-row { display: flex; gap: 14px; align-items: stretch; }
  .stat-panel {
    width: 205px; flex-shrink: 0; background: ${C.panel};
    padding: 14px 14px; display: flex; flex-direction: column; justify-content: center; gap: 11px;
  }
  .stat-row { display: flex; justify-content: space-between; gap: 10px; font-size: 10px; }
  .stat-label { flex-shrink: 0; }
  .stat-value { text-align: right; }
  .chart-wrap { flex: 1; min-width: 0; }
  .chart { width: 100%; height: auto; display: block; }

  .page-break { page-break-before: always; break-before: page; }

  .footer {
    position: fixed; left: 0; right: 0; bottom: 6mm;
    text-align: center; font-size: 9.5px; font-style: italic; font-weight: 700;
    color: #222; padding-top: 6px; border-top: 1px solid #999;
    margin: 0 12mm;
  }

  .note {
    margin-top: 10px; font-size: 9px; color: #777; line-height: 1.5;
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

<div class="doc-head">
  ${logoMarkup()}
  <div class="patient">
    <div class="name">${esc(patient.name || serial)}</div>
    <div class="meta">Patient ID: ${esc(patient.id || serial)}</div>
    ${patient.dob ? `<div class="meta">DOB: ${esc(patient.dob)}</div>` : ''}
    ${age != null ? `<div class="meta">Age: ${age} Years</div>` : ''}
    ${patient.gender ? `<div class="meta">Gender: ${esc(patient.gender)}</div>` : ''}
  </div>
</div>

<section>
  <h2>Therapy Report (${esc(period)})</h2>
  <div class="rule">${kvRows(settingsRows)}</div>
</section>

<section>
  <h2>Therapy</h2>
  <div class="rule">
    ${r.mode !== 'bipap' ? `
    <div class="metric">
      <span class="metric-name">Pressure-cmH2O</span>
      <span class="pair">Median: <b>${num(therapy.pressureMedian)}</b></span>
      <span class="pair">95th percentile: <b>${num(therapy.pressure95)}</b></span>
      <span class="pair">Maximum: <b>${num(therapy.pressureMax)}</b></span>
    </div>` : ''}
    <div class="metric">
      <span class="metric-name">Events per hour</span>
      <span class="pair">AI: <b>${num(therapy.ai, 2)}</b></span>
      <span class="pair">HI: <b>${num(therapy.hi, 2)}</b></span>
      <span class="pair">AHI: <b>${num(therapy.ahi, 2)}</b></span>
    </div>
    <div class="metric">
      <span class="metric-name">Apnea Index - L/Min</span>
      <span class="pair">Central: <b>${num(therapy.centralAi, 2)}</b></span>
      <span class="pair">Obstructive: <b>${num(therapy.obstructiveAi, 2)}</b></span>
      <span class="pair">Unknown: <b>${num(therapy.unknownAi, 2)}</b></span>
    </div>
    <div class="metric">
      <span class="metric-name">Average Leak - L/Min</span>
      <span class="pair"><b>${num(therapy.avgLeak)}</b></span>
    </div>
  </div>
</section>

<section>
  <h2>Usage</h2>
  <div class="rule">
    ${kvRows([
      ['Usage days', `${usage.usedDays}/${usage.periodDays} Days (${usage.usedPct}%)`],
      ['>= 4 hours', `${usage.compliantDays} (${usage.compliantPct}%)`],
      ['< 4 hours', `${usage.shortDays} (${usage.shortPct}%)`],
      ['Usage hours', longHoursMinutes(usage.totalHours)],
      ['Average usage (Total Days)', hoursMinutes(usage.avgTotalDays)],
      ['Average usage (Days Used)', hoursMinutes(usage.avgUsedDays)],
      ['Median usage (Days Used)', hoursMinutes(usage.medianUsedDays)],
    ])}
  </div>
</section>

<div class="page-break"></div>

${chartSection('Usage (Hours)', usagePanel, barChart({
  days, valueKey: 'usage_hours', yMax: usageScale.max, yStep: usageScale.step,
  colorFor: (v) => (v >= 4 ? C.usageOk : C.usageLow), threshold: 4,
}))}

${chartSection(r.pressureSource === 'set' ? 'Set Pressure (cmH2O)' : 'Pressure (cmH2O)', pressurePanel, barChart({
  days, valueKey: 'pressure_95', yMax: pressureScale.max, yStep: pressureScale.step, color: pressureColor,
}))}

${chartSection('AHI (Events/Hour)', [
  ['AHI', num(therapy.ahi), C.ahiPink],
  ['HI', num(therapy.hi), C.ahiPinkLight],
  ['AI', num(therapy.ai), C.text],
], barChart({ days, valueKey: 'ahi', yMax: ahiScale.max, yStep: ahiScale.step, color: C.ahiBar }))}

${chartSection('Leak', [
  ['Set Threshold', `${therapy.leakThreshold.toFixed(1)} L/min`, C.leak],
  ['Maximum (avg)', num(therapy.avgLeak), C.leak],
], barChart({
  days, valueKey: 'mask_leak', yMax: leakScale.max, yStep: leakScale.step,
  color: C.leak, threshold: therapy.leakThreshold,
}))}

<p class="note">
  Report generated from ${esc(deviceData?.sourceLabel || 'device telemetry')} for serial ${esc(serial)} over ${usage.periodDays} day(s).
  ${r.pressureSource === 'set' ? 'Pressure is the value the device was set to deliver; this source carries no measured pressure trace, so median, 95th percentile and maximum are left blank.' : ''}
  Values shown as “—” are not transmitted by this device and have been left blank rather than estimated.
</p>

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
