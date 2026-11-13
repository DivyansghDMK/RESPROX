// src/components/SyncReportsButton.jsx
//
// "Sync reports" with its state shown in the button itself:
//   idle     sync arrows
//   syncing  data dots travel from the device to the cloud, a shimmer runs
//            along the bottom
//   done     a tick and the result ("3 new", "Up to date") for a few seconds
// Still for reduced motion.

import React from 'react';

function SyncArrows() {
  return (
    <svg className="sync-arrows" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M18 2.5v4.4h-4.4M6 21.5v-4.4h4.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Transfer() {
  return (
    <svg className="sync-transfer" viewBox="0 0 44 16" width="44" height="16" aria-hidden="true">
      <rect x="1" y="4" width="9" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M33 13h7.5a3.5 3.5 0 0 0 .3-7 4.6 4.6 0 0 0-8.8 1A3 3 0 0 0 33 13z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle className="sync-dot" cx="14" cy="8.5" r="1.6" />
      <circle className="sync-dot" cx="14" cy="8.5" r="1.6" />
      <circle className="sync-dot" cx="14" cy="8.5" r="1.6" />
    </svg>
  );
}

/** result: null, or { added } shown briefly after a finished sync. */
export default function SyncReportsButton({ syncing, result, disabled, onClick }) {
  const state = syncing ? 'syncing' : result ? 'done' : 'idle';
  return (
    <button
      type="button"
      className={`sync-btn ${state}`}
      onClick={onClick}
      disabled={disabled || syncing}
      title={disabled && !syncing ? 'Device is offline' : 'Pull new therapy reports from the device'}
      aria-live="polite"
    >
      {state === 'syncing' && <><Transfer /><span>Syncing…</span><span className="sync-shimmer" aria-hidden="true" /></>}
      {state === 'done' && (
        <>
          <svg className="sync-tick" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{result.added ? `${result.added} new` : 'Up to date'}</span>
        </>
      )}
      {state === 'idle' && <><SyncArrows /><span>Sync reports</span></>}
    </button>
  );
}
