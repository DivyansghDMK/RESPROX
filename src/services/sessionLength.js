// src/services/sessionLength.js
//
// How long a sign-in lasts: 7 days from the moment the password was entered.
// Token refreshes keep the session alive in between but never move this
// start, so after 7 days the user signs in again.
//
// This is the website's limit. Cognito's own refresh token lifetime (app
// client setting) should be set to 7 days as well, so a copied refresh token
// stops working on the server at the same time.

export const SESSION_DAYS = 7;
export const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

/** True once a session that started at `signedInAt` (ms) is 7 days old. */
export function sessionOver(signedInAt, now = Date.now()) {
  const start = Number(signedInAt);
  if (!Number.isFinite(start) || start <= 0) return false;
  return now - start >= SESSION_MS;
}

/** Whole days and hours left, for showing; null when there is no start. */
export function sessionLeft(signedInAt, now = Date.now()) {
  const start = Number(signedInAt);
  if (!Number.isFinite(start) || start <= 0) return null;
  const ms = Math.max(0, start + SESSION_MS - now);
  return { days: Math.floor(ms / 86400000), hours: Math.floor((ms % 86400000) / 3600000) };
}
