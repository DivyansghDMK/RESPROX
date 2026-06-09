import React from 'react';
import GlassCard from '../components/GlassCard';
import TrendChart from '../components/TrendChart';
import { MaskIcon, InfoIcon } from '../components/Icons';

const leakTrendData = [
  { day: 'Mon', leak: 24 },
  { day: 'Tue', leak: 19 },
  { day: 'Wed', leak: 28 },
  { day: 'Thu', leak: 15 },
  { day: 'Fri', leak: 22 },
  { day: 'Sat', leak: 18 },
  { day: 'Sun', leak: 12 }
];

export default function MaskFit() {
  const recommendations = [
    { text: 'Adjust upper strap to prevent nasal bridge leaks.', type: 'warning' },
    { text: 'Replace cushion if seal degradations continue.', type: 'info' },
    { text: 'Mask seal excellent during deep sleep intervals.', type: 'success' }
  ];

  return (
    <div className="maskfit-page">
      <div className="section-grid-2">
        {/* Fit Score Circular Widget */}
        <GlassCard className="maskfit-score-card">
          <div className="section-title">
            <h2>Mask Fit Score</h2>
          </div>
          <div className="score-widget-container">
            <div className="score-ring-large">
              <div className="score-ring-inner">
                <span className="score-number">94</span>
                <span className="score-label">Excellent Fit</span>
              </div>
            </div>
          </div>
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
          <TrendChart
            data={leakTrendData}
            yKey="leak"
            yUnit=" L/min"
            type="line"
            colorStart="#28d5c9"
            domain={[0, 40]}
          />
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
