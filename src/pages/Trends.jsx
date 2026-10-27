import { useNotify } from '../context/NotifyContext';
import DeviceDataState from '../components/DeviceDataState';
import { TrendsSkeleton } from '../components/Skeleton';
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
    // Average only nights that actually carry the value; a missing reading is not a 0.
    const values = (key) => displaySessions.map((s) => s[key]).filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
    const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const usage = values('usage_hours');
    const avgUsage = mean(usage);
    const avgAhi = mean(values('ahi'));
    const avgLeak = mean(values('mask_leak'));
    const pressures = values('pressure_95');
    const avgPressure = mean(pressures);

    return {
      avgUsage: avgUsage == null ? '— hrs' : `${avgUsage.toFixed(1)} hrs`,
      compliance: usage.length ? `${Math.round((usage.filter((h) => h >= 4).length / usage.length) * 100)}% Compliance` : '— Compliance',
      avgAhi: avgAhi == null ? '— / hr' : `${avgAhi.toFixed(1)} / hr`,
      ahiStatus: avgAhi == null ? '—' : avgAhi <= 5.0 ? 'Within target' : 'Elevated',
      avgLeak: avgLeak == null ? '— L/m' : `${avgLeak.toFixed(1)} L/m`,
      leakStatus: avgLeak == null ? '—' : avgLeak <= 24 ? 'Within target' : 'High Leak',
      pressure95: avgPressure == null ? '— cm H2O' : `${avgPressure.toFixed(1)} cm H2O`,
      maxPressure: pressures.length ? Math.max(...pressures).toFixed(1) : '—'
    };
  }, [displaySessions]);

  if (!deviceData) return <DeviceDataState what="therapy trends" skeleton={TrendsSkeleton} />;


  // Exactly the nights on screen, as the device reported them; blanks stay blank.
  const handleExportCSV = () => {
    if (!displaySessions.length) {
      notify.info('Nothing to export', { message: 'There are no therapy sessions in this range yet.' });
      return;
    }
    const cell = (v) => (v == null || Number.isNaN(Number(v)) ? '' : String(v));
    const rows = [
      ['Date', 'Usage hours', 'AHI', 'Leak L/min', 'Pressure cmH2O'],
      ...displaySessions.map((s) => [s.display_date || s.date || '', cell(s.usage_hours), cell(s.ahi), cell(s.mask_leak), cell(s.pressure_95)]),
    ];
    const csv = rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `resprox-trends-${deviceData.serial || 'device'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          <small className={`compliance-tag ${stats.ahiStatus === 'Within target' ? 'pass' : stats.ahiStatus === '—' ? '' : 'fail'}`} style={{ border: 'none', background: 'none', padding: 0 }}>
            {stats.ahiStatus}
          </small>
        </article>
        <article className="kpi-card">
          <span>Average Leak</span>
          <strong>{stats.avgLeak}</strong>
          <small className={stats.leakStatus === 'High Leak' ? 'amber-text' : stats.leakStatus === '—' ? '' : 'green-text'}>{stats.leakStatus}</small>
        </article>
        <article className="kpi-card">
          <span>Average Pressure</span>
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
