import React, { useState, useMemo } from 'react';
import GlassCard from '../components/GlassCard';
import TrendChart from '../components/TrendChart';
import { DownloadIcon } from '../components/Icons';
import { useTherapy } from '../context/TherapyContext';

// Default static fallback sets
const defaultUsage7d = [
  { day: 'Mon', usage: 88 },
  { day: 'Tue', usage: 94 },
  { day: 'Wed', usage: 91 },
  { day: 'Thu', usage: 97 },
  { day: 'Fri', usage: 92 },
  { day: 'Sat', usage: 95 },
  { day: 'Sun', usage: 98 }
];

const defaultAhiData = [
  { day: 'Mon', ahi: 2.1 },
  { day: 'Tue', ahi: 1.8 },
  { day: 'Wed', ahi: 2.5 },
  { day: 'Thu', ahi: 1.2 },
  { day: 'Fri', ahi: 1.9 },
  { day: 'Sat', ahi: 1.5 },
  { day: 'Sun', ahi: 0.9 }
];

const defaultLeakData = [
  { day: 'Mon', leak: 24 },
  { day: 'Tue', leak: 21 },
  { day: 'Wed', leak: 26 },
  { day: 'Thu', leak: 19 },
  { day: 'Fri', leak: 22 },
  { day: 'Sat', leak: 20 },
  { day: 'Sun', leak: 17 }
];

const defaultPressureData = [
  { day: 'Mon', pressure: 11.8 },
  { day: 'Tue', pressure: 12.0 },
  { day: 'Wed', pressure: 11.5 },
  { day: 'Thu', pressure: 12.2 },
  { day: 'Fri', pressure: 11.9 },
  { day: 'Sat', pressure: 12.4 },
  { day: 'Sun', pressure: 11.8 }
];

const usage30d = Array.from({ length: 30 }, (_, i) => ({
  day: `Day ${i + 1}`,
  usage: Math.floor(Math.random() * 20) + 80
}));

const usage90d = Array.from({ length: 12 }, (_, i) => ({
  day: `Wk ${i + 1}`,
  usage: Math.floor(Math.random() * 15) + 85
}));

export default function Trends() {
  const { deviceData } = useTherapy();
  const [timeFilter, setTimeFilter] = useState('week'); // 'week' | 'month' | 'custom'
  const [usageRange, setUsageRange] = useState('7d'); // '7d' | '30d' | '90d'

  const sessions = useMemo(() => {
    return deviceData ? deviceData.sessions : [];
  }, [deviceData]);

  const usage7d = useMemo(() => {
    if (sessions.length) {
      return sessions.map(s => ({
        day: s.date.split(' ')[0],
        usage: Math.round((s.usage_hours / 8) * 100)
      }));
    }
    return defaultUsage7d;
  }, [sessions]);

  const ahiData = useMemo(() => {
    if (sessions.length) {
      return sessions.map(s => ({
        day: s.date.split(' ')[0],
        ahi: s.ahi
      }));
    }
    return defaultAhiData;
  }, [sessions]);

  const leakData = useMemo(() => {
    if (sessions.length) {
      return sessions.map(s => ({
        day: s.date.split(' ')[0],
        leak: s.mask_leak
      }));
    }
    return defaultLeakData;
  }, [sessions]);

  const pressureData = useMemo(() => {
    if (sessions.length) {
      return sessions.map(s => ({
        day: s.date.split(' ')[0],
        pressure: s.pressure_95
      }));
    }
    return defaultPressureData;
  }, [sessions]);

  // Compute metrics stats dynamically
  const stats = useMemo(() => {
    if (sessions.length) {
      const avgUsage = sessions.reduce((acc, s) => acc + s.usage_hours, 0) / sessions.length;
      const complianceCount = sessions.filter(s => s.usage_hours >= 4.0).length;
      const avgAhi = sessions.reduce((acc, s) => acc + s.ahi, 0) / sessions.length;
      const avgLeak = sessions.reduce((acc, s) => acc + s.mask_leak, 0) / sessions.length;
      const avgPressure = sessions.reduce((acc, s) => acc + s.pressure_95, 0) / sessions.length;
      const maxPressure = Math.max(...sessions.map(s => s.pressure_95));

      return {
        avgUsage: `${avgUsage.toFixed(1)} hrs`,
        compliance: `${Math.round((complianceCount / sessions.length) * 100)}% Compliance`,
        avgAhi: `${avgAhi.toFixed(1)} / hr`,
        ahiStatus: avgAhi <= 5.0 ? 'Optimal' : 'Elevated',
        avgLeak: `${avgLeak.toFixed(1)} L/m`,
        leakStatus: avgLeak <= 24 ? 'Excellent Seal' : 'High Leak',
        pressure95: `${avgPressure.toFixed(1)} cm H2O`,
        maxPressure: maxPressure.toFixed(1)
      };
    }
    return {
      avgUsage: '7.2 hrs',
      compliance: '92% Compliance',
      avgAhi: '1.6 / hr',
      ahiStatus: 'Optimal',
      avgLeak: '21.2 L/m',
      leakStatus: 'Excellent Seal',
      pressure95: '12.1 cm H2O',
      maxPressure: '12.4'
    };
  }, [sessions]);

  const getUsageData = () => {
    if (usageRange === '30d') return usage30d;
    if (usageRange === '90d') return usage90d;
    return usage7d;
  };

  const handleExportCSV = () => {
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
          <strong>{stats.avgUsage}</strong>
          <small className="green-text">{stats.compliance}</small>
        </article>
        <article className="kpi-card">
          <span>Average AHI</span>
          <strong>{stats.avgAhi}</strong>
          <small className={`compliance-tag ${stats.ahiStatus === 'Optimal' ? 'pass' : 'fail'}`} style={{ border: 'none', background: 'none', padding: 0 }}>
            {stats.ahiStatus}
          </small>
        </article>
        <article className="kpi-card">
          <span>Average Leak</span>
          <strong>{stats.avgLeak}</strong>
          <small className="green-text">{stats.leakStatus}</small>
        </article>
        <article className="kpi-card">
          <span>95th Percentile Pressure</span>
          <strong>{stats.pressure95}</strong>
          <small style={{ color: 'var(--muted)' }}>Max: {stats.maxPressure}</small>
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
