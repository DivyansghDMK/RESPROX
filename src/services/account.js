// src/services/account.js
//
// Who the signed-in user is, read from GET /me. One shape for every screen,
// whichever version of the server answers:
//
//   new  { role, org: { id, name, type, path }, org_roles: [...], ip, device_serials? }
//   old  { role, dealer: { id, name, device_serials } | null, ip? }
//   none (no /me, or it failed)  → role from the Cognito token, as before
//
// The server decides the role once it sends one; the token is only the
// fallback for servers that don't. Either way the server must still enforce
// every rule: this only decides what the website shows.

import { ROLES } from './access.js';
import { pickClientIp } from './clientIp.js';

const KNOWN_ROLES = new Set(Object.values(ROLES));
export const ORG_ROLES = ['administrator', 'clinical', 'data_manager'];

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const serialList = (v) => (Array.isArray(v) ? v.map((s) => String(s).toUpperCase()) : null);

function readOrg(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = text(raw.id) ?? (raw.id != null ? String(raw.id) : null);
  if (!id) return null;
  return {
    id,
    name: text(raw.name) || id,
    type: text(raw.type),
    path: text(raw.path ?? raw.org_path),
  };
}

/**
 * The account behind a GET /me answer. `fallbackRole` is the role from the
 * token, used only when the server sends none it knows.
 */
export function parseMe(me, fallbackRole = null) {
  const body = me?.data && typeof me.data === 'object' && !Array.isArray(me.data) ? { ...me.data, ...me } : (me || {});
  const serverRole = text(body.role ?? body.account_role)?.toLowerCase() ?? null;
  const role = KNOWN_ROLES.has(serverRole) ? serverRole : fallbackRole;
  const org = readOrg(body.org ?? body.organisation ?? body.organization);
  const orgRoles = (Array.isArray(body.org_roles) ? body.org_roles : [])
    .map((r) => String(r).toLowerCase())
    .filter((r) => ORG_ROLES.includes(r));

  // A dealer's own record. Older servers send it as `dealer`; newer ones send
  // the organisation, which is the same thing for a dealer.
  const oldDealer = body.dealer && typeof body.dealer === 'object' ? body.dealer : null;
  let dealer = null;
  if (oldDealer?.id != null) {
    dealer = { id: String(oldDealer.id), name: text(oldDealer.name) || String(oldDealer.id), device_serials: serialList(oldDealer.device_serials) };
  } else if (role === ROLES.DEALER && org) {
    dealer = { id: org.id, name: org.name, device_serials: serialList(body.device_serials ?? body.org?.device_serials) };
  }

  return {
    role,
    roleFromServer: KNOWN_ROLES.has(serverRole),
    org: org || (dealer ? { id: dealer.id, name: dealer.name, type: 'dealer', path: null } : null),
    orgRoles,
    dealer,
    ip: pickClientIp(body),
  };
}
