import React, { useMemo } from 'react';
import GlassCard from '../components/GlassCard';
import TrendChart from '../components/TrendChart';
import { InfoIcon } from '../components/Icons';
import { useTherapy } from '../context/TherapyContext';

// Reference used across the app for an acceptable average mask leak.
const LEAK_TARGET = 24;

export default function MaskFit() {
  const { deviceData } = useTherapy();

  // Only nights that actually carry a leak value; a missing reading is not a 0.
  const nights = useMemo(
    () => (deviceData?.sessions || []).filter((s) => s.mask_leak != null && Number.isFinite(Number(s.mask_leak))),
    [deviceData],
  );

  const summary = useMemo(() => {
    if (!nights.length) return null;
    const leaks = nights.map((s) => Number(s.mask_leak));
    const last = nights[nights.length - 1];
    return {
      average: leaks.reduce((a, b) => a + b, 0) / leaks.length,
      above: leaks.filter((l) => l > LEAK_TARGET).length,
      total: leaks.length,
      last: Number(last.mask_leak),
      lastDate: last.display_date || last.date,
    };
  }, [nights]);

  const leakTrend = useMemo(() => nights.map((s) => ({ day: s.date, leak: Number(s.mask_leak) })), [nights]);

  if (!deviceData) {
    return (
      <div className="maskfit-page" style={{ padding: '40px 20px', textAlign: 'center' }}>
        <GlassCard>
          <h2 style={{ color: 'var(--accent)', fontWeight: 800 }}>No Device Selected</h2>
          <p style={{ color: 'var(--muted)', marginTop: 8 }}>Please select a device from the Devices registry to view mask fit telemetry.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="maskfit-page">
      <div className="section-grid-2">
        <GlassCard>
          <div className="section-title">
            <h2>Mask Leak Summary</h2>
          </div>
          {summary ? (
            <div className="overview-stats-grid">
              <div className="overview-stat">
                <span>Last night{summary.lastDate ? ` (${summary.lastDate})` : ''}</span>
                <strong className={summary.last > LEAK_TARGET ? 'amber-text' : 'green-text'}>{summary.last.toFixed(1)} L/min</strong>
              </div>
              <div className="overview-stat">
                <span>Average leak</span>
                <strong className={summary.average > LEAK_TARGET ? 'amber-text' : 'green-text'}>{summary.average.toFixed(1)} L/min</strong>
              </div>
              <div className="overview-stat">
                <span>Nights above {LEAK_TARGET} L/min</span>
                <strong>{summary.above} of {summary.total}</strong>
              </div>
              <div className="overview-stat">
                <span>Reference</span>
                <strong>≤ {LEAK_TARGET} L/min</strong>
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.6 }}>
              No leak readings yet. They appear once the device's session reports are synced.
            </p>
          )}
        </GlassCard>

        <GlassCard>
          <div className="section-title">
            <h2>What this means</h2>
          </div>
          <div className="recommendations-list">
            {!summary ? (
              <div className="recommendation-item info">
                <div className="rec-icon"><InfoIcon /></div>
                <p>Guidance appears here once there are leak readings to base it on.</p>
              </div>
            ) : summary.last > LEAK_TARGET ? (
              <div className="recommendation-item warning">
                <div className="rec-icon"><InfoIcon /></div>
                <p>Last night's average leak was above {LEAK_TARGET} L/min. Check the mask fit and headgear, and whether the cushion needs replacing.</p>
              </div>
            ) : (
              <div className="recommendation-item success">
                <div className="rec-icon"><InfoIcon /></div>
                <p>Last night's average leak was within the {LEAK_TARGET} L/min reference.</p>
              </div>
            )}
            {summary && summary.above > 0 && summary.last <= LEAK_TARGET && (
              <div className="recommendation-item info">
                <div className="rec-icon"><InfoIcon /></div>
                <p>{summary.above} of {summary.total} recorded nights were above the reference. Keep an eye on the trend below.</p>
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      <GlassCard style={{ marginTop: '20px' }}>
        <div className="section-title">
          <h2>Leak Trend</h2>
        </div>
        {leakTrend.length ? (
          <TrendChart
            data={leakTrend}
            yKey="leak"
            yUnit=" L/min"
            type="line"
            colorStart="var(--accent-2)"
            domain={[0, 40]}
          />
        ) : (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)' }}>No trend data available</div>
        )}
      </GlassCard>
    </div>
  );
}
