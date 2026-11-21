// src/services/clientIp.js
//
// The address this browser reaches the server from, as the server sees it.
// The browser cannot know its public address by itself, and asking an outside
// service would send the user's details to a third party, so it comes only
// from our own API: GET /me returns it (API Gateway's sourceIp). An address
// the browser reported would be easy to fake, so commands are recorded with
// the server's view, not with anything sent from here.

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

/** The IP from a GET /me response, or null when it has none or it isn't an address. */
export function pickClientIp(me) {
  const raw = me?.ip ?? me?.source_ip ?? me?.sourceIp ?? me?.client_ip ?? me?.data?.ip ?? null;
  const ip = typeof raw === 'string' ? raw.trim() : '';
  if (IPV4.test(ip)) return ip;
  if (ip.includes(':') && IPV6.test(ip)) return ip.toLowerCase();
  return null;
}
