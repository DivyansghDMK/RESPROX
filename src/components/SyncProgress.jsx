// src/components/SyncProgress.jsx
//
// A floating card while reports sync from the device, so the wait shows what
// is happening instead of a spinner:
//   requesting  the cloud asks the device for its new sessions
//   receiving   sessions travel from the device to the cloud and stack up as
//               report pages; the count is the server's own, not an estimate
//   finishing   the page loads the new sessions
//   done        a tick and how many sessions came in, then the card goes
// Short tips rotate underneath. Still for reduced motion.

import React, { useCallback, useEffect, useRef, useState } from 'react';

const STEPS = [
  { key: 'requesting', label: 'Asking the device' },
  { key: 'receiving', label: 'Receiving sessions' },
  { key: 'finishing', label: 'Preparing reports' },
];

const TITLES = {
  requesting: 'Asking the device for new sessions',
  receiving: 'Sessions are on their way',
  finishing: 'Preparing your reports',
  done: 'Reports are up to date',
};

const TIPS = [
  'An AHI under 5 events an hour is the usual target on therapy.',
  'Compliance usually means at least 4 hours a night on 70% of nights.',
  'Leak above 24 L/min often means the mask needs refitting.',
  'Nights are grouped by the date therapy started, so a session after midnight stays with its night.',
  'Keep the device on Wi-Fi until this finishes. The phone app takes it off Wi-Fi.',
  'The device keeps sending even if you leave this page.',
];

