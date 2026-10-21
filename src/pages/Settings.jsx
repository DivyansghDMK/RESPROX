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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeviceDataState from '../components/DeviceDataState';
import { useTherapy } from '../context/TherapyContext';
import {
  MaskIcon, BreezeIcon, GaugeIcon, ShieldIcon, CheckIcon,
} from '../components/Icons';
import { devicesAPI } from '../services/respireeApi';
import { describeCommandStatus, describeError } from '../services/apiError';
import { useNotify } from '../context/NotifyContext';
import fullFaceImg from '../assets/masks/full-face.svg';
import nasalImg from '../assets/masks/nasal.svg';
import pillowImg from '../assets/masks/pillow.svg';
import standardTubeImg from '../assets/tubes/standard.jpg';
import slimlineTubeImg from '../assets/tubes/slimline.jpg';

// Draft fields each wire group carries, so a partly applied send keeps what the device confirmed.
const GROUP_FIELDS = {
  COMFORT: ['comfortRamp', 'humidifier', 'tubeType', 'maskType'],
  OPTIONS: ['iMode', 'leakAlert', 'sleepMode'],
  CPAP: ['ramp'],
  AUTO: ['ramp', 'aflex'],
};
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));


// Ids follow the hardware spec (1 = Nasal, 2 = Full Face, 3 = Nasal Pillow).
const MASK_TYPES = [
  { id: 1, label: 'Nasal', img: nasalImg },
  { id: 2, label: 'Full Face', img: fullFaceImg },
  { id: 3, label: 'Pillow', img: pillowImg },
];

const TUBE_TYPES = [
  { id: 1, title: 'Standard', sub: '22 mm bore', img: standardTubeImg },
  { id: 2, title: 'SlimLine', sub: '15 mm bore', img: slimlineTubeImg },
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
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const bool = (v) => (v == null ? null : Boolean(Number(v)));

/** What the device reported, or null when it sent nothing — never a stand-in value. */
function committedFrom(deviceData, ctx) {
  const s = deviceData?.settings || {};
  return {
    maskType: num(s.mask_type),
    tubeType: num(s.tube_type),
    humidifier: num(s.humidifier),
    comfortRamp: num(s.ramp_time),
    ramp: num(ctx.ramp),
    aflex: num(ctx.aflex),
    iMode: bool(s.i_mode),
    leakAlert: bool(s.leak_alert),
    sleepMode: bool(s.sleep_mode),
  };
}

/** Drop the fields the device never reported so they are not sent as 0. */
const known = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null));

