// src/services/apiError.js
//
// Turns whatever a failed call threw into something a person can act on.
//
// Every screen that talks to the server funnels its failures through here, so
// the same underlying problem reads the same way everywhere in the app instead
// of surfacing as a raw "TypeError: Failed to fetch" on one screen and a
// silent console warning on another.
//
// The shape returned is deliberately three-part:
//   title   — what failed, in the user's terms
//   message — what it means and what they can do
//   detail  — the technical text, shown small; support asks for this

const OFFLINE = 'You appear to be offline. Check your connection and try again.';

/** True for the errors a browser throws when the request never reached a server. */
function isNetworkError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const text = String(err?.message || '');
  return err?.name === 'TypeError' && /fetch|network|load failed/i.test(text);
}

/**
 * @param {unknown} err    the thrown value
 * @param {object} [opts]
 * @param {string} [opts.action]  what the user was doing, e.g. "save these settings"
 * @param {string} [opts.subject] what it applied to, e.g. a serial number
 */
export function describeError(err, { action = 'complete that', subject } = {}) {
  const raw = err?.message ? String(err.message) : String(err ?? 'Unknown error');
  const status = err?.status;
  const on = subject ? ` for ${subject}` : '';

  if (isNetworkError(err)) {
    return {
      kind: 'offline',
      title: `Couldn't reach the server`,
      message: OFFLINE,
      detail: raw,
      retryable: true,
    };
  }

  if (status === 400 || status === 422) {
    return {
      kind: 'invalid',
      title: 'The server rejected those values',
      // A 400 body normally names the offending field, so it is the most
      // useful thing we can show — no point paraphrasing it away.
      message: raw,
      detail: `HTTP ${status}${on}`,
      retryable: false,
    };
  }

  if (status === 401 || status === 403) {
    return {
      kind: 'auth',
      title: 'Your session has expired',
      message: 'Sign in again to continue. Your unsaved changes were not sent.',
      detail: `HTTP ${status}: ${raw}`,
      retryable: false,
    };
  }

  if (status === 404) {
    return {
      kind: 'missing',
      title: 'Not found on the server',
      message: subject
        ? `The server has no record of ${subject}. It may have been removed, or the serial may be wrong.`
        : 'The server has no record of that item.',
      detail: `HTTP 404: ${raw}`,
      retryable: false,
    };
  }

  if (status === 409) {
    return {
      kind: 'conflict',
      title: 'Someone else changed this first',
      message: 'Refresh to load the current values, then apply your change again.',
      detail: `HTTP 409: ${raw}`,
      retryable: true,
    };
  }

  if (status === 429) {
    return {
      kind: 'throttled',
      title: 'Too many requests',
      message: 'The server is rate-limiting this device. Wait a moment and try again.',
      detail: `HTTP 429: ${raw}`,
      retryable: true,
    };
  }

  if (status >= 500) {
    return {
      kind: 'server',
      title: 'The server had a problem',
      message: `It could not ${action}${on}. This is on our side — try again shortly.`,
      detail: `HTTP ${status}: ${raw}`,
      retryable: true,
    };
  }

  return {
    kind: 'unknown',
    title: `Couldn't ${action}`,
    message: raw,
    detail: status ? `HTTP ${status}` : undefined,
    retryable: true,
  };
}

/** Device command outcomes are not HTTP failures, but they read the same way. */
export function describeCommandStatus(status, { subject } = {}) {
  const on = subject ? ` (${subject})` : '';
  if (status === 'NACKED') {
    return {
      kind: 'rejected',
      title: 'The device rejected the change',
      message: `It reported the values as invalid${on}. They were rolled back.`,
      retryable: false,
    };
  }
  if (status === 'TIMEOUT') {
    return {
      kind: 'timeout',
      title: `The device didn't confirm`,
      message: `The server accepted the change but the device never acknowledged it${on}. It may be offline or asleep; your changes were rolled back.`,
      retryable: true,
    };
  }
  return null;
}