function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const UP = 'M74 58 C 110 18, 150 18, 186 44';
const DOWN = 'M186 44 C 150 18, 110 18, 74 58';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Scene({ phase, received }) {
  const pages = Math.min(received, 5);
  const moving = !reducedMotion();
  return (
    <svg className="syncp-scene" viewBox="0 0 260 96" aria-hidden="true">
      <defs>
        <linearGradient id="syncp-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#0047CC" />
          <stop offset="1" stopColor="#16E0B3" />
        </linearGradient>
      </defs>

      {/* CPAP device: body, screen, dial, hose port */}
      <g className="syncp-device">
        <rect x="10" y="40" width="62" height="40" rx="9" fill="#fff" stroke="#c7d6ee" strokeWidth="1.6" />
        <rect x="18" y="47" width="28" height="15" rx="3" fill="#0f2a5c" />
        <path className="syncp-wave" d="M21 56 l4 0 l2 -5 l3 9 l2 -4 l4 0 l2 -2 l3 2" fill="none" stroke="#16E0B3" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="59" cy="55" r="6" fill="none" stroke="#9fb4d6" strokeWidth="1.6" />
        <rect x="18" y="68" width="10" height="4" rx="2" fill="#dbe5f4" />
        <rect x="31" y="68" width="10" height="4" rx="2" fill="#dbe5f4" />
        <circle className={`syncp-led ${phase}`} cx="64" cy="72" r="2.2" />
      </g>

      {/* The path the data takes */}
      <path d={UP} fill="none" stroke="#dbe5f4" strokeWidth="2" strokeDasharray="3 5" />
      {moving && phase === 'receiving' && [0, 1, 2, 3].map((i) => (
        <rect key={i} className="syncp-packet" width="9" height="11" rx="2" x="-4.5" y="-5.5" fill="url(#syncp-grad)" opacity="0">
          <animateMotion dur="1.8s" begin={`${i * 0.45}s`} repeatCount="indefinite" path={UP} />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="1.8s" begin={`${i * 0.45}s`} repeatCount="indefinite" />
        </rect>
      ))}
      {moving && phase === 'requesting' && (
        <circle r="4" fill="#0047CC" opacity="0">
          <animateMotion dur="1.6s" repeatCount="indefinite" path={DOWN} />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Cloud with the report pages it has received */}
      <g className={`syncp-cloud ${phase}`}>
        <path d="M188 74 h48 a14 14 0 0 0 2 -27.8 a19 19 0 0 0 -36.5 -4.8 a14 14 0 0 0 -13.5 32.6 z" fill="#fff" stroke="#c7d6ee" strokeWidth="1.6" strokeLinejoin="round" />
        {Array.from({ length: pages }, (_, i) => (
          <g key={i} transform={`translate(${200 + i * 5} ${50 - i * 2.5})`}>
            <g className="syncp-page">
              <rect width="18" height="22" rx="2.5" fill="#fff" stroke="#0047CC" strokeWidth="1.2" />
              <path d="M4 7h10M4 11h10M4 15h6" stroke="#9fb4d6" strokeWidth="1.2" strokeLinecap="round" />
            </g>
          </g>
        ))}
        {phase === 'done' && (
          <g className="syncp-done-tick">
            <circle cx="214" cy="58" r="11" fill="#28b36d" />
            <path d="M208.5 58.5l3.8 3.8 7.2-7.6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
      </g>
    </svg>
  );
}

/** phase: 'requesting' | 'receiving' | 'finishing' | 'done'; startedAt: ms. */
export default function SyncProgress({ serial, phase, received = 0, startedAt, onHide }) {
  const [now, setNow] = useState(Date.now());
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));

  useEffect(() => {
    if (phase === 'done') return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase === 'done') return undefined;
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 6500);
    return () => clearInterval(t);
  }, [phase]);

  const stepIndex = phase === 'done' ? STEPS.length : STEPS.findIndex((s) => s.key === phase);
  const count = received === 1 ? '1 session' : `${received} sessions`;

  return (
    <div className={`syncp ${phase}`} role="status" aria-live="polite">
      <div className="syncp-head">
        <span className="syncp-eyebrow">Report sync{serial ? ` · ${serial}` : ''}</span>
        {onHide && phase !== 'done' && (
          <button type="button" className="syncp-hide" onClick={onHide} title="Hide. The sync keeps running.">Hide</button>
        )}
      </div>

      <Scene phase={phase} received={received} />

      <div className="syncp-title">{TITLES[phase]}</div>
      <div className="syncp-meta">
        {phase === 'done'
          ? (received ? `${count} added` : 'No new sessions. The device was already up to date.')
          : <><span className="syncp-count" key={received}>{count} received</span><span aria-hidden="true"> · </span><span>{clock(now - startedAt)}</span></>}
      </div>

      <ol className="syncp-steps">
        {STEPS.map((s, i) => (
          <li key={s.key} className={i < stepIndex ? 'is-done' : i === stepIndex ? 'is-active' : ''}>
            <span className="syncp-step-dot" aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ol>

      {phase !== 'done' && (
        <p className="syncp-tip" key={tip}><span>Did you know?</span> {TIPS[tip]}</p>
      )}
      <span className="syncp-bar" aria-hidden="true" />
    </div>
  );
}

/**
 * State for the card. `begin()` when the sync starts, pass `progress` as
 * syncReports' onProgress, `finishing()` while the page reloads, then
 * `finish(received)` (shows the result for 3 s) or `clear()`.
 */
export function useSyncProgress() {
  const [view, setView] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const begin = useCallback(() => {
    clearTimeout(timer.current);
    setView({ phase: 'requesting', received: 0, startedAt: Date.now(), hidden: false });
  }, []);
  const progress = useCallback(({ phase, received }) => {
    setView((v) => (v ? { ...v, phase, received: Math.max(v.received, received || 0) } : v));
  }, []);
  const finishing = useCallback(() => setView((v) => (v ? { ...v, phase: 'finishing' } : v)), []);
  const clear = useCallback(() => { clearTimeout(timer.current); setView(null); }, []);
  const finish = useCallback((received) => {
    setView((v) => (v ? { ...v, phase: 'done', received: Math.max(v.received, received || 0) } : v));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setView(null), 3000);
  }, []);
  const hide = useCallback(() => setView((v) => (v ? { ...v, hidden: true } : v)), []);

  return { view, begin, progress, finishing, finish, clear, hide };
}
