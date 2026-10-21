import React, { useMemo } from 'react';
import DeviceDataState from '../components/DeviceDataState';
import { useTherapy } from '../context/TherapyContext';
import SaveButton from '../components/SaveButton';
import GlassCard from '../components/GlassCard';
import {
  SmallDeviceIcon,
  AutoIcon,
  MinusIcon,
  PlusIcon,
  InfoIcon,
  BreezeIcon,
  GrowthIcon
} from '../components/Icons';

function NotReported({ mode }) {
  return (
    <div className="therapy-lock-note" role="status">
      {mode
        ? <><strong>Not reported by the device.</strong> It has not sent its {mode === 'cpap' ? 'CPAP' : 'Auto CPAP'} settings, so they can't be shown or changed here.</>
        : <><strong>Mode not reported.</strong> The device has not said which therapy mode it is in. Choose a mode to see its settings.</>}
    </div>
  );
}

export default function Therapy() {
  const {
    deviceData,
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

  // Everything here comes from the device's own records; a missing value is "—".
  const stats = useMemo(() => {
    const ld = deviceData?.live_data || {};
    const usage = ld.usage_hours;
    const latest = deviceData?.sessions?.[deviceData.sessions.length - 1];
    return {
      compliance: ld.compliance_pct == null ? '—' : `${ld.compliance_pct}%`,
      usage: usage == null ? '—' : `${Math.floor(usage)}h ${Math.round((usage - Math.floor(usage)) * 60)}m`,
      ahi: ld.ahi == null ? '—' : `${ld.ahi} / hr`,
      // Session reports carry real per-night event counts; telemetry does not.
      night: latest?.type === 'REPORT_DAY' ? latest.raw : null,
      nightLabel: latest?.display_date || latest?.date || '',
    };
  }, [deviceData]);

  // Only show and edit a mode whose values the device actually reported.
  const reported = deviceData?.settings || {};
  const modeReported = mode === 'cpap'
    ? reported.pressure != null && reported.ramp != null
    : mode === 'auto' && [reported.min_pressure, reported.max_pressure, reported.aflex, reported.ramp].every((v) => v != null);

  if (!deviceData) return <DeviceDataState what="therapy settings" />;


  return (
    <div className="therapy-page-container">
      {deviceData.therapy_running && (
        <div className="therapy-lock-note" role="status">
          <strong>Therapy is running.</strong> Settings are locked until therapy is stopped from the device dashboard.
        </div>
      )}
      {/* 1. Therapy Overview & Events */}
      <section className="section-grid-2 desktop-only-header">
        <GlassCard>
          <div className="section-title">
            <h2>Therapy Overview</h2>
          </div>
          <div className="overview-stats-grid">
            <div className="overview-stat">
              <span>Current Mode</span>
              <strong>{mode === 'cpap' ? 'CPAP' : mode === 'auto' ? 'Auto CPAP' : '—'}</strong>
            </div>
            <div className="overview-stat">
              <span>Compliance (nights ≥ 4 h)</span>
              <strong>{stats.compliance}</strong>
            </div>
            <div className="overview-stat">
              <span>Last Night Usage</span>
              <strong>{stats.usage}</strong>
            </div>
            <div className="overview-stat">
              <span>AHI (last night)</span>
              <strong>{stats.ahi}</strong>
            </div>
          </div>
        </GlassCard>

        {/* 3. Therapy Events — real counts from the latest session report */}
        <GlassCard>
          <div className="section-title">
            <h2>Therapy Events{stats.night && stats.nightLabel ? ` · ${stats.nightLabel}` : ''}</h2>
          </div>
          {stats.night ? (
            <div className="overview-stats-grid">
              <div className="overview-stat">
                <span>Obstructive Apneas</span>
                <strong>{stats.night.osa}</strong>
              </div>
              <div className="overview-stat">
                <span>Central Apneas</span>
                <strong>{stats.night.csa}</strong>
              </div>
              <div className="overview-stat">
                <span>Hypopneas</span>
                <strong>{stats.night.hsa}</strong>
              </div>
              <div className="overview-stat">
                <span>Total Events</span>
                <strong>{stats.night.events}</strong>
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.6 }}>
              No event breakdown yet. It appears once the device's session reports are synced.
            </p>
          )}
        </GlassCard>
      </section>

      {/* 2. Pressure Configuration - Responsive Wrapper */}
      <div className="therapy-settings-responsive-wrapper">
        {/* Desktop Therapy Settings */}
        <section className="therapy-card desktop-therapy-settings" style={{ marginTop: '20px' }} inert={deviceData.therapy_running ? '' : undefined}>
          <div className="section-title">
            <h2>Pressure Configuration</h2>
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

          {(() => {
            const maxLimit = 20;
            const RAMP_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45];
            const stepRampDown = (val) => {
              const idx = RAMP_STEPS.indexOf(val);
              if (idx <= 0) return RAMP_STEPS[0];
              return RAMP_STEPS[idx - 1];
            };
            const stepRampUp = (val) => {
              const idx = RAMP_STEPS.indexOf(val);
              if (idx === -1 || idx >= RAMP_STEPS.length - 1) return RAMP_STEPS[RAMP_STEPS.length - 1];
              return RAMP_STEPS[idx + 1];
            };
            const formatRampDisplay = (val) => {
              if (val === 0) return 'Off';
              if (val === 30) return '30 (Auto)';
              return `${val} min`;
            };

            if (!modeReported) {
              return <NotReported mode={mode} />;
            }

            const safePressure = Math.min(pressure, maxLimit);
            const safeMaxPressure = Math.min(maxPressure, maxLimit);
            const safeMinPressure = Math.min(minPressure, safeMaxPressure);
            const progress = ((safePressure - 4) / (maxLimit - 4)) * 100;

            return mode === 'cpap' ? (
              <div className="pressure-panel">
                <div className="panel-head">
                  <h3>CPAP</h3>
                  <span>Fixed Pressure Setting</span>
                  <button className="micro-pill" aria-label="Fixed Pressure type">Fixed Mode</button>
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
                    <strong>{safePressure.toFixed(1)}</strong>
                    <span>cm H₂O</span>
                  </div>

                  <button
                    className="round-button"
                    onClick={() => setPressure((p) => Math.min(maxLimit, +(p + 0.5).toFixed(1)))}
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
                    max={maxLimit}
                    step="0.5"
                    value={safePressure}
                    onChange={(e) => setPressure(Number(e.target.value))}
                    style={{ '--progress': `${progress}%` }}
                    aria-label="Pressure slider"
                  />
                  <span>{maxLimit}</span>
                </div>

                <div className="range-copy">Range: 4 - {maxLimit} cm H₂O</div>

                <div className="setting-card" style={{ marginTop: 20 }}>
                  <div className="setting-top">
                    <h4>Ramp Time</h4>
                    <InfoIcon />
                  </div>
                  <div className="mini-stepper">
                    <button onClick={() => setRamp((v) => stepRampDown(v))} aria-label="Decrease ramp">
                      <MinusIcon />
                    </button>
                    <div className="mini-value">
                      <strong>{formatRampDisplay(ramp)}</strong>
                    </div>
                    <button onClick={() => setRamp((v) => stepRampUp(v))} aria-label="Increase ramp">
                      <PlusIcon />
                    </button>
                  </div>
                  <div className="range-copy">Range: Off (0) to 45 min · 30 min (Auto)</div>
                </div>

                <SaveButton />
              </div>
            ) : (
              <div className="auto-panel">
                <div className="panel-head">
                  <h3>{mode === 'bipap' ? 'BiPAP' : 'AUTO CPAP'}</h3>
                  <span>Settings</span>
                  <button className="micro-pill light" aria-label="Auto Adjusting type">Auto Adjusting</button>
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
                        <strong>{safeMinPressure.toFixed(1)}</strong>
                        <span>cm H₂O</span>
                      </div>
                      <button onClick={() => setMinPressure((v) => Math.min(safeMaxPressure, +(v + 0.5).toFixed(1)))} aria-label="Increase Min Pressure">
                        <PlusIcon />
                      </button>
                    </div>
                    <div className="range-copy">Range: 4 - {safeMaxPressure} cm H₂O</div>
                  </div>

                  <div className="setting-card">
                    <div className="setting-top">
                      <h4>Max Pressure</h4>
                    </div>
                    <div className="mini-stepper">
                      <button onClick={() => setMaxPressure((v) => Math.max(safeMinPressure, +(v - 0.5).toFixed(1)))} aria-label="Decrease Max Pressure">
                        <MinusIcon />
                      </button>
                      <div className="mini-value">
                        <strong>{safeMaxPressure.toFixed(1)}</strong>
                        <span>cm H₂O</span>
                      </div>
                      <button onClick={() => setMaxPressure((v) => Math.min(maxLimit, +(v + 0.5).toFixed(1)))} aria-label="Increase Max Pressure">
                        <PlusIcon />
                      </button>
                    </div>
                    <div className="range-copy">Range: {safeMinPressure} - {maxLimit} cm H₂O</div>
                  </div>

                  <div className="setting-card">
                    <div className="setting-top">
                      <h4>Aflex (EPR)</h4>
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
                      <h4>Ramp Time</h4>
                      <InfoIcon />
                    </div>
                    <div className="mini-stepper">
                      <button onClick={() => setRamp((v) => stepRampDown(v))} aria-label="Decrease ramp">
                        <MinusIcon />
                      </button>
                      <div className="mini-value">
                        <strong>{formatRampDisplay(ramp)}</strong>
                      </div>
                      <button onClick={() => setRamp((v) => stepRampUp(v))} aria-label="Increase ramp">
                        <PlusIcon />
                      </button>
                    </div>
                    <div className="range-copy">Range: Off (0) to 45 min · 30 min (Auto)</div>
                  </div>
                </div>

                <SaveButton />
              </div>
            );
          })()}
        </section>

        {/* Mobile Therapy Settings */}
        <div className="mobile-therapy-settings" inert={deviceData.therapy_running ? '' : undefined}>
          {/* Mode Switcher */}
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
              <AutoIcon />
              <span>AUTO CPAP</span>
            </button>
          </div>

          {/* Settings Panel */}
          <div className="mobile-settings-panel">
            {!modeReported ? (
              <NotReported mode={mode} />
            ) : mode === 'cpap' ? (
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
                      onClick={() => setRamp((v) => Math.max(0, v - 1))}
                      className="stepper-btn"
                      aria-label="Decrease ramp time"
                    >
                      <MinusIcon />
                    </button>
                    <div className="stepper-value">
                      <strong>{ramp}</strong>
                      <span>min</span>
                    </div>
                    <button 
                      onClick={() => setRamp((v) => Math.min(45, v + 1))}
                      className="stepper-btn"
                      aria-label="Increase ramp time"
                    >
                      <PlusIcon />
                    </button>
                  </div>
                  <div className="stepper-range-text">Range: 0 - 45 min</div>
                </div>
              </div>
            ) : (
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
                      onClick={() => setRamp((v) => Math.max(0, v - 1))}
                      className="stepper-btn"
                      aria-label="Decrease ramp time"
                    >
                      <MinusIcon />
                    </button>
                    <div className="stepper-value">
                      <strong>{ramp}</strong>
                      <span>min</span>
                    </div>
                    <button 
                      onClick={() => setRamp((v) => Math.min(45, v + 1))}
                      className="stepper-btn"
                      aria-label="Increase ramp time"
                    >
                      <PlusIcon />
                    </button>
                  </div>
                  <div className="stepper-range-text">Range: 0 - 45 min</div>
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

          </div>
        </div>
      </div>
    </div>
  );
}
