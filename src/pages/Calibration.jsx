// src/pages/Calibration.jsx
//
// Pressure calibration for the selected device (admin only), in the order the
// firmware expects: Start → Linear or Non-linear → − / + → Save to flash.
//
// Each − / + is one command to the device, sent one at a time; the firmware
// owns the step size, so the screen counts presses rather than showing cmH₂O.

import React, { useCallback, useEffect, useState } from 'react';
import DeviceDataState from '../components/DeviceDataState';
import { SettingsSkeleton } from '../components/Skeleton';
import Modal from '../components/Modal';
import { GaugeIcon, ShieldIcon, CheckIcon } from '../components/Icons';
import { useTherapy } from '../context/TherapyContext';
import { useAccess } from '../context/AccessContext';
import { useNotify } from '../context/NotifyContext';
import {
  CALIBRATION_METHODS, NONLINEAR_MAX, NONLINEAR_MIN, formatSteps, recordStep, requestFor, stepKey, stepSummary,
} from '../services/calibration';
import { calibrationAPI } from '../services/calibrationApi';

const PRESSURES = Array.from({ length: NONLINEAR_MAX - NONLINEAR_MIN + 1 }, (_, i) => NONLINEAR_MIN + i);

function Card({ icon, step, title, subtitle, locked, children }) {
  return (
    <section className={`setting-card${locked ? ' is-locked' : ''}`} aria-disabled={locked || undefined}>
      <div className="setting-card-head">
        <div className="setting-card-icon">{icon}</div>
        <div>
          <h2><span className="cal-step-no">{step}</span>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function Calibration() {
  const { deviceData, adminActiveSerial } = useTherapy();
  const access = useAccess();
  const notify = useNotify();
  const serial = adminActiveSerial;

  const [safetyOk, setSafetyOk] = useState(false);
  const [started, setStarted] = useState(false);
  const [method, setMethod] = useState(null);       // chosen after Start
  const [pressure, setPressure] = useState(NONLINEAR_MIN);
  const [steps, setSteps] = useState({});           // net presses per point
  const [sending, setSending] = useState(null);     // 'start' | 'increment' | 'decrement' | 'save'
  const [confirm, setConfirm] = useState(null);     // 'save' | 'leave'
  const [savedAt, setSavedAt] = useState(null);

  const deviceOnline = Boolean(deviceData?.device_online);
  const therapyRunning = Boolean(deviceData?.therapy_running);
  const phoneConnected = Boolean(deviceData?.phone_connected) || /app connected/i.test(String(
    deviceData?.raw?.remarks ?? deviceData?.raw?.Remarks ?? deviceData?.raw?.offline_reason ?? ''
  ));
  const blocked = !deviceOnline || therapyRunning || phoneConnected;
  const touched = Object.keys(steps).length > 0;

  // A new device starts from scratch.
  useEffect(() => {
    setStarted(false); setMethod(null); setSteps({}); setSafetyOk(false); setSavedAt(null);
  }, [serial]);

  // Closing the tab with unsaved steps loses track of them.
  useEffect(() => {
    if (!started || !touched) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [started, touched]);

  const run = useCallback(async (action, label) => {
    setSending(action);
    try {
      await calibrationAPI.send(serial, requestFor(action, method, pressure));
      return true;
    } catch (err) {
      notify.fromError(err, { action: label, subject: serial });
      return false;
    } finally {
      setSending(null);
    }
  }, [serial, method, pressure, notify]);

  const start = async () => {
    if (await run('start', 'start calibration')) {
      setStarted(true); setMethod(null); setSteps({}); setSavedAt(null);
    }
  };

  const nudge = async (action) => {
    if (await run(action, action === 'increment' ? 'increase calibration' : 'decrease calibration')) {
      setSteps((s) => recordStep(s, stepKey(method, pressure), action === 'increment' ? 1 : -1));
    }
  };

  const save = async () => {
    if (await run('save', 'save calibration')) {
      setConfirm(null); setStarted(false); setMethod(null); setSteps({}); setSafetyOk(false);
      setSavedAt(new Date());
      notify.success('Calibration saved', { message: `${serial} wrote the new calibration to its memory.` });
    }
  };

  const leave = () => {
    setConfirm(null); setStarted(false); setMethod(null); setSteps({}); setSafetyOk(false);
  };

  if (!access.calibrate) {
    return (
      <div className="setting-screen">
        <header className="setting-topbar"><div><h1>Calibration</h1></div></header>
        <div className="settings-unavailable" role="status">
          <strong>Admin only</strong>
          <span>Pressure calibration is done by Resprox admin.</span>
        </div>
      </div>
    );
  }
  if (!deviceData) return <DeviceDataState what="calibration" skeleton={SettingsSkeleton} />;

  const busy = Boolean(sending);
  const summary = stepSummary(steps);

  return (
    <div className="setting-screen calibration-screen">
      <header className="setting-topbar">
        <div>
          <h1>Calibration</h1>
          <p>Pressure calibration for {serial}</p>
        </div>
        <span className={`ble-pill${deviceOnline ? ' connected' : ''}`}>
          <span className="dot" aria-hidden="true" />
          {started ? 'Calibration mode' : deviceOnline ? 'Device online' : 'Device offline'}
        </span>
      </header>

      {therapyRunning && (
        <div className="settings-unavailable" role="status">
          <strong>Therapy is running</strong>
          <span>Stop therapy on the dashboard before calibrating.</span>
        </div>
      )}
      {phoneConnected && (
        <div className="settings-unavailable" role="status">
          <strong>Connected to a phone</strong>
          <span>The device is paired with the mobile app, so commands from here can’t reach it.</span>
        </div>
      )}
      {!deviceOnline && (
        <div className="settings-unavailable" role="status">
          <strong>Device is offline</strong>
          <span>Calibration needs the device online.</span>
        </div>
      )}
      {savedAt && (
        <div className="therapy-locked" role="status">
          <div>
            <strong>Calibration saved</strong>
            <span>The device confirmed it at {savedAt.toLocaleTimeString()}.</span>
          </div>
        </div>
      )}

      {/* 1 — Start */}
      <Card
        icon={<ShieldIcon />} step="1" title="Start calibration"
        subtitle={started ? 'The device confirmed it is in calibration mode.' : 'Puts the device into calibration mode.'}
      >
        {started ? (
          <p className="cal-active"><CheckIcon /> Calibration mode is on</p>
        ) : (
          <>
            <label className="cal-safety">
              <input type="checkbox" checked={safetyOk} onChange={(e) => setSafetyOk(e.target.checked)} disabled={busy} />
              <span>No patient is connected, and a reference manometer is fitted to the air outlet.</span>
            </label>
            <div className="cal-actions">
              <button
                type="button" className="cal-btn primary"
                disabled={!safetyOk || blocked || busy}
                onClick={start}
              >
                {sending === 'start' ? 'Waiting for device…' : 'Start Calibration'}
              </button>
            </div>
          </>
        )}
      </Card>

      {/* 2 — Linear or non-linear */}
      <Card
        icon={<GaugeIcon />} step="2" title="Calibration type" locked={!started}
        subtitle={method ? CALIBRATION_METHODS[method].note : 'Choose Linear or Non-linear.'}
      >
        <div className="segmented" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }} role="group" aria-label="Calibration type">
          {Object.entries(CALIBRATION_METHODS).map(([key, m]) => (
            <button
              key={key} type="button"
              disabled={!started || busy}
              aria-pressed={method === key}
              className={method === key ? 'selected' : ''}
              onClick={() => setMethod(key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {method === 'nonlinear' && (
          <label className="cal-pressure">
            <span>Target pressure</span>
            <select value={pressure} disabled={busy} onChange={(e) => setPressure(Number(e.target.value))}>
              {PRESSURES.map((p) => (
                <option key={p} value={p}>
                  {p} cmH₂O{steps[stepKey('nonlinear', p)] ? ` (${formatSteps(steps[stepKey('nonlinear', p)])})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </Card>

      {/* 3 — − / + and save */}
      <Card
        icon={<GaugeIcon />} step="3" title="Adjust and save" locked={!started || !method}
        subtitle={method === 'nonlinear'
          ? `Press − or + until the manometer reads ${pressure} cmH₂O.`
          : 'Press − or + until the manometer matches the device.'}
      >
        <div className="stepper">
          <button
            type="button" aria-label="Decrease calibration"
            disabled={!started || !method || busy || blocked}
            onClick={() => nudge('decrement')}
          >−</button>
          <span className="cal-sending" role="status" aria-live="polite">
            {sending === 'increment' || sending === 'decrement' ? 'Sending…' : ''}
          </span>
          <button
            type="button" aria-label="Increase calibration"
            disabled={!started || !method || busy || blocked}
            onClick={() => nudge('increment')}
          >+</button>
        </div>

        {summary.length > 0 && (
          <ul className="cal-summary">
            {summary.map((s) => <li key={s.key}><span>{s.label}</span><strong>{formatSteps(s.net)}</strong></li>)}
          </ul>
        )}

        <div className="cal-actions">
          <button type="button" className="cal-btn" disabled={!started || busy} onClick={() => (touched ? setConfirm('leave') : leave())}>
            Finish without saving
          </button>
          <button
            type="button" className="cal-btn primary"
            disabled={!started || busy || blocked || !touched}
            title={touched ? undefined : 'Press − or + first'}
            onClick={() => setConfirm('save')}
          >
            Save Calibration
          </button>
        </div>
      </Card>

      {confirm === 'save' && (
        <Modal
          title="Save calibration to the device?"
          busy={sending === 'save'}
          onClose={() => setConfirm(null)}
          footer={(
            <>
              <button type="button" className="cal-btn" disabled={sending === 'save'} onClick={() => setConfirm(null)}>Back</button>
              <button type="button" className="cal-btn primary" disabled={sending === 'save'} onClick={save}>
                {sending === 'save' ? 'Waiting for device…' : 'Save Calibration'}
              </button>
            </>
          )}
        >
          <p style={{ marginTop: 0 }}>
            {serial} will write its calibration to permanent memory. Every pressure it delivers afterwards uses it.
          </p>
          <ul className="cal-summary">
            {summary.map((s) => <li key={s.key}><span>{s.label}</span><strong>{formatSteps(s.net)}</strong></li>)}
          </ul>
        </Modal>
      )}

      {confirm === 'leave' && (
        <Modal
          title="Finish without saving?"
          onClose={() => setConfirm(null)}
          footer={(
            <>
              <button type="button" className="cal-btn" onClick={() => setConfirm(null)}>Back</button>
              <button type="button" className="cal-btn primary" onClick={leave}>Finish without saving</button>
            </>
          )}
        >
          <p style={{ marginTop: 0 }}>
            The device has no cancel command. Steps already sent may stay active until it restarts,
            but they are only kept in permanent memory if you save.
          </p>
        </Modal>
      )}
    </div>
  );
}
