import React from 'react';

export default function MetricCard({ title, subtitle, value, badge, footer, accent, children }) {
  const isUsageCard = title === 'Usage';
  return (
    <article className={`metric-card ${accent || 'soft'} ${isUsageCard ? 'usage-card' : ''}`}>
      <div className="metric-head">
        <div>
          <p>{title}</p>
          <span>{subtitle}</span>
        </div>
        {badge ? <span className="badge">{badge}</span> : null}
      </div>

      {isUsageCard ? (
        <div className="usage-stack">
          <div className="usage-value">{value}</div>
          <div className="usage-ring">
            <div className="ring">
              <div className="ring-inner">
                <strong>94%</strong>
                <span>of goal</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="metric-value">{value}</div>
      )}

      <div className="metric-footer">{footer}</div>
    </article>
  );
}
