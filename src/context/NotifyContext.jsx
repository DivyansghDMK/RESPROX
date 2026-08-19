// src/context/NotifyContext.jsx
//
// One place for every user-facing message in the app.
//
// It is mounted above the router, so a notification raised anywhere — the app
// shell, the HCP portal, the login screen — lands in the same frame in the
// same corner. Screens no longer each invent their own alert()/toast/inline
// banner, which is what made the same server failure look different depending
// on where you hit it.
//
// Errors stay until dismissed: a message about changes that did not save must
// not disappear before the user has read it. Successes auto-dismiss.

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { describeError } from '../services/apiError';

const NotifyContext = createContext(null);

const AUTO_DISMISS_MS = { success: 4000, info: 5000, warning: 8000, error: null };
const MAX_VISIBLE = 4;

export function NotifyProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());
  const seq = useRef(0);

  const dismiss = useCallback((id) => {
    setItems((list) => list.filter((n) => n.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const push = useCallback((tone, payload) => {
    const id = `n${++seq.current}`;
    const item = { id, tone, ...payload };

    setItems((list) => {
      // Repeating the identical message stacks noise rather than information;
      // refresh the existing one instead.
      const duplicate = list.find((n) => n.tone === tone && n.title === item.title && n.message === item.message);
      if (duplicate) return list.map((n) => (n === duplicate ? { ...item, id: duplicate.id } : n));
      return [...list, item].slice(-MAX_VISIBLE);
    });

    const ttl = AUTO_DISMISS_MS[tone];
    if (ttl) timers.current.set(id, setTimeout(() => dismiss(id), ttl));
    return id;
  }, [dismiss]);

  const api = useMemo(() => ({
    success: (title, opts = {}) => push('success', { title, ...opts }),
    info: (title, opts = {}) => push('info', { title, ...opts }),
    warning: (title, opts = {}) => push('warning', { title, ...opts }),
    error: (title, opts = {}) => push('error', { title, ...opts }),

    /**
     * The common case: something thrown while talking to the server.
     * `action` and `subject` shape the wording; `onRetry` adds a Retry button.
     */
    fromError: (err, { action, subject, onRetry } = {}) => {
      const described = describeError(err, { action, subject });
      return push('error', {
        title: described.title,
        message: described.message,
        detail: described.detail,
        onRetry: described.retryable ? onRetry : undefined,
      });
    },

    /** A device command that came back NACKED / TIMEOUT rather than ACKED. */
    fromDescription: (described, { onRetry } = {}) => push('error', {
      title: described.title,
      message: described.message,
      detail: described.detail,
      onRetry: described.retryable ? onRetry : undefined,
    }),

    dismiss,
    clear: () => setItems([]),
  }), [push, dismiss]);

  return (
    <NotifyContext.Provider value={api}>
      {children}
      <NotificationFrame items={items} onDismiss={dismiss} />
    </NotifyContext.Provider>
  );
}

const ICONS = {
  success: '✓',
  error: '!',
  warning: '!',
  info: 'i',
};

function NotificationFrame({ items, onDismiss }) {
  if (!items.length) return null;
  return (
    <div className="notify-frame" role="region" aria-label="Notifications">
      {items.map((n) => (
        <div key={n.id} className={`notify-card ${n.tone}`} role={n.tone === 'error' ? 'alert' : 'status'}>
          <span className="notify-icon" aria-hidden="true">{ICONS[n.tone]}</span>
          <div className="notify-body">
            <strong>{n.title}</strong>
            {n.message && <p>{n.message}</p>}
            {n.detail && <code>{n.detail}</code>}
            {n.onRetry && (
              <button type="button" className="notify-retry" onClick={() => { onDismiss(n.id); n.onRetry(); }}>
                Try again
              </button>
            )}
          </div>
          <button type="button" className="notify-close" aria-label="Dismiss" onClick={() => onDismiss(n.id)}>×</button>
        </div>
      ))}
    </div>
  );
}

export function useNotify() {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error('useNotify must be used within a NotifyProvider');
  return ctx;
}
