// src/pages/Settings.jsx
//
// Settings — comfort & device configuration.
//
// Web counterpart of the Android SettingScreen: same sections, same draft /
// committed editing model, same Idle → Confirming → Sending → Idle/Failed
// flow, and the same grouping of changes into independent UPDATE frames.
//
// One screen serves both CPAP and BiPAP devices — every section is offered on
// both, and nothing here is hidden or disabled based on device type. If a
// particular device will not accept a group, the server says so and the
// notification frame reports it.
//
// Changes are never written field-by-field. The user edits a *draft*; nothing
// leaves the app until Apply, at which point only the groups that actually
// differ are sent. Any failure reverts the draft wholesale, so what is on
// screen always matches what the device is believed to hold.
//
// This screen talks to the server and nothing else. It PATCHes the changed
// mode groups for a serial number and then polls the resulting command until
// the server reports the device ACKed it; the BLE wire protocol is the
// server's side of that conversation, not the browser's.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTherapy } from '../context/TherapyContext';
import {
  MaskIcon, BreezeIcon, GaugeIcon, ShieldIcon, BluetoothIcon, CheckIcon,
} from '../components/Icons';
import { devicesAPI } from '../services/respireeApi';
import { describeCommandStatus, describeError } from '../services/apiError';
import { useNotify } from '../context/NotifyContext';

// A pull older than this means we can no longer claim the device is reachable.
const STALE_AFTER_MS = 90_000;

const MASK_TYPES = [
  { id: 1, label: 'Full Face' },
  { id: 2, label: 'Nasal' },
  { id: 3, label: 'Pillow' },
];

const TUBE_TYPES = [
  { id: 1, title: 'Standard', sub: '22 mm bore' },
  { id: 2, title: 'SlimLine', sub: '15 mm bore' },
];

const HUMIDIFIER_NOTES = [
  'Humidification off',
  'Level 1 — very light humidity',
  'Level 2 — light humidity',
  'Level 3 — moderate humidity',
  'Level 4 — high humidity',
  'Level 5 — maximum humidity',
];

// The server polls the device for an ACK. 40 s (the API default) is a long
// time to hold a non-dismissable dialog, so we cut it and let the user stop
// waiting — the change is already with the server either way.
const COMMAND_TIMEOUT_MS = 20000;

const RAMP_STEP = 5;
const RAMP_MAX = 45;

const OPTION_ROWS = [
  { key: 'iMode', label: 'I-Mode', sub: 'Intelligent pressure mode' },
  { key: 'leakAlert', label: 'Leak Alert', sub: 'Notify on excessive mask leak' },
  { key: 'sleepMode', label: 'Sleep Mode', sub: 'Reduce display brightness at night' },
];

// ── mask artwork ──────────────────────────────────────────────────────────────
// Drawn inline rather than imported: the Android screen ships ic_full_face /
// ic_nasal / ic_pillow as drawables, and the web app has no equivalent assets.

function MaskArt({ type }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (type === 1) {
    return (
      <svg viewBox="0 0 32 32" className="opt-icon" aria-hidden="true">
        <path d="M16 4c5.5 0 9 2.5 9 7 0 5-1.5 9-3.5 12.5C20 26 18 27.5 16 27.5S12 26 10.5 23.5C8.5 20 7 16 7 11c0-4.5 3.5-7 9-7Z" {...common} />
        <path d="M12 13c2.5-1 5.5-1 8 0M13 18h6" {...common} />
      </svg>
    );
  }
  if (type === 2) {
    return (
      <svg viewBox="0 0 32 32" className="opt-icon" aria-hidden="true">
        <path d="M16 6c4 0 7 2 7 5.5 0 3-1.2 5-3 6.4-1 .8-1.4 1.6-1.6 2.8-.2 1.4-1 2.3-2.4 2.3s-2.2-.9-2.4-2.3c-.2-1.2-.6-2-1.6-2.8-1.8-1.4-3-3.4-3-6.4C9 8 12 6 16 6Z" {...common} />
        <path d="M13.5 12.5h1.2M17.3 12.5h1.2" {...common} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" className="opt-icon" aria-hidden="true">
      <path d="M9 14c0-2.2 1.6-3.8 3.6-3.8 1.3 0 2.5.6 3.4 1.6.9-1 2.1-1.6 3.4-1.6C21.4 10.2 23 11.8 23 14c0 2.6-2.2 4.4-4.6 4.4-1 0-1.8-.2-2.4-.6-.6.4-1.4.6-2.4.6C11.2 18.4 9 16.6 9 14Z" {...common} />
      <path d="M16 18.4v4.4" {...common} />
    </svg>
  );
}

function TubeArt({ type }) {
  // Standard is a 22 mm bore, SlimLine 15 mm — the stroke carries that difference.
  const bore = type === 1 ? 7 : 4.4;
  const stroke = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <svg viewBox="0 0 32 32" className="opt-icon" aria-hidden="true">
      <path d="M5 22c0-7.5 4.9-12 11-12 4.4 0 8 2.4 9.9 6" {...stroke} strokeWidth={bore} opacity="0.28" />
      <path d="M5 22c0-7.5 4.9-12 11-12 4.4 0 8 2.4 9.9 6" {...stroke} strokeWidth="1.5" />
      {[0.18, 0.38, 0.58, 0.78].map((t, i) => (
        <line
          key={i}
          x1={5 + t * 20} y1={22 - t * 11 - bore / 2}
          x2={5 + t * 20} y2={22 - t * 11 + bore / 2}
          {...stroke} strokeWidth="1.2" opacity="0.55"
        />
      ))}
    </svg>
  );
}

