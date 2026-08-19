import React, { useMemo } from 'react';
import GlassCard from '../components/GlassCard';
import TrendChart from '../components/TrendChart';
import { MaskIcon, InfoIcon } from '../components/Icons';
import { useTherapy } from '../context/TherapyContext';

export default function MaskFit() {
  const { deviceData } = useTherapy();

  const sessions = useMemo(() => {
    return deviceData ? deviceData.sessions : [];
  }, [deviceData]);

  const score = useMemo(() => {
    if (sessions.length) {
      const avgLeak = sessions.reduce((acc, s) => acc + s.mask_leak, 0) / sessions.length;
      return Math.max(50, Math.min(100, Math.round(100 - (avgLeak * 1.5))));
    }
    return null;
  }, [sessions]);

  const leakTrend = useMemo(() => {
    return sessions.map(s => ({
      day: s.date.split(' ')[0],
      leak: s.mask_leak
    }));
  }, [sessions]);

  const recommendations = useMemo(() => {
    const defaultRecs = [
      { text: 'Adjust upper strap to prevent nasal bridge leaks.', type: 'warning' },
      { text: 'Replace cushion if seal degradations continue.', type: 'info' },
      { text: 'Mask seal excellent during deep sleep intervals.', type: 'success' }
    ];

    if (deviceData && deviceData.live_data) {
      const leak = deviceData.live_data.mask_leak;
      if (leak > 24.0) {
        return [
          { text: 'High mask leak detected! Adjust headgear and reposition mask cushion.', type: 'warning' },
          { text: 'Check for leaks around the corners of the mouth or eyes.', type: 'info' },
          ...defaultRecs.slice(1)
        ];
      }
    }
    return defaultRecs;
  }, [deviceData]);

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
        {/* Fit Score Circular Widget */}
        <GlassCard className="maskfit-score-card">
          <div className="section-title">
            <h2>Mask Fit Score</h2>
          </div>
          {score !== null ? (
            <div className="score-widget-container">
              <div className="score-ring-large">
                <div className="score-ring-inner">
                  <span className="score-number">{score}</span>
                  <span className="score-label">
                    {score >= 90 ? 'Excellent Fit' : score >= 80 ? 'Good Fit' : 'Needs Adjustment'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)' }}>No score available</div>
          )}
          <p className="score-footnote">
            High fit scores indicate that your mask seal had minimal leaks during therapy.
          </p>
        </GlassCard>

        {/* Recommendations */}
        <GlassCard>
          <div className="section-title">
            <h2>Fit Recommendations</h2>
          </div>
          <div className="recommendations-list">
            {recommendations.map((rec, idx) => (
              <div key={idx} className={`recommendation-item ${rec.type}`}>
                <div className="rec-icon">
                  <InfoIcon />
                </div>
                <p>{rec.text}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      <div className="section-grid-2" style={{ marginTop: '20px' }}>
        {/* Leak Trend Chart */}
        <GlassCard>
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

        {/* Leak Events */}
        <GlassCard>
          <div className="section-title">
            <h2>Leak Events</h2>
          </div>
          <div className="events-timeline">
            <div className="event-item">
              <div className="event-time">02:14 AM</div>
              <div className="event-body">
                <strong>Large Leak Event Detected</strong>
                <span>Leak rate peaked at 32 L/min (duration: 4 mins).</span>
              </div>
            </div>
            <div className="event-item">
              <div className="event-time">04:30 AM</div>
              <div className="event-body">
                <strong>Minor Seal Slippage</strong>
                <span>Temporary leak of 12 L/min, resolved automatically.</span>
              </div>
            </div>
            <div className="event-item">
              <div className="event-time">06:05 AM</div>
              <div className="event-body">
                <strong>Optimal Seal Restored</strong>
                <span>Steady seal maintained until session end.</span>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
