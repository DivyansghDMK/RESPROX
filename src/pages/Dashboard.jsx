import React, { useMemo } from 'react';
import { useTherapy } from '../context/TherapyContext';
import MetricCard from '../components/MetricCard';
import TrendChart from '../components/TrendChart';
import SaveButton from '../components/SaveButton';
import {
  SmallDeviceIcon,
  AutoIcon,
  MinusIcon,
  PlusIcon,
  InfoIcon,
  MaskIcon,
  DotsIcon,
  PulseIcon,
  DeviceIcon
} from '../components/Icons';

const metrics = [
  { title: 'Usage', subtitle: 'Last Night', value: '7h 32m', footer: '94% of goal', accent: 'ring' },
  { title: 'AHI', subtitle: 'Last Night', value: '2.1', badge: 'Good', footer: 'Events / hr', accent: 'soft' },
  { title: 'Mask Seal', subtitle: 'Last Night', value: '24 L/min', badge: 'Good', footer: 'Leak Rate', accent: 'soft' },
  { title: 'Pressure', subtitle: '95th Percentile', value: '11.8 cm H2O', footer: 'Max 12.4 cm H2O', accent: 'soft' },
];

const trendData = [
  { day: 'Mon', usage: 88 },
  { day: 'Tue', usage: 94 },
  { day: 'Wed', usage: 91 },
  { day: 'Thu', usage: 97 },
  { day: 'Fri', usage: 92 },
  { day: 'Sat', usage: 95 },
  { day: 'Sun', usage: 98 }
];

