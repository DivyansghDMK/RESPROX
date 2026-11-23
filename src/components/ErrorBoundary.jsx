// src/components/ErrorBoundary.jsx
//
// Keeps one broken page from blanking the whole app. The sidebar and header
// stay up; the page area shows what happened and a way back.
//
// After a new deploy, a tab that was already open asks for page files that no
// longer exist ("Failed to fetch dynamically imported module"). That is fixed
// by loading the new version, so the boundary reloads once by itself.

import React from 'react';
import ErrorPanel from './ErrorPanel';

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
    if (stale) {
      return (
        <div className="load-error" role="alert">
          <strong>A new version of the app is available</strong>
          <p>Reload to get it. Nothing on the device is affected.</p>
          <div className="load-error-actions">
            <button className="admin-page-btn primary" onClick={() => window.location.reload()}>Reload page</button>
          </div>
        </div>
      );
    }
    // A bug in this page, not a server or device problem: say so, keep the
    // rest of the app usable, and give the engineer the report for the team.
    return (
      <ErrorPanel
        error={error}
        action="show this page"
        described={{
          title: 'This page ran into a problem',
          message: 'A bug in the website stopped this page. The device and the server are not affected, and the rest of the app still works. Reload, or go back to Devices, and send the details to the web team.',
          retryable: false,
        }}
      >
        <div className="load-error-actions" style={{ marginTop: 14 }}>
          <button className="admin-page-btn primary" onClick={() => window.location.reload()}>Reload page</button>
          <button className="admin-page-btn" onClick={() => { window.location.href = '/devices'; }}>← Back to Devices</button>
        </div>
      </ErrorPanel>
    );
  }
}
