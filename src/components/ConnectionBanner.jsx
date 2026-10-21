import React, { useEffect, useState } from 'react';

/**
 * App-wide notice for the one failure every screen shares: no internet.
 * While offline nothing can be sent and what is on screen may be stale, so say
 * both; when the connection returns, offer to reload rather than guess.
 */
/** Live browser connectivity, for anything that must not claim "connected" while offline. */
export function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export default function ConnectionBanner() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [cameBack, setCameBack] = useState(false);

  useEffect(() => {
    const goOffline = () => { setOnline(false); setCameBack(false); };
    const goOnline = () => { setOnline(true); setCameBack(true); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!online) {
    return (
      <div className="connection-banner offline" role="alert">
        <strong>You're offline.</strong>
        <span>The data on screen may be out of date, and changes can't be sent until the connection is back.</span>
      </div>
    );
  }
  if (cameBack) {
    return (
      <div className="connection-banner online" role="status">
        <strong>Back online.</strong>
        <span>Reload to see the latest data.</span>
        <button type="button" onClick={() => window.location.reload()}>Reload</button>
        <button type="button" className="dismiss" aria-label="Dismiss" onClick={() => setCameBack(false)}>×</button>
      </div>
    );
  }
  return null;
}