export default function Dashboard() {
  const {
    mode,
    setMode,
    pressure,
    setPressure,
    minPressure,
    setMinPressure,
    maxPressure,
    setMaxPressure,
    aflex,
    setAflex,
    ramp,
    setRamp,
  } = useTherapy();

  const progress = useMemo(() => ((pressure - 4) / (30 - 4)) * 100, [pressure]);

  const getThresholdClass = (percentage) => {
    if (percentage >= 60) return 'green';
    if (percentage >= 40) return 'amber';
    return 'red';
  };

  const maintenanceItems = [
    { title: 'Mask Life', value: '28 Days', percentage: 70, icon: MaskIcon, iconClass: '' },
    { title: 'Filter Life', value: '56%', percentage: 56, icon: DotsIcon, iconClass: 'blue' },
    { title: 'Humidifier', value: '75%', percentage: 75, icon: PulseIcon, iconClass: '' },
    { title: 'Tubing', value: '4 Days', percentage: 40, icon: DeviceIcon, iconClass: '' }
  ];

  return (
    <div>
      {/* Metrics Section */}
      <section className="metrics-grid">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.title}
            title={metric.title}
            subtitle={metric.subtitle}
            value={metric.value}
            badge={metric.badge}
            footer={metric.footer}
            accent={metric.accent}
          />
        ))}
      </section>

      {/* Therapy Settings Section */}
      <section className="therapy-card">
        <div className="section-title">
          <h2>Therapy Mode</h2>
        </div>

        <div className="mode-switch">
          <button
            className={`mode-button ${mode === 'cpap' ? 'active' : ''}`}
            onClick={() => setMode('cpap')}
            aria-pressed={mode === 'cpap'}
            aria-label="Set mode to CPAP"
          >
            <SmallDeviceIcon />
            <span>CPAP</span>
          </button>
          <button
            className={`mode-button ${mode === 'auto' ? 'active' : ''}`}
            onClick={() => setMode('auto')}
            aria-pressed={mode === 'auto'}
            aria-label="Set mode to Auto CPAP"
          >
            <AutoIcon />
            <span>AUTO CPAP</span>
          </button>
        </div>

        <div className="pressure-panel">
          <div className="panel-head">
            <h3>CPAP</h3>
            <span>Pressure Setting</span>
            <button className="micro-pill" aria-label="Fixed Pressure">Fixed Pressure</button>
          </div>

          <div className="pressure-row">
            <button
              className="round-button"
              onClick={() => setPressure((p) => Math.max(4, +(p - 0.5).toFixed(1)))}
              aria-label="Decrease pressure"
            >
              <MinusIcon />
            </button>

            <div className="pressure-value">
              <strong>{pressure.toFixed(1)}</strong>
              <span>cm H2O</span>
            </div>

            <button
              className="round-button"
              onClick={() => setPressure((p) => Math.min(30, +(p + 0.5).toFixed(1)))}
              aria-label="Increase pressure"
            >
              <PlusIcon />
            </button>
          </div>

          <div className="slider-wrap">
            <span>4</span>
            <input
              type="range"
              min="4"
              max="30"
              step="0.1"
              value={pressure}
              onChange={(e) => setPressure(Number(e.target.value))}
              style={{ '--progress': `${progress}%` }}
              aria-label="Pressure slider"
            />
            <span>30</span>
          </div>

          <div className="range-copy">Range: 4 - 30 cm H2O</div>
        </div>

        <div className="auto-panel">
          <div className="panel-head">
            <h3>AUTO CPAP</h3>
            <span>Settings</span>
            <button className="micro-pill light" aria-label="Auto Adjusting">Auto Adjusting</button>
          </div>

          <div className="auto-grid">
            <div className="setting-card">
              <div className="setting-top">
                <h4>Min Pressure</h4>
              </div>
              <div className="mini-stepper">
                <button onClick={() => setMinPressure((v) => Math.max(4, +(v - 0.5).toFixed(1)))} aria-label="Decrease Min Pressure">
                  <MinusIcon />
                </button>
                <div className="mini-value">
                  <strong>{minPressure.toFixed(1)}</strong>
                  <span>cm H2O</span>
                </div>
                <button onClick={() => setMinPressure((v) => Math.min(maxPressure, +(v + 0.5).toFixed(1)))} aria-label="Increase Min Pressure">
                  <PlusIcon />
                </button>
              </div>
              <div className="range-copy">Range: 4 - 30 cm H2O</div>
            </div>

            <div className="setting-card">
              <div className="setting-top">
                <h4>Max Pressure</h4>
              </div>
              <div className="mini-stepper">
                <button onClick={() => setMaxPressure((v) => Math.max(minPressure, +(v - 0.5).toFixed(1)))} aria-label="Decrease Max Pressure">
                  <MinusIcon />
                </button>
                <div className="mini-value">
                  <strong>{maxPressure.toFixed(1)}</strong>
                  <span>cm H2O</span>
                </div>
                <button onClick={() => setMaxPressure((v) => Math.min(30, +(v + 0.5).toFixed(1)))} aria-label="Increase Max Pressure">
                  <PlusIcon />
                </button>
              </div>
              <div className="range-copy">Range: 4 - 30 cm H2O</div>
            </div>

            <div className="setting-card">
              <div className="setting-top">
                <h4>Aflex</h4>
                <InfoIcon />
              </div>
              <div className="segmented" role="group" aria-label="Aflex settings">
                {['Off', '1', '2', '3'].map((item, index) => (
                  <button
                    key={item}
                    className={aflex === index ? 'active' : ''}
                    onClick={() => setAflex(index)}
                    aria-pressed={aflex === index}
                    aria-label={`Aflex level ${item}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-card">
              <div className="setting-top">
                <h4>Ramp</h4>
                <InfoIcon />
              </div>
              <div className="mini-stepper">
                <button onClick={() => setRamp((v) => Math.max(0, v - 1))} aria-label="Decrease ramp">
                  <MinusIcon />
                </button>
                <div className="mini-value">
                  <strong>{ramp}</strong>
                  <span>min</span>
                </div>
                <button onClick={() => setRamp((v) => Math.min(45, v + 1))} aria-label="Increase ramp">
                  <PlusIcon />
                </button>
              </div>
              <div className="range-copy">Range: 0 - 45 min</div>
            </div>
          </div>

          <SaveButton />
        </div>
      </section>

      {/* usage Trend Chart */}
      <section className="trend-card therapy-card">
        <div className="section-title">
          <h2>7 Day Usage Trend</h2>
        </div>
        <TrendChart data={trendData} yKey="usage" yUnit="%" type="bar" />
      </section>

      {/* Device Maintenance Grid */}
      <section className="maintenance-grid">
        {maintenanceItems.map((item) => {
          const Icon = item.icon;
          const colorClass = getThresholdClass(item.percentage);
          return (
            <article key={item.title} className="maintenance-card">
              <div className="maintenance-header">
                <div className={`maintenance-icon ${item.iconClass}`}>
                  <Icon />
                </div>
                <h4>{item.title}</h4>
              </div>
              <div className="maintenance-body">
                <span className="maintenance-value">{item.value}</span>
                <span className={`maintenance-percentage ${colorClass}`}>{item.percentage}%</span>
              </div>
              <div className="progress-container">
                <div
                  className={`progress-bar ${colorClass}`}
                  style={{ width: `${item.percentage}%` }}
                  role="progressbar"
                  aria-valuenow={item.percentage}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-label={`${item.title} status`}
                />
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
