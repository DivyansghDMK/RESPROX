import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';

const CustomTooltip = ({ active, payload, yKey, yUnit }) => {
  if (active && payload && payload.length) {
    return (
      <div className="chart-tooltip">
        <strong className="tooltip-day">{payload[0].payload.day || payload[0].payload.date}</strong>
        <span className="tooltip-value">{payload[0].value}{yUnit} {yKey}</span>
      </div>
    );
  }
  return null;
};

function TrendChart({
  data,
  xKey = 'day',
  yKey = 'usage',
  yUnit = '%',
  type = 'bar',
  colorStart = '#1A7EE4',
  colorEnd = '#27C6C7',
  height = 300,
  domain
}) {
  const gradientId = `gradient-${yKey}-${type}`;

  const renderChart = () => {
    switch (type) {
      case 'line':
        return (
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 12, fontWeight: 600 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 12, fontWeight: 600 }} domain={domain} />
            <Tooltip content={<CustomTooltip yKey={yKey} yUnit={yUnit} />} />
            <Line type="monotone" dataKey={yKey} stroke={colorStart} strokeWidth={3} dot={{ fill: colorStart, r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colorStart} stopOpacity={0.4} />
                <stop offset="100%" stopColor={colorEnd} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 12, fontWeight: 600 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 12, fontWeight: 600 }} domain={domain} />
            <Tooltip content={<CustomTooltip yKey={yKey} yUnit={yUnit} />} />
            <Area type="monotone" dataKey={yKey} stroke={colorStart} strokeWidth={2} fill={`url(#${gradientId})`} />
          </AreaChart>
        );
      default: // 'bar'
        return (
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colorStart} />
                <stop offset="100%" stopColor={colorEnd} />
              </linearGradient>
            </defs>
            <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 12, fontWeight: 600 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 12, fontWeight: 600 }} domain={domain} />
            <Tooltip cursor={{ fill: 'rgba(28, 50, 87, 0.04)', radius: 12 }} content={<CustomTooltip yKey={yKey} yUnit={yUnit} />} />
            <Bar dataKey={yKey} fill={`url(#${gradientId})`} radius={[12, 12, 0, 0]} maxBarSize={40} />
          </BarChart>
        );
    }
  };

  return (
    <div className="chart-container" style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}

// Recharts re-mounts its whole SVG on each render; four of these on the Trends
// page made every unrelated context update visibly janky.
export default React.memo(TrendChart);
