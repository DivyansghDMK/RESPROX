import { useNotify } from '../context/NotifyContext';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import GlassCard from '../components/GlassCard';
import TrendChart from '../components/TrendChart';
import { DownloadIcon } from '../components/Icons';
import { useTherapy } from '../context/TherapyContext';

export default function Trends() {
  const notify = useNotify();
  const { deviceData, setDeviceData, setAdminActiveSerial } = useTherapy();
  const [timeFilter, setTimeFilter] = useState('week'); // 'week' | 'month' | 'custom'
  const [usageRange, setUsageRange] = useState('7d'); // '7d' | '30d' | '90d'



  const sessions = useMemo(() => {
    return deviceData ? deviceData.sessions : [];
  }, [deviceData]);

  // Determine subset of data to plot based on time filters
  const displaySessions = useMemo(() => {
    if (timeFilter === 'week') {
      return sessions.slice(-7);
    }
    if (timeFilter === 'month') {
      return sessions.slice(-30);
    }
    return sessions;
  }, [sessions, timeFilter]);

  const usage7d = useMemo(() => {
    return displaySessions.map(s => ({
      day: s.date,
      usage: Math.round((s.usage_hours / 8) * 100)
    }));
  }, [displaySessions]);

  const ahiData = useMemo(() => {
    return displaySessions.map(s => ({
      day: s.date,
      ahi: s.ahi
    }));
  }, [displaySessions]);

  const leakData = useMemo(() => {
    return displaySessions.map(s => ({
      day: s.date,
      leak: s.mask_leak
    }));
  }, [displaySessions]);

  const pressureData = useMemo(() => {
    return displaySessions.map(s => ({
      day: s.date,
      pressure: s.pressure_95
    }));
  }, [displaySessions]);

  const stats = useMemo(() => {
    if (!displaySessions.length) {
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
    const avgUsage = displaySessions.reduce((acc, s) => acc + s.usage_hours, 0) / displaySessions.length;
    const complianceCount = displaySessions.filter(s => s.usage_hours >= 4.0).length;
    const avgAhi = displaySessions.reduce((acc, s) => acc + s.ahi, 0) / displaySessions.length;
    const avgLeak = displaySessions.reduce((acc, s) => acc + s.mask_leak, 0) / displaySessions.length;
    const avgPressure = displaySessions.reduce((acc, s) => acc + s.pressure_95, 0) / displaySessions.length;
    const maxPressure = Math.max(...displaySessions.map(s => s.pressure_95));

    return {
      avgUsage: `${avgUsage.toFixed(1)} hrs`,
      compliance: `${Math.round((complianceCount / displaySessions.length) * 100)}% Compliance`,
      avgAhi: `${avgAhi.toFixed(1)} / hr`,
      ahiStatus: avgAhi <= 5.0 ? 'Optimal' : 'Elevated',
      avgLeak: `${avgLeak.toFixed(1)} L/m`,
      leakStatus: avgLeak <= 24 ? 'Excellent Seal' : 'High Leak',
      pressure95: `${avgPressure.toFixed(1)} cm H2O`,
      maxPressure: maxPressure.toFixed(1)
    };
  }, [displaySessions]);

  if (!deviceData) {
    return (
      <div className="trends-page" style={{ padding: '40px 20px', textAlign: 'center' }}>
        <GlassCard>
          <h2 style={{ color: 'var(--accent)', fontWeight: 800 }}>No Device Selected</h2>
          <p style={{ color: 'var(--muted)', marginTop: 8 }}>Please select a device from the Devices registry to view therapy trends.</p>
        </GlassCard>
      </div>
    );
  }

  const handleExportCSV = () => {
    notify.info('Preparing export', { message: 'Compliance and metrics trends are being exported as CSV.' });
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
              Full History
            </button>
          </div>
          
          <button className="icon-text-button" onClick={handleExportCSV}>
            <DownloadIcon />
            <span>Export CSV</span>
          </button>
        </div>

        {timeFilter === 'custom' && (
          <div className="custom-date-inputs" style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Showing full record history of <strong>{sessions.length}</strong> therapy sessions spanning from <strong>{sessions[0]?.date || '—'}</strong> to <strong>{sessions[sessions.length - 1]?.date || '—'}</strong>.
            </span>
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
          <small style={{ color: 'var(--muted)' }}>Max: {stats.maxPressure} cmH2O</small>
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
            <TrendChart data={leakData} yKey="leak" yUnit=" L/min" type="area" colorStart="var(--accent-2)" colorEnd="var(--accent)" />
          ) : (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)' }}>No data available</div>
          )}
        </GlassCard>

        <GlassCard>
          <div className="chart-header-row">
            <h3>Pressure Trend</h3>
          </div>
          {pressureData.length ? (
            <TrendChart data={pressureData} yKey="pressure" yUnit=" cmH2O" type="line" colorStart="var(--accent)" />
          ) : (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)' }}>No data available</div>
          )}
        </GlassCard>
      </section>
    </div>
  );
}
