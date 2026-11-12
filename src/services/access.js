// src/services/access.js
//
// Who may do what. Pure functions, so the rules are tested in one place and
// every screen asks the same question the same way.
//
// The website only hides and locks what a role cannot use. The server must
// enforce the same rules (scope /devices by role, refuse a dealer's PATCH to
// any group but COMFORT, refuse a dealer's therapy start/stop), because
// anything in the browser can be bypassed.

export const ROLES = { ADMIN: 'admin', DEALER: 'dealer', DOCTOR: 'doctor' };

/**
 * Role from the Cognito ID token. Dealers and doctors are Cognito groups; a
 * doctor who signed up before groups existed is recognised by the licence
 * number claim. An account in no group is the original admin account.
 */
export function roleFromClaims(claims = {}) {
  const raw = claims['cognito:groups'];
  const groups = Array.isArray(raw) ? raw : String(raw || '').split(/[\s,]+/).filter(Boolean);
  if (groups.includes(ROLES.ADMIN)) return ROLES.ADMIN;
  if (groups.includes(ROLES.DEALER)) return ROLES.DEALER;
  if (groups.includes(ROLES.DOCTOR) || claims['custom:license_no']) return ROLES.DOCTOR;
  return ROLES.ADMIN;
}

/** Settings groups a dealer may change: comfort only (ramp time, humidifier, tube, mask). */
const DEALER_GROUPS = new Set(['COMFORT']);

/**
 * What a role may do. `serials` is the dealer's device list (ignored for
 * other roles, who see every device until per-doctor scoping exists).
 */
export function permissionsFor(role, serials = []) {
  const dealer = role === ROLES.DEALER;
  const allowed = new Set(serials.map((s) => String(s).toUpperCase()));
  return {
    role,
    isAdmin: role === ROLES.ADMIN,
    isDealer: dealer,
    manageDealers: role === ROLES.ADMIN,
    manageCustomers: role === ROLES.ADMIN || dealer,
    // Start/stop therapy is admin only (decided 2026-10-28).
    controlTherapy: role === ROLES.ADMIN,
    // Pressure calibration changes what every later reading means: admin only.
    calibrate: role === ROLES.ADMIN,
    // Pressure, mode, shared ramp and A-Flex.
    editTherapySettings: !dealer,
    canEditGroup: (group) => !dealer || DEALER_GROUPS.has(group),
    canSeeDevice: (serial) => !dealer || allowed.has(String(serial || '').toUpperCase()),
    allowedSerials: dealer ? allowed : null,
  };
}