/** Droplet — the humidifier section header, distinct from the tube icon. */
function DropletIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.2c3.4 4 6 6.9 6 10a6 6 0 0 1-12 0c0-3.1 2.6-6 6-10Z"
        fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

// ── primitives ────────────────────────────────────────────────────────────────

function SectionCard({ icon, title, subtitle, locked, children }) {
  return (
    <section className={`setting-card${locked ? ' is-locked' : ''}`}>
      <div className="setting-card-head">
        <div className="setting-card-icon">{icon}</div>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Segmented({ options, value, onChange, disabled }) {
  return (
    <div className="segmented" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }} role="group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          aria-pressed={value === opt.value}
          className={value === opt.value ? 'selected' : ''}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function PremiumToggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`premium-toggle${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="thumb" />
    </button>
  );
}

// ── screen ────────────────────────────────────────────────────────────────────

/** Everything the user can edit here, in one object so drafts diff cleanly. */
function committedFrom(deviceData, ctx) {
  const s = deviceData?.settings || {};
  return {
    maskType: Number(s.mask_type) || 2,
    tubeType: Number(s.tube_type) || 1,
    humidifier: Number.isFinite(Number(s.humidifier)) ? Number(s.humidifier) : 3,
    comfortRamp: Number.isFinite(Number(s.ramp_time)) ? Number(s.ramp_time) : 20,
    ramp: Number.isFinite(Number(ctx.ramp)) ? Number(ctx.ramp) : 20,
    aflex: Number.isFinite(Number(ctx.aflex)) ? Number(ctx.aflex) : 0,
    iMode: Boolean(s.i_mode),
    leakAlert: s.leak_alert !== undefined ? Boolean(s.leak_alert) : true,
    sleepMode: Boolean(s.sleep_mode),
  };
}

export default function Settings() {
  const ctx = useTherapy();
  const notify = useNotify();
  const {
    deviceData, adminActiveSerial, lastServerPull,
    setRamp, setAflex, setShowToast, setToastMessage,
  } = ctx;

  const isConnected = Boolean(
    lastServerPull && Date.now() - new Date(lastServerPull).getTime() < STALE_AFTER_MS
  );
  // The device reports no therapy-running flag over this transport yet; when it
  // does, swap this for that signal and the whole locked state comes alive.
  const isTherapyRunning = Boolean(deviceData?.therapy_running);


  const [committed, setCommitted] = useState(() => committedFrom(deviceData, ctx));
  const [draft, setDraft] = useState(() => committedFrom(deviceData, ctx));
  const [flow, setFlow] = useState({ state: 'idle' });
  const [pendingGroups, setPendingGroups] = useState([]);

  const set = useCallback((key, value) => setDraft((d) => ({ ...d, [key]: value })), []);
  const revertDraft = useCallback(() => setDraft(committed), [committed]);

  // Which groups differ decides which UPDATE frames are sent — a change to the
  // humidifier must not rewrite the ramp block.
  const dirtyGroups = useMemo(() => ({
    comfort: draft.humidifier !== committed.humidifier
      || draft.tubeType !== committed.tubeType
      || draft.maskType !== committed.maskType
      || draft.comfortRamp !== committed.comfortRamp,
    options: draft.iMode !== committed.iMode
      || draft.leakAlert !== committed.leakAlert
      || draft.sleepMode !== committed.sleepMode,
    rampAflex: draft.ramp !== committed.ramp || draft.aflex !== committed.aflex,
  }), [draft, committed]);

  const isDirty = dirtyGroups.comfort || dirtyGroups.options || dirtyGroups.rampAflex;

  const changeList = useMemo(() => {
    const rows = [];
    const maskName = (id) => MASK_TYPES.find((m) => m.id === id)?.label ?? id;
    const tubeName = (id) => TUBE_TYPES.find((t) => t.id === id)?.title ?? id;
    if (draft.maskType !== committed.maskType) rows.push(['Mask Type', maskName(draft.maskType)]);
    if (draft.tubeType !== committed.tubeType) rows.push(['Tube Type', tubeName(draft.tubeType)]);
    if (draft.humidifier !== committed.humidifier) rows.push(['Humidifier', draft.humidifier === 0 ? 'Off' : `Level ${draft.humidifier}`]);
    if (draft.comfortRamp !== committed.comfortRamp) rows.push(['Comfort Ramp', `${draft.comfortRamp} min`]);
    if (draft.ramp !== committed.ramp) rows.push(['Ramp', draft.ramp === 0 ? 'Off' : `${draft.ramp} min`]);
    if (draft.aflex !== committed.aflex) rows.push(['A-Flex', draft.aflex === 0 ? 'Off' : `Level ${draft.aflex}`]);
    for (const row of OPTION_ROWS) {
      if (draft[row.key] !== committed[row.key]) rows.push([row.label, draft[row.key] ? 'On' : 'Off']);
    }
    return rows;
  }, [draft, committed]);

  /** PATCH only the dirty groups, then wait for the device to confirm. */
  const sendChanges = useCallback(async () => {
    const serial = deviceData?.serial || adminActiveSerial;
    if (!serial) {
      setFlow({ state: 'failed', reason: 'No device selected.' });
      return;
    }

    setFlow({ state: 'sending' });

    const isAuto = /auto/i.test(String(deviceData?.settings?.therapy_mode || ctx.mode || ''));

    // Group names are the server's wire groups. Ramp and A-Flex live in the
    // CPAP/AUTO block, which is rewritten whole, so current pressures travel
    // with them.
    const groups = {};
    if (dirtyGroups.comfort) {
      groups.COMFORT = {
        rampTime: draft.comfortRamp,
        humidifier: draft.humidifier,
        tubeType: draft.tubeType,
        maskType: draft.maskType,
      };
    }
    if (dirtyGroups.options) {
      groups.OPTIONS = {
        iMode: draft.iMode,
        leakAlert: draft.leakAlert,
        sleepMode: draft.sleepMode,
      };
    }
    if (dirtyGroups.rampAflex) {
      groups[isAuto ? 'AUTO' : 'CPAP'] = isAuto
        ? {
          minPressure: Number(ctx.minPressure),
          maxPressure: Number(ctx.maxPressure),
          aflex: draft.aflex,
          ramp: draft.ramp,
        }
        : { pressure: Number(ctx.pressure), ramp: draft.ramp };
    }

    setPendingGroups(Object.keys(groups));

    // The dialog explains it in place; the frame keeps it on screen after the
    // dialog is dismissed, and carries the retry.
    const fail = (reason, described) => {
      revertDraft();
      setFlow({ state: 'failed', reason });
      if (described) notify.fromDescription(described, { onRetry: sendChangesRef.current });
      else notify.error("Couldn't apply settings", { message: reason });
    };

    let res;
    try {
      res = await devicesAPI.updateDeviceGroups(serial, groups);
    } catch (err) {
      // A transport failure is the one case where we cannot know what the
      // device holds, so the draft goes back to the last confirmed values.
      revertDraft();
      const described = describeError(err, { action: 'save these settings', subject: serial });
      setFlow({ state: 'failed', reason: described.message });
      notify.fromError(err, {
        action: 'save these settings', subject: serial,
        onRetry: sendChangesRef.current,
      });
      return;
    }

    if (res?.success === false) {
      fail(res.error || 'Server rejected the change.', {
        title: 'The server rejected those values',
        message: res.error || 'Server rejected the change.',
        detail: serial,
        retryable: false,
      });
      return;
    }

    // The server accepted it, but the device has not necessarily applied it —
    // that is what the command status reports.
    if (res?.commandId) {
      try {
        const status = await devicesAPI.pollCommandStatus(serial, res.commandId, {
          timeoutMs: COMMAND_TIMEOUT_MS,
        });
        const bad = describeCommandStatus(status.status, { subject: serial });
        if (bad) { fail(bad.message, bad); return; }
      } catch {
        const described = describeCommandStatus('TIMEOUT', { subject: serial });
        fail(described.message, described);
        return;
      }
    } else if (res?.status === 'NO_CHANGE') {
      // Server saw nothing to write; the draft already matches the device.
      setCommitted(draft);
      setFlow({ state: 'idle' });
      return;
    }

    // Only now is the draft the truth.
    setCommitted(draft);
    if (dirtyGroups.rampAflex) {
      setRamp?.(draft.ramp);
      setAflex?.(draft.aflex);
    }
    setFlow({ state: 'idle' });
    notify.success('Settings applied', {
      message: `The device confirmed ${changeList.length} change${changeList.length === 1 ? '' : 's'}.`,
    });
  }, [draft, dirtyGroups, deviceData, adminActiveSerial, ctx, revertDraft, setRamp, setAflex, notify, changeList]);

  // Retry from a notification must call the *current* sendChanges, not the one
  // captured when the failure happened.
  const sendChangesRef = useRef(sendChanges);
  sendChangesRef.current = sendChanges;

  const locked = isTherapyRunning;

  return (
    <div className="setting-screen">
      {/* 1 — Top bar */}
      <header className="setting-topbar">
        <div>
          <h1>Settings</h1>
          <p>Comfort &amp; device configuration</p>
        </div>
        <span className={`ble-pill${isConnected ? ' connected' : ''}`}>
          <BluetoothIcon />
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </header>

      {/* 2 — Therapy locked banner */}
      {locked && (
        <div className="therapy-locked" role="status">
          <span className="live-dot" />
          <div>
            <strong>Therapy is running</strong>
            <span>Stop therapy on the dashboard before changing device settings.</span>
          </div>
        </div>
      )}

      {/* 3 — Mask Type */}
      <SectionCard icon={<MaskIcon />} title="Mask Type" subtitle="Match the mask fitted to this device" locked={locked}>
        <div className="option-grid cols-3">
          {MASK_TYPES.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={locked}
              aria-pressed={draft.maskType === m.id}
              className={`option-card${draft.maskType === m.id ? ' selected' : ''}`}
              onClick={() => set('maskType', m.id)}
            >
              <MaskArt type={m.id} />
              <span className="opt-title">{m.label}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* 4 — Tube Type */}
      <SectionCard icon={<BreezeIcon />} title="Tube Type" subtitle="Bore size affects delivered pressure" locked={locked}>
        <div className="option-grid cols-2">
          {TUBE_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={locked}
              aria-pressed={draft.tubeType === t.id}
              className={`option-card${draft.tubeType === t.id ? ' selected' : ''}`}
              onClick={() => set('tubeType', t.id)}
            >
              <TubeArt type={t.id} />
              <span className="opt-title">{t.title}</span>
              <span className="opt-sub">{t.sub}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* 5 — Humidifier */}
      <SectionCard icon={<DropletIcon />} title="Humidifier Level" subtitle="Warmth and moisture in the air path" locked={locked}>
        <Segmented
          disabled={locked}
          value={draft.humidifier}
          onChange={(v) => set('humidifier', v)}
          options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: n, label: n === 0 ? 'Off' : String(n) }))}
        />
        <p className="level-note">{HUMIDIFIER_NOTES[draft.humidifier]}</p>
        {draft.humidifier > 0 && (
          <div className="level-bar"><span style={{ width: `${(draft.humidifier / 5) * 100}%` }} /></div>
        )}
      </SectionCard>

      {/* 6 — Ramp & A-Flex (shared #1_CPAP + #2_AUTO, bytes 7-8) */}
      <SectionCard icon={<GaugeIcon />} title="Ramp &amp; A-Flex" subtitle="Shared by CPAP and Auto-CPAP modes" locked={locked}>
        <div className="stepper">
          <button
            type="button" aria-label="Decrease ramp" disabled={locked || draft.ramp <= 0}
            onClick={() => set('ramp', Math.max(0, draft.ramp - RAMP_STEP))}
          >−</button>
          <div className="value">
            <strong>{draft.ramp === 0 ? 'Off' : draft.ramp}</strong>
            <span>{draft.ramp === 0 ? 'no ramp' : 'minutes'}</span>
          </div>
          <button
            type="button" aria-label="Increase ramp" disabled={locked || draft.ramp >= RAMP_MAX}
            onClick={() => set('ramp', Math.min(RAMP_MAX, draft.ramp + RAMP_STEP))}
          >+</button>
        </div>

        <p className="level-note" style={{ marginTop: 18, marginBottom: 8, fontWeight: 700, color: 'var(--s-text)' }}>
          A-Flex
        </p>
        <Segmented
          disabled={locked}
          value={draft.aflex}
          onChange={(v) => set('aflex', v)}
          options={[0, 1, 2, 3].map((n) => ({ value: n, label: n === 0 ? 'Off' : String(n) }))}
        />
      </SectionCard>

      {/* Comfort ramp — byte 53, distinct from the shared ramp above */}
      <SectionCard icon={<GaugeIcon />} title="Comfort Ramp Time" subtitle="Comfort block ramp (independent of the shared ramp)" locked={locked}>
        <div className="stepper">
          <button
            type="button" aria-label="Decrease comfort ramp" disabled={locked || draft.comfortRamp <= 0}
            onClick={() => set('comfortRamp', Math.max(0, draft.comfortRamp - RAMP_STEP))}
          >−</button>
          <div className="value">
            <strong>{draft.comfortRamp === 0 ? 'Off' : draft.comfortRamp}</strong>
            <span>{draft.comfortRamp === 0 ? 'no ramp' : 'minutes'}</span>
          </div>
          <button
            type="button" aria-label="Increase comfort ramp" disabled={locked || draft.comfortRamp >= RAMP_MAX}
            onClick={() => set('comfortRamp', Math.min(RAMP_MAX, draft.comfortRamp + RAMP_STEP))}
          >+</button>
        </div>
      </SectionCard>

      {/* 7 — Device Options */}
      <SectionCard icon={<ShieldIcon />} title="Device Options" subtitle="Behaviour and alerting" locked={locked}>
        <div className="toggle-list">
          {OPTION_ROWS.map((row) => (
            <div className="opt-row" key={row.key}>
              <div>
                <strong>{row.label}</strong>
                <span>{row.sub}</span>
              </div>
              <PremiumToggle
                label={row.label}
                disabled={locked}
                checked={draft[row.key]}
                onChange={(v) => set(row.key, v)}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 8 — Floating apply bar */}
      {isDirty && !locked && (
        <div className="apply-bar" role="region" aria-label="Unsaved changes">
          <div className="msg">
            {changeList.length} change{changeList.length === 1 ? '' : 's'} pending
            <span>{isConnected ? 'Ready to send to device' : 'Device not connected'}</span>
          </div>
          <button type="button" className="reset" onClick={revertDraft}>Reset</button>
          <button type="button" className="apply" onClick={() => setFlow({ state: 'confirming' })}>
            Apply Changes
          </button>
        </div>
      )}

      {/* Confirm */}
      {flow.state === 'confirming' && (
        <div className="s-dialog-backdrop" onClick={() => setFlow({ state: 'idle' })}>
          <div className="s-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Apply these settings?</h3>
            <p>They are written to the device immediately.</p>
            <ul className="change-list">
              {changeList.map(([label, value]) => (
                <li key={label}><span>{label}</span><b>{value}</b></li>
              ))}
            </ul>
            <div className="actions">
              <button type="button" className="ghost" onClick={() => setFlow({ state: 'idle' })}>Cancel</button>
              <button type="button" className="primary" onClick={sendChanges}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Sending — not dismissable */}
      {flow.state === 'sending' && (
        <div className="s-dialog-backdrop">
          <div className="s-dialog" role="dialog" aria-modal="true">
            <div className="spinner" />
            <h3 style={{ textAlign: 'center' }}>Sending to device…</h3>
            <p style={{ textAlign: 'center' }}>
              Sent to the server; waiting for the device to confirm.
            </p>
            {pendingGroups.length > 0 && (
              <div className="frames">
                {pendingGroups.map((g) => <div key={g}>{g} → queued for {deviceData?.serial || adminActiveSerial}</div>)}
              </div>
            )}
            <div className="actions">
              <button
                type="button" className="ghost"
                onClick={() => {
                  setFlow({ state: 'idle' });
                  notify.info('Still sending in the background', {
                    message: `The server has the change for ${deviceData?.serial || adminActiveSerial}. It will reach the device when it next connects.`,
                  });
                }}
              >
                Stop waiting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Failed */}
      {flow.state === 'failed' && (
        <div className="s-dialog-backdrop" onClick={() => setFlow({ state: 'idle' })}>
          <div className="s-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Couldn&apos;t apply settings</h3>
            <p>{flow.reason}</p>
            <p style={{ marginTop: 10 }}>Your changes were rolled back to the values the device last confirmed.</p>
            <div className="actions">
              <button type="button" className="primary" onClick={() => setFlow({ state: 'idle' })}>OK</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
