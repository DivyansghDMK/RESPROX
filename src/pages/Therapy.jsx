import React, { useMemo } from 'react';
import { useTherapy } from '../context/TherapyContext';
import SaveButton from '../components/SaveButton';
import GlassCard from '../components/GlassCard';
import {
  SmallDeviceIcon,
  AutoIcon,
  MinusIcon,
  PlusIcon,
  InfoIcon,
  MaskIcon,
  DotsIcon,
  BreezeIcon,
  GrowthIcon,
  ChevronRightIcon
} from '../components/Icons';

export default function Therapy() {
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

  return (
    <div className="therapy-page-container">
      {/* 1. Therapy Overview & Events */}
      <section className="section-grid-2 desktop-only-header">
        <GlassCard>
          <div className="section-title">
            <h2>Therapy Overview</h2>
          </div>
          <div className="overview-stats-grid">
            <div className="overview-stat">
              <span>Current Mode</span>
              <strong>{mode === 'cpap' ? 'CPAP' : 'Auto CPAP'}</strong>
            </div>
            <div className="overview-stat">
              <span>Compliance %</span>
              <strong className="green-text">88%</strong>
            </div>
            <div className="overview-stat">
              <span>Average Usage</span>
              <strong>7h 12m</strong>
            </div>
            <div className="overview-stat">
              <span>AHI Score</span>
              <strong>2.4 / hr</strong>
            </div>
          </div>
        </GlassCard>

        {/* 3. Therapy Events */}
        <GlassCard>
          <div className="section-title">
            <h2>Therapy Events</h2>
          </div>
          <div className="overview-stats-grid">
            <div className="overview-stat">
              <span>Apnea Events</span>
              <strong>1.4 / hr</strong>
              <small style={{ color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
                Obstructive: 1.1 | Central: 0.3
              </small>
            </div>
            <div className="overview-stat">
              <span>Hypopnea Events</span>
              <strong>0.8 / hr</strong>
            </div>
            <div className="overview-stat">
              <span>Flow Limitation</span>
              <strong className="amber-text">Mild</strong>
            </div>
            <div className="overview-stat">
              <span>Clear Airway Events</span>
              <strong>0.2 / hr</strong>
            </div>
          </div>
        </GlassCard>
      </section>

      {/* 2. Pressure Configuration - Responsive Wrapper */}
      <div className="therapy-settings-responsive-wrapper">
        {/* Desktop Therapy Settings */}
        <section className="therapy-card desktop-therapy-settings" style={{ marginTop: '20px' }}>
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

          {mode === 'cpap' ? (
            <div className="pressure-panel">
              <div className="panel-head">
                <h3>CPAP</h3>
                <span>Pressure Setting</span>
                <button className="micro-pill" aria-label="Fixed Pressure type">Fixed Pressure</button>
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

        {/* Mobile Therapy Settings */}
        <div className="mobile-therapy-settings">
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
              <GrowthIcon />
              <span>AUTO CPAP</span>
            </button>
          </div>

          {/* Settings Panel */}
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
    </div>
  );
}