export default function Settings() {
  const ctx = useTherapy();
  const notify = useNotify();
  const {
    deviceData, adminActiveSerial,
    setRamp, setAflex, setShowToast, setToastMessage,
  } = ctx;

  const deviceOnline = Boolean(deviceData?.device_online);
  const isAutoMode = /auto/i.test(String(deviceData?.settings?.therapy_mode || ''));
  // The device reports no therapy-running flag over this transport yet; when it
  // does, swap this for that signal and the whole locked state comes alive.
  const isTherapyRunning = Boolean(deviceData?.therapy_running);
  // While a phone is paired over BLE the device drops Wi-Fi, so remote changes cannot reach it.
  const phoneConnected = /app connected/i.test(String(
    deviceData?.raw?.remarks ?? deviceData?.raw?.Remarks ?? deviceData?.raw?.offline_reason ?? ''
  ));


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

  // Device data often arrives after this screen mounts. Follow it while the user
  // has nothing pending, so the screen never sits on stale or empty values.
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;
  useEffect(() => {
    if (dirtyRef.current) return;
    const next = committedFrom(deviceData, ctx);
    setCommitted(next);
    setDraft(next);
  }, [deviceData, ctx.ramp, ctx.aflex]); // eslint-disable-line react-hooks/exhaustive-deps

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
      groups.COMFORT = known({
        rampTime: draft.comfortRamp,
        humidifierLevel: draft.humidifier,
        tubeType: draft.tubeType,
        maskType: draft.maskType,
      });
    }
    if (dirtyGroups.options) {
      groups.OPTIONS = known({
        iModeEnabled: draft.iMode == null ? null : Number(draft.iMode),
        leakAlertEnabled: draft.leakAlert == null ? null : Number(draft.leakAlert),
        sleepModeEnabled: draft.sleepMode == null ? null : Number(draft.sleepMode),
      });
    }
    if (dirtyGroups.rampAflex) {
      // A partial PATCH: pressures are untouched here, so they are not sent.
      groups[isAuto ? 'AUTO' : 'CPAP'] = known(isAuto
        ? { aflex: draft.aflex, ramp: draft.ramp }
        : { ramp: draft.ramp });
    }

    setPendingGroups(Object.keys(groups));

    // The dialog explains it in place; the frame keeps it on screen after the
    // dialog is dismissed, and carries the retry.
    // The API takes one mode per request, so groups go one at a time and each
    // must be ACKed before the next is sent. On failure the screen keeps every
    // group the device did confirm and rolls back only the rest.
    let confirmedState = committed;
    const confirmedGroups = [];
    const settle = () => { setCommitted(confirmedState); setDraft(confirmedState); };
    const partNote = () => (confirmedGroups.length
      ? ` ${confirmedGroups.join(', ')} ${confirmedGroups.length === 1 ? 'was' : 'were'} applied before this.`
      : '');

    // The dialog explains it in place; the frame keeps it on screen after the
    // dialog is dismissed, and carries the retry.
    const fail = (reason, described) => {
      settle();
      setFlow({ state: 'failed', reason: reason + partNote() });
      if (described) notify.fromDescription({ ...described, message: described.message + partNote() }, { onRetry: sendChangesRef.current });
      else notify.error("Couldn't apply settings", { message: reason + partNote() });
    };

    for (const [group, values] of Object.entries(groups)) {
      let res;
      try {
        res = await devicesAPI.updateDeviceGroups(serial, { [group]: values });
      } catch (err) {
        // A transport failure is the one case where we cannot know what the
        // device holds, so this group goes back to the last confirmed values.
        settle();
        const described = describeError(err, { action: 'save these settings', subject: serial });
        setFlow({ state: 'failed', reason: described.message + partNote() });
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
      }
      // ACKED, or NO_CHANGE (the device already held these values).
      confirmedState = { ...confirmedState, ...pick(draft, GROUP_FIELDS[group]) };
      confirmedGroups.push(group);
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
  }, [draft, committed, dirtyGroups, deviceData, adminActiveSerial, ctx, setRamp, setAflex, notify, changeList]);

  // Retry from a notification must call the *current* sendChanges, not the one
  // captured when the failure happened.
  const sendChangesRef = useRef(sendChanges);
  sendChangesRef.current = sendChanges;

  const locked = isTherapyRunning;

  if (!deviceData) return <DeviceDataState what="device settings" />;

  return (
    <div className="setting-screen">
      {/* 1 — Top bar */}
      <header className="setting-topbar">
        <div>
          <h1>Settings</h1>
          <p>Comfort &amp; device configuration</p>
        </div>
        <span className={`ble-pill${deviceOnline ? ' connected' : ''}`}>
          <span className="dot" aria-hidden="true" />
          {deviceOnline ? 'Device online' : 'Device offline'}
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

      {phoneConnected && (
        <div className="therapy-locked" role="status">
          <div>
            <strong>Connected to a phone</strong>
            <span>The device is paired with the mobile app over Bluetooth, so remote changes can't reach it right now.</span>
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
              <img src={m.img} alt="" className="mask-img" />
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
              <img src={t.img} alt="" className="mask-img" />
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
        <p className="level-note">{draft.humidifier == null ? 'Not reported by the device' : HUMIDIFIER_NOTES[draft.humidifier]}</p>
        {draft.humidifier > 0 && (
          <div className="level-bar"><span style={{ width: `${(draft.humidifier / 5) * 100}%` }} /></div>
        )}
      </SectionCard>

      {/* 6 — Ramp & A-Flex (shared #1_CPAP + #2_AUTO, bytes 7-8) */}
      <SectionCard icon={<GaugeIcon />} title="Ramp &amp; A-Flex" subtitle="Shared by CPAP and Auto-CPAP modes" locked={locked}>
        <div className="stepper">
          <button
            type="button" aria-label="Decrease ramp" disabled={locked || draft.ramp == null || draft.ramp <= 0}
            onClick={() => set('ramp', Math.max(0, draft.ramp - RAMP_STEP))}
          >−</button>
          <div className="value">
            <strong>{draft.ramp == null ? '—' : draft.ramp === 0 ? 'Off' : draft.ramp}</strong>
            <span>{draft.ramp == null ? 'not reported' : draft.ramp === 0 ? 'no ramp' : 'minutes'}</span>
          </div>
          <button
            type="button" aria-label="Increase ramp" disabled={locked || draft.ramp >= RAMP_MAX}
            onClick={() => set('ramp', Math.min(RAMP_MAX, (draft.ramp ?? 0) + RAMP_STEP))}
          >+</button>
        </div>

        <p className="level-note" style={{ marginTop: 18, marginBottom: 8, fontWeight: 700, color: 'var(--s-text)' }}>
          A-Flex
        </p>
        {!isAutoMode && (
          <p className="level-note">A-Flex applies to Auto CPAP only, so it can't be changed while the device is in CPAP mode.</p>
        )}
        <Segmented
          disabled={locked || !isAutoMode}
          value={draft.aflex}
          onChange={(v) => set('aflex', v)}
          options={[0, 1, 2, 3].map((n) => ({ value: n, label: n === 0 ? 'Off' : String(n) }))}
        />
      </SectionCard>

      {/* Comfort ramp — byte 53, distinct from the shared ramp above */}
      <SectionCard icon={<GaugeIcon />} title="Comfort Ramp Time" subtitle="Comfort block ramp (independent of the shared ramp)" locked={locked}>
        <div className="stepper">
          <button
            type="button" aria-label="Decrease comfort ramp" disabled={locked || draft.comfortRamp == null || draft.comfortRamp <= 0}
            onClick={() => set('comfortRamp', Math.max(0, draft.comfortRamp - RAMP_STEP))}
          >−</button>
          <div className="value">
            <strong>{draft.comfortRamp == null ? '—' : draft.comfortRamp === 0 ? 'Off' : draft.comfortRamp}</strong>
            <span>{draft.comfortRamp == null ? 'not reported' : draft.comfortRamp === 0 ? 'no ramp' : 'minutes'}</span>
          </div>
          <button
            type="button" aria-label="Increase comfort ramp" disabled={locked || draft.comfortRamp >= RAMP_MAX}
            onClick={() => set('comfortRamp', Math.min(RAMP_MAX, (draft.comfortRamp ?? 0) + RAMP_STEP))}
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
                <span>{draft[row.key] == null ? 'Not reported by the device' : row.sub}</span>
              </div>
              <PremiumToggle
                label={row.label}
                disabled={locked}
                checked={Boolean(draft[row.key])}
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
            <span>{deviceOnline ? 'Ready to send to device' : 'Device is offline'}</span>
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
