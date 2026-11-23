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

/** "5 min ago", "2 h ago", "13 Nov" for a last-seen time, or null. */
function lastHeard(value) {
  const t = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(t)) return null;
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** True for the errors a browser throws when the request never reached a server. */
function isNetworkError(err) {
  if (err?.code === 'NETWORK') return true;
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
  const where = err?.path ? ` (${err.path})` : '';

  // No connection at all: the browser knows before any request is made.
  if (isOffline()) {
    return {
      kind: 'offline',
      title: "You're offline",
      message: 'Check your internet connection. Nothing was sent; try again once you are back online.',
      detail: raw,
      retryable: true,
    };
  }

  if (err?.code === 'DEVICE_OFFLINE' || err?.code === 'DEVICE_WITH_APP') {
    const device = err.serial || subject || 'The device';
    const heard = lastHeard(err.lastSeen);
    return err.code === 'DEVICE_WITH_APP'
      ? {
        kind: 'device-app',
        title: `${device} is connected to the phone app`,
        message: 'While the app is connected over Bluetooth, the device is off Wi-Fi and the website cannot reach it. Nothing was sent. Close the app on the phone, wait a few seconds for the device to rejoin Wi-Fi, then try again.',
        detail: raw,
        retryable: true,
      }
      : {
        kind: 'device-offline',
        title: `${device} is offline`,
        message: `Nothing was sent. The device is not connected to the internet${heard ? ` (last heard from ${heard})` : ''}. Check that it is switched on and on Wi-Fi, then try again once it shows Online.`,
        detail: raw,
        retryable: true,
      };
  }

  if (err?.code === 'NACKED') {
    return {
      kind: 'rejected',
      title: `The device rejected the command${on}`,
      message: `It answered that it could not apply it${raw ? `: ${raw}` : ''}. Check the device is idle (no therapy running) and try again.`,
      detail: raw,
      retryable: true,
    };
  }

  if (err?.code === 'BAD_RESPONSE') {
    return {
      kind: 'server',
      title: 'The server sent an unexpected answer',
      message: `It answered, but not with data, while trying to ${action}${on}. Try again; if it repeats, send the details to the backend team.`,
      detail: raw + where,
      retryable: true,
    };
  }

  if (err?.code === 'ACK_PENDING') {
    return {
      kind: 'timeout',
      title: "Sent, but the device hasn't confirmed",
      message: `The server sent the change${on}, but no confirmation from the device has reached it yet. It may still arrive; refresh in a minute to see what the device holds.`,
      detail: raw,
      retryable: true,
    };
  }

  if (err?.code === 'TIMEOUT' || err?.name === 'AbortError') {
    return {
      kind: 'timeout',
      title: 'The server is taking too long',
      message: `It did not answer in time while trying to ${action}${on}. Your connection may be slow or the server busy. Try again; if it keeps happening the server may be down.`,
      detail: raw + where,
      retryable: true,
    };
  }

  if (isNetworkError(err)) {
    return {
      kind: 'unreachable',
      title: "Couldn't reach the server",
      message: 'Your internet seems to be working, but the Resprox server did not answer. It may be down or blocked by this network. Try again in a minute.',
      detail: raw + where,
      retryable: true,
    };
  }

  if (err?.code === 'INCOMPLETE_SETTINGS') {
    return {
      kind: 'invalid',
      title: "Can't send these settings",
      message: raw,
      detail: subject,
      retryable: false,
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

  if (status === 401) {
    return {
      kind: 'auth',
      title: 'Your session has expired',
      message: 'Sign in again to continue. Nothing was sent.',
      detail: `HTTP 401: ${raw}`,
      retryable: false,
    };
  }

  if (status === 403) {
    return {
      kind: 'forbidden',
      title: "You don't have access",
      message: `Your account is not allowed to ${action}${on}. Ask an administrator if you need access.`,
      detail: `HTTP 403: ${raw}`,
      retryable: false,
    };
  }

  if (status === 404) {
    // API Gateway answers {"message":"Not Found"} for a route that does not exist,
    // which is a missing feature, not a missing device.
    const missingRoute = !err?.body?.error && /^not found$/i.test(String(err?.body?.message || ''));
    if (missingRoute) {
      return {
        kind: 'unavailable',
        title: "This isn't available on the server yet",
        message: `The server does not offer this yet, so we couldn't ${action}. Nothing is wrong on your side.`,
        detail: `HTTP 404${where}`,
        retryable: false,
      };
    }
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
      title: 'The device is busy',
      // The server names the cause (therapy running, sync in progress, already started/stopped).
      message: `${raw}. Refresh to see the current state, then try again.`,
      detail: `HTTP 409: ${raw}`,
      retryable: true,
    };
  }

  if (status === 429) {
    return {
      kind: 'throttled',
      title: 'Too many requests',
      message: 'The server is limiting requests right now. Wait a moment and try again.',
      detail: `HTTP 429: ${raw}`,
      retryable: true,
    };
  }

  if (status === 502 || status === 503 || status === 504) {
    return {
      kind: 'server-down',
      title: 'The server is temporarily unavailable',
      message: `We couldn't ${action}${on} because the server is not responding properly. It is usually back within a few minutes.`,
      detail: `HTTP ${status}: ${raw}`,
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
    message: 'Something unexpected went wrong. Try again, and contact support if it keeps happening.',
    detail: status ? `HTTP ${status}: ${raw}` : raw,
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
