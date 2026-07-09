import React, { useState, useMemo } from 'react';
import GlassCard from '../components/GlassCard';
import TrendChart from '../components/TrendChart';
import { DownloadIcon } from '../components/Icons';
import { useTherapy } from '../context/TherapyContext';

export default function Trends() {
  const { deviceData } = useTherapy();
  const [timeFilter, setTimeFilter] = useState('week'); // 'week' | 'month' | 'custom'
  const [usageRange, setUsageRange] = useState('7d'); // '7d' | '30d' | '90d'

  const sessions = useMemo(() => {
    return deviceData ? deviceData.sessions : [];
  }, [deviceData]);

  const usage7d = useMemo(() => {
    return sessions.map(s => ({
      day: s.date.split(' ')[0],
      usage: Math.round((s.usage_hours / 8) * 100)
    }));
  }, [sessions]);

  const ahiData = useMemo(() => {
    return sessions.map(s => ({
      day: s.date.split(' ')[0],
      ahi: s.ahi
    }));
  }, [sessions]);

  const leakData = useMemo(() => {
    return sessions.map(s => ({
      day: s.date.split(' ')[0],
      leak: s.mask_leak
    }));
  }, [sessions]);

  const pressureData = useMemo(() => {
    return sessions.map(s => ({
      day: s.date.split(' ')[0],
      pressure: s.pressure_95
    }));
  }, [sessions]);

  // Compute metrics stats dynamically
  const stats = useMemo(() => {
    if (!sessions.length) {
      return {
        avgUsage: '— hrs',
        compliance: '— Compliance',
        avgAhi: '— / hr',
        ahiStatus: '—',
        avgLeak: '— L/m',
        leakStatus: '—',
        pressure95: '— cm H2O',
        maxPressure: '—'
      };
    }
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
  }, [sessions]);

  if (!deviceData) {
    return (
      <div className="trends-page" style={{ padding: '40px 20px', textAlign: 'center' }}>
        <GlassCard>
          <h2 style={{ color: '#0d7de6', fontWeight: 800 }}>No Device Selected</h2>
          <p style={{ color: 'var(--muted)', marginTop: 8 }}>Please select a device from the Devices registry to view therapy trends.</p>
        </GlassCard>
      </div>
    );
  }

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

      {/* KPI Row */}
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
        <GlassCard>
          <div className="chart-header-row">
            <h3>Usage Trend</h3>
          </div>
          {usage7d.length ? (
            <TrendChart data={usage7d} yKey="usage" yUnit="%" type="bar" />
          ) : (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)' }}>No data available</div>
          )}
        </GlassCard>

        <GlassCard>
          <div className="chart-header-row">
            <h3>AHI Trend</h3>
          </div>
          {ahiData.length ? (
            <TrendChart data={ahiData} yKey="ahi" yUnit="" type="line" colorStart="#dc2626" />
          ) : (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)' }}>No data available</div>
          )}
        </GlassCard>

        <GlassCard>
          <div className="chart-header-row">
            <h3>Leak Rate Trend</h3>
          </div>
          {leakData.length ? (
            <TrendChart data={leakData} yKey="leak" yUnit=" L/min" type="area" colorStart="#28d5c9" colorEnd="#1774e6" />
          ) : (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)' }}>No data available</div>
          )}
        </GlassCard>

        <GlassCard>
          <div className="chart-header-row">
            <h3>Pressure Trend</h3>
          </div>
          {pressureData.length ? (
            <TrendChart data={pressureData} yKey="pressure" yUnit=" cmH2O" type="line" colorStart="#1A7EE4" />
          ) : (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)' }}>No data available</div>
          )}
        </GlassCard>
      </section>
    </div>
  );
}
