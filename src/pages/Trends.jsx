import React, { useState } from 'react';
import GlassCard from '../components/GlassCard';
import TrendChart from '../components/TrendChart';
import { DownloadIcon } from '../components/Icons';

// Mock Data Sets
const usage7d = [
  { day: 'Mon', usage: 88 },
  { day: 'Tue', usage: 94 },
  { day: 'Wed', usage: 91 },
  { day: 'Thu', usage: 97 },
  { day: 'Fri', usage: 92 },
  { day: 'Sat', usage: 95 },
  { day: 'Sun', usage: 98 }
];

const usage30d = Array.from({ length: 30 }, (_, i) => ({
  day: `Day ${i + 1}`,
  usage: Math.floor(Math.random() * 20) + 80
}));

const usage90d = Array.from({ length: 12 }, (_, i) => ({
  day: `Wk ${i + 1}`,
  usage: Math.floor(Math.random() * 15) + 85
}));

const ahiData = [
  { day: 'Mon', ahi: 2.1 },
  { day: 'Tue', ahi: 1.8 },
  { day: 'Wed', ahi: 2.5 },
  { day: 'Thu', ahi: 1.2 },
  { day: 'Fri', ahi: 1.9 },
  { day: 'Sat', ahi: 1.5 },
  { day: 'Sun', ahi: 0.9 }
];

const leakData = [
  { day: 'Mon', leak: 24 },
  { day: 'Tue', leak: 21 },
  { day: 'Wed', leak: 26 },
  { day: 'Thu', leak: 19 },
  { day: 'Fri', leak: 22 },
  { day: 'Sat', leak: 20 },
  { day: 'Sun', leak: 17 }
];

const pressureData = [
  { day: 'Mon', pressure: 11.8 },
  { day: 'Tue', pressure: 12.0 },
  { day: 'Wed', pressure: 11.5 },
  { day: 'Thu', pressure: 12.2 },
  { day: 'Fri', pressure: 11.9 },
  { day: 'Sat', pressure: 12.4 },
  { day: 'Sun', pressure: 11.8 }
];

export default function Trends() {
  const [timeFilter, setTimeFilter] = useState('week'); // 'week' | 'month' | 'custom'
  const [usageRange, setUsageRange] = useState('7d'); // '7d' | '30d' | '90d'

  const getUsageData = () => {
    if (usageRange === '30d') return usage30d;
    if (usageRange === '90d') return usage90d;
    return usage7d;
  };

  const handleExportCSV = () => {
    // Mock export download trigger
    alert('Exporting CPAP compliance and metrics trends as CSV file...');
  };

  return (
    <div className="trends-page">
      {/* Filters Header */}
      <section className="trends-filters-card therapy-card">
        <div className="trends-filters-wrap">
          <div className="segmented-filters">
            <button
              className={timeFilter === 'week' ? 'active' : ''}
              onClick={() => setTimeFilter('week')}
            >
              Week
            </button>
            <button
              className={timeFilter === 'month' ? 'active' : ''}
              onClick={() => setTimeFilter('month')}
            >
              Month
            </button>
            <button
              className={timeFilter === 'custom' ? 'active' : ''}
              onClick={() => setTimeFilter('custom')}
            >
              Custom Date Range
            </button>
          </div>
          
          <button className="icon-text-button" onClick={handleExportCSV}>
            <DownloadIcon />
            <span>Export CSV</span>
          </button>
        </div>

        {timeFilter === 'custom' && (
          <div className="custom-date-inputs" style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
            <div className="input-field">
              <label>Start Date</label>
              <input type="date" defaultValue="2026-06-01" />
            </div>
            <div className="input-field">
              <label>End Date</label>
              <input type="date" defaultValue="2026-06-07" />
            </div>
          </div>
        )}
      </section>

      {/* KPI Row (Professional Overview) */}
      <section className="kpi-grid">
        <article className="kpi-card">
          <span>Average Usage</span>
          <strong>7.2 hrs</strong>
          <small className="green-text">92% Compliance</small>
        </article>
        <article className="kpi-card">
          <span>Average AHI</span>
          <strong>1.6 / hr</strong>
          <small className="green-text">Optimal</small>
        </article>
        <article className="kpi-card">
          <span>Average Leak</span>
          <strong>21.2 L/m</strong>
          <small className="green-text">Excellent Seal</small>
        </article>
        <article className="kpi-card">
          <span>95th Percentile Pressure</span>
          <strong>12.1 cm H2O</strong>
          <small style={{ color: 'var(--muted)' }}>Max: 12.4</small>
        </article>
      </section>

      {/* Grid of 4 charts */}
      <section className="charts-double-grid">
        {/* Chart 1: Usage Trend (with range options) */}
        <GlassCard>
          <div className="chart-header-row">
            <h3>Usage Trend</h3>
            <div className="mini-segmented">
              <button className={usageRange === '7d' ? 'active' : ''} onClick={() => setUsageRange('7d')}>7 Days</button>
              <button className={usageRange === '30d' ? 'active' : ''} onClick={() => setUsageRange('30d')}>30 Days</button>
              <button className={usageRange === '90d' ? 'active' : ''} onClick={() => setUsageRange('90d')}>90 Days</button>
            </div>
          </div>
          <TrendChart data={getUsageData()} yKey="usage" yUnit="%" type="bar" />
        </GlassCard>

        {/* Chart 2: AHI Trend */}
        <GlassCard>
          <div className="chart-header-row">
            <h3>AHI Trend</h3>
          </div>
          <TrendChart data={ahiData} yKey="ahi" yUnit="" type="line" colorStart="#dc2626" />
        </GlassCard>

        {/* Chart 3: Leak Rate Trend */}
        <GlassCard>
          <div className="chart-header-row">
            <h3>Leak Rate Trend</h3>
          </div>
          <TrendChart data={leakData} yKey="leak" yUnit=" L/min" type="area" colorStart="#28d5c9" colorEnd="#1774e6" />
        </GlassCard>

        {/* Chart 4: Pressure Trend */}
        <GlassCard>
          <div className="chart-header-row">
            <h3>Pressure Trend</h3>
          </div>
          <TrendChart data={pressureData} yKey="pressure" yUnit=" cmH2O" type="line" colorStart="#1A7EE4" />
        </GlassCard>
      </section>
    </div>
  );
}
