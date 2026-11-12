// src/components/ErrorBoundary.jsx
//
// Keeps one broken page from blanking the whole app. The sidebar and header
// stay up; the page area shows what happened and a way back.
//
// After a new deploy, a tab that was already open asks for page files that no
// longer exist ("Failed to fetch dynamically imported module"). That is fixed
// by loading the new version, so the boundary reloads once by itself.

import React from 'react';

const RELOADED_KEY = 'resproxChunkReloadAt';

export function isStaleBuildError(error) {
  const text = String(error?.message || error || '');
  return /dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|error loading dynamically imported/i.test(text);
}

/** Reload at most once a minute, so a real outage can't loop the page. */
function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, reloading: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (isStaleBuildError(error) && reloadOnce()) {
      this.setState({ reloading: true });
      return;
    }
    console.error('[page error]', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Moving to another page gives it a fresh start.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, reloading: false });
    }
  }

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;
    if (reloading) return <div className="load-error" role="status"><strong>Updating to the latest version…</strong></div>;

    const stale = isStaleBuildError(error);
    return (
      <div className="load-error" role="alert">
        <strong>{stale ? 'A new version of the app is available' : 'This page ran into a problem'}</strong>
        <p>
          {stale
            ? 'Reload to get it. Nothing you saved on the device is affected.'
            : 'The rest of the app still works. Reload the page, or go back to Devices. If it keeps happening, tell support what you were doing.'}
        </p>
        {!stale && <code>{String(error?.message || error).slice(0, 300)}</code>}
        <div className="load-error-actions">
          <button className="admin-page-btn primary" onClick={() => window.location.reload()}>Reload page</button>
          {!stale && (
            <button className="admin-page-btn" onClick={() => { window.location.href = '/devices'; }}>← Back to Devices</button>
          )}
        </div>
      </div>
    );
  }
}
