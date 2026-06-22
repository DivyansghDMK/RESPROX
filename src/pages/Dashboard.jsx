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
  DeviceIcon,
  BreezeIcon,
  GrowthIcon,
  ClockIcon,
  GaugeIcon,
  ChevronRightIcon
} from '../components/Icons';

// Helper elements

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);

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
    deviceData
  } = useTherapy();

  const usageFormatted = useMemo(() => {
    if (deviceData && deviceData.live_data) {
      const ld = deviceData.live_data;
      const hoursInt = Math.floor(ld.usage_hours);
      const minsInt = Math.round((ld.usage_hours - hoursInt) * 60);
      return `${hoursInt}h ${minsInt}m`;
    }
    return '7h 32m';
  }, [deviceData]);

  const usagePct = useMemo(() => {
    if (deviceData && deviceData.live_data) {
      return deviceData.live_data.compliance_pct;
    }
    return 94;
  }, [deviceData]);

  const maskLeak = useMemo(() => {
    if (deviceData && deviceData.live_data) {
      return deviceData.live_data.mask_leak;
    }
    return 24;
  }, [deviceData]);

  const pressure95 = useMemo(() => {
    if (deviceData && deviceData.live_data) {
      return deviceData.live_data.pressure_95;
    }
    return 11.8;
  }, [deviceData]);

  const ahiValue = useMemo(() => {
    if (deviceData && deviceData.live_data) {
      return deviceData.live_data.ahi;
    }
    return 2.1;
  }, [deviceData]);

  const trendData = useMemo(() => {
    if (deviceData && deviceData.sessions) {
      return deviceData.sessions.map(s => ({
        day: s.date.split(' ')[0],
        usage: Math.round((s.usage_hours / 8) * 100)
      }));
    }
    return [
      { day: 'Mon', usage: 88 },
      { day: 'Tue', usage: 94 },
      { day: 'Wed', usage: 91 },
      { day: 'Thu', usage: 97 },
      { day: 'Fri', usage: 92 },
      { day: 'Sat', usage: 95 },
      { day: 'Sun', usage: 98 }
    ];
  }, [deviceData]);

  const metrics = useMemo(() => [
    { title: 'Usage', subtitle: 'Last Night', value: usageFormatted, footer: `${usagePct}% of goal`, accent: 'ring' },
    { title: 'AHI', subtitle: 'Last Night', value: ahiValue.toString(), badge: ahiValue <= 5.0 ? 'Good' : 'Elevated', footer: 'Events / hr', accent: 'soft' },
    { title: 'Mask Seal', subtitle: 'Last Night', value: `${maskLeak} L/min`, badge: maskLeak <= 24 ? 'Good' : 'High Leak', footer: 'Leak Rate', accent: 'soft' },
    { title: 'Pressure', subtitle: '95th Percentile', value: `${pressure95} cm H2O`, footer: `Max ${deviceData ? (Math.max(...deviceData.sessions.map(s => s.pressure_95), pressure95)).toFixed(1) : '12.4'} cm H2O`, accent: 'soft' },
  ], [deviceData, usageFormatted, usagePct, maskLeak, pressure95, ahiValue]);

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
    <div className="dashboard-responsive-wrapper">
      {/* Desktop Dashboard view */}
      <div className="desktop-dashboard">
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

          {mode === 'cpap' ? (
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
          ) : (
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
          )}
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

      {/* Mobile Dashboard view */}
      <div className="mobile-dashboard">
        {/* Device status card */}
        <div className="mobile-device-card">
          <div className="device-status-info">
            <div className="bluetooth-badge">
              <span className="bluetooth-icon-svg"><SmallDeviceIcon /></span>
            </div>
            <div>
              <h4>CPAP VT30 D</h4>
              <span className="status-connected">
                <span className="green-dot"></span>
                Connected
              </span>
            </div>
          </div>
          <button className="device-info-btn">
            <span>Device info</span>
            <InfoIcon />
          </button>
        </div>

        {/* Today at a glance */}
        <div className="today-glance-card">
          <div className="glance-header">
            <h3>Today at a glance</h3>
            <div className="glance-date">
              <CalendarIcon />
              <span>May 26, 2026</span>
            </div>
          </div>
          <div className="glance-metrics-row">
            {/* Metric 1: Usage */}
            <div className="glance-metric-item">
              <div className="metric-item-header">
                <ClockIcon />
                <span>Usage</span>
              </div>
              <div className="metric-item-value">{usageFormatted}</div>
              <div className="metric-item-sub">of 8h goal</div>
              <div className="metric-item-chart">
                <div className="small-progress-ring">
                  <svg viewBox="0 0 36 36" className="circular-chart">
                    <path className="circle-bg"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path className="circle"
                      strokeDasharray={`${usagePct}, 100`}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <circle cx="18" cy="18" r="11" fill="#0ea5e9" />
                    <text x="18" y="20.5" className="percentage" style={{ fill: '#ffffff', fontSize: '8px', fontWeight: 'bold' }}>{usagePct}%</text>
                  </svg>
                </div>
              </div>
            </div>

            {/* Metric 2: Mask Seal */}
            <div className="glance-metric-item">
              <div className="metric-item-header">
                <MaskIcon />
                <span>Mask Seal</span>
              </div>
              <div className="metric-item-value">{maskLeak}</div>
              <div className="metric-item-sub">L/min</div>
              <div className="good-badge-container">
                <span className={`good-badge ${maskLeak > 24 ? 'warning-text' : ''}`}>
                  {maskLeak <= 24 ? 'Good' : 'High Leak'}
                </span>
              </div>
            </div>

            {/* Metric 3: Pressure */}
            <div className="glance-metric-item">
              <div className="metric-item-header">
                <GaugeIcon />
                <span>Pressure</span>
              </div>
              <div className="metric-item-value">{pressure95}</div>
              <div className="metric-item-sub">cm H₂O</div>
              <div className="percentile-text">95th Percentile</div>
            </div>

            {/* Metric 4: AHI */}
            <div className="glance-metric-item">
              <div className="metric-item-header">
                <PulseIcon />
                <span>AHI</span>
              </div>
              <div className="metric-item-value">{ahiValue}</div>
              <div className="metric-item-sub">events/hr</div>
              <div className="good-badge-container">
                <span className={`good-badge ${ahiValue > 5.0 ? 'warning-text' : ''}`}>
                  {ahiValue <= 5.0 ? 'Good' : 'Elevated'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Therapy Mode Switcher */}
        <div className="mobile-mode-switcher">
          <button 
            className={`mode-tab-btn ${mode === 'cpap' ? 'active' : ''}`}
            onClick={() => setMode('cpap')}
          >
            <BreezeIcon />
            <span>CPAP</span>
          </button>
          <button 
            className={`mode-tab-btn ${mode === 'auto' ? 'active' : ''}`}
            onClick={() => setMode('auto')}
          >
            <GrowthIcon />
            <span>AUTO CPAP</span>
          </button>
        </div>

        {/* Settings details */}
        <div className="mobile-settings-panel">
          {mode === 'cpap' ? (
            // CPAP Settings
            <div className="settings-mode-card">
              <div className="settings-card-header">
                <h3>CPAP - Pressure Setting</h3>
                <InfoIcon />
              </div>
              
              <div className="slider-container">
                <div className="large-value-display">
                  <strong>{pressure.toFixed(1)}</strong>
                  <span className="unit-text">cmH₂O</span>
                </div>
                <div className="custom-slider-wrapper">
                  <span className="slider-limit">4</span>
                  <input 
                    type="range"
                    min="4"
                    max="30"
                    step="0.1"
                    value={pressure}
                    onChange={(e) => setPressure(Number(e.target.value))}
                    className="custom-range-slider"
                    style={{ '--progress': `${((pressure - 4) / 26) * 100}%` }}
                  />
                  <span className="slider-limit">30</span>
                </div>
                <div className="slider-range-text">Range: 4 - 30 H₂O</div>
              </div>

              <div className="stepper-container">
                <div className="stepper-header">
                  <h4>Ramp Time</h4>
                  <InfoIcon />
                </div>
                <div className="stepper-controls">
                  <button 
                    onClick={() => setRamp((v) => Math.max(4, +(v - 1).toFixed(1)))}
                    className="stepper-btn"
                  >
                    <MinusIcon />
                  </button>
                  <div className="stepper-value">
                    <strong>{ramp.toFixed(1)}</strong>
                    <span>cmH₂O</span>
                  </div>
                  <button 
                    onClick={() => setRamp((v) => Math.min(30, +(v + 1).toFixed(1)))}
                    className="stepper-btn"
                  >
                    <PlusIcon />
                  </button>
                </div>
                <div className="stepper-range-text">Range: 4 - 30 H₂O</div>
              </div>
            </div>
          ) : (
            // AUTO CPAP Settings
            <div className="settings-mode-card">
              <div className="settings-card-header">
                <h3>AUTO CPAP - Pressure Setting</h3>
                <InfoIcon />
              </div>

              <div className="slider-container">
                <div className="slider-label-header">
                  <h4>Min Pressure</h4>
                  <InfoIcon />
                </div>
                <div className="large-value-display">
                  <strong>{minPressure.toFixed(1)}</strong>
                  <span className="unit-text">cmH₂O</span>
                </div>
                <div className="custom-slider-wrapper">
                  <span className="slider-limit">4</span>
                  <input 
                    type="range"
                    min="4"
                    max="30"
                    step="0.1"
                    value={minPressure}
                    onChange={(e) => setMinPressure(Number(e.target.value))}
                    className="custom-range-slider"
                    style={{ '--progress': `${((minPressure - 4) / 26) * 100}%` }}
                  />
                  <span className="slider-limit">30</span>
                </div>
                <div className="slider-range-text">Range: 4 - 30 H₂O</div>
              </div>

              <div className="slider-container">
                <div className="slider-label-header">
                  <h4>Max Pressure</h4>
                  <InfoIcon />
                </div>
                <div className="large-value-display">
                  <strong>{maxPressure.toFixed(1)}</strong>
                  <span className="unit-text">cmH₂O</span>
                </div>
                <div className="custom-slider-wrapper">
                  <span className="slider-limit">4</span>
                  <input 
                    type="range"
                    min="4"
                    max="30"
                    step="0.1"
                    value={maxPressure}
                    onChange={(e) => setMaxPressure(Number(e.target.value))}
                    className="custom-range-slider"
                    style={{ '--progress': `${((maxPressure - 4) / 26) * 100}%` }}
                  />
                  <span className="slider-limit">30</span>
                </div>
                <div className="slider-range-text">Range: 4 - 30 H₂O</div>
              </div>

              <div className="stepper-container">
                <div className="stepper-header">
                  <h4>Ramp Time</h4>
                  <InfoIcon />
                </div>
                <div className="stepper-controls">
                  <button 
                    onClick={() => setRamp((v) => Math.max(4, +(v - 1).toFixed(1)))}
                    className="stepper-btn"
                  >
                    <MinusIcon />
                  </button>
                  <div className="stepper-value">
                    <strong>{ramp.toFixed(1)}</strong>
                    <span>cmH₂O</span>
                  </div>
                  <button 
                    onClick={() => setRamp((v) => Math.min(30, +(v + 1).toFixed(1)))}
                    className="stepper-btn"
                  >
                    <PlusIcon />
                  </button>
                </div>
                <div className="stepper-range-text">Range: 4 - 30 H₂O</div>
              </div>

              <div className="segmented-container">
                <div className="segmented-header">
                  <h4>EPR (A-Flex)</h4>
                  <InfoIcon />
                </div>
                <div className="custom-segmented-control">
                  {['Off', '1', '2', '3'].map((item, index) => (
                    <button
                      key={item}
                      className={`segmented-tab-btn ${aflex === index ? 'active' : ''}`}
                      onClick={() => setAflex(index)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Maintenance row */}
          <div className="mobile-maintenance-row">
            <div className="maintenance-col-item">
              <div className="m-icon-wrapper">
                <MaskIcon />
              </div>
              <div className="m-text-info">
                <h5>Next Mask Change</h5>
                <span className="m-status-text green-status">28 days left</span>
              </div>
            </div>
            
            <div className="maintenance-vertical-divider"></div>

            <div className="maintenance-col-item clickable-item">
              <div className="m-icon-wrapper filter-icon-color">
                <DotsIcon />
              </div>
              <div className="m-text-info">
                <h5>File Life</h5>
                <span className="m-status-text green-status">56% Remaining</span>
              </div>
              <div className="chevron-right-arrow">
                <ChevronRightIcon />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


