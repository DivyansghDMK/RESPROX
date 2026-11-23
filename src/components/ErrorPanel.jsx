// src/components/ErrorPanel.jsx
//
// The one way a page shows a failure. Three layers, for the DeckMount
// service engineer reading it:
//   1. what failed and what to do now (title, message, Try again)
//   2. the facts, folded: request, HTTP status or network/timeout, device,
//      time, page, app build
//   3. "Copy for backend": all of it as text, to paste to the backend team
//
// Pass `error` (anything thrown) with `action`/`subject`, or a ready
// `described` from describeError. Never throws itself.

import React, { useState } from 'react';
import { describeError } from '../services/apiError';
import { copyText, errorFacts, errorReport } from '../services/diagnostics';

export default function ErrorPanel({ error, described, action, subject, onRetry, children, compact = false }) {
  const [copied, setCopied] = useState(null);
  let d = described;
  let facts = [];
  try {
    d = d || describeError(error, { action, subject });
    facts = error ? errorFacts(error, { action, subject }) : [];
  } catch {
    d = { title: 'Something went wrong', message: String(error?.message || error || ''), retryable: Boolean(onRetry) };
  }

  const copy = async () => {
    const ok = await copyText(error ? errorReport(error, { action, subject }) : `${d.title}\n${d.message}\n${d.detail || ''}`);
    setCopied(ok ? 'Copied' : 'Couldn’t copy');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className={`load-error error-panel${compact ? ' compact' : ''}`} role="alert">
      <strong>{d.title}</strong>
      {d.message && <p>{d.message}</p>}
      {children}
      {(facts.length > 0 || d.detail) && (
        <details className="error-facts">
          <summary>Technical details</summary>
          {facts.length ? (
            <dl>
              {facts.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
            </dl>
          ) : <code>{d.detail}</code>}
        </details>
      )}
      <div className="load-error-actions">
        {onRetry && d.retryable !== false && <button type="button" className="admin-page-btn primary" onClick={onRetry}>Try again</button>}
        <button type="button" className="admin-page-btn" onClick={copy} aria-live="polite">{copied || 'Copy for backend'}</button>
      </div>
    </div>
  );
}
