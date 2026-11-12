// src/services/partnersApi.js
//
// Dealers and customers, through the backend. The routes below are the
// contract for the backend work (Lambdas + Neon tables `dealers`,
// `dealer_devices`, `customers`); they are not deployed yet.
//
//   GET    /me                        → { role, dealer: { id, name, device_serials } | null }
//   GET    /dealers                   → [{ id, name, company, email, phone, city,
//                                          device_serials, customer_count, created_at }]   admin
//   POST   /dealers          {name, company, email, phone, city}                           admin
//          (also creates the dealer's Cognito login in the `dealer` group and emails an invite)
//   PATCH  /dealers/{id}     same fields                                                  admin
//   DELETE /dealers/{id}     removes the dealer, their customers and their login          admin
//   PUT    /dealers/{id}/devices {serials: [...]}                                          admin
//   GET    /customers[?dealer_id=]    → [{ id, dealer_id, name, phone, email,
//                                          device_serial, notes, created_at }]
//          admin: all (or one dealer's); dealer: only their own
//   POST   /customers        {dealer_id, name, phone, email, device_serial, notes}
//          a dealer's dealer_id is taken from their token, never the body
//   PATCH  /customers/{id}   same fields except dealer_id
//   DELETE /customers/{id}
//
// Until the routes exist the server answers 404. In `npm run dev` that switches
// this module to a preview store kept in this browser (see partners.js), so the
// pages can be tried; a production build never does that and reports the
// feature as not switched on yet.

import { request } from './respireeApi';
import {
  addCustomer, addDealer, assignDevices, dealersWithCounts, editCustomer, editDealer,
  emptyStore, removeCustomer, removeDealer,
} from './partners';

const PREVIEW_KEY = 'resproxPartnersPreview';
let mode = null; // 'server' | 'preview', settled on the first answer

export class NotDeployedError extends Error {
  constructor() {
    super('Dealers and customers are ready on the website but not switched on on the server yet.');
    this.code = 'NOT_DEPLOYED';
  }
}

function loadPreview() {
  try {
    return { ...emptyStore(), ...JSON.parse(localStorage.getItem(PREVIEW_KEY) || '{}') };
  } catch {
    return emptyStore();
  }
}

function savePreview(store) {
  try {
    localStorage.setItem(PREVIEW_KEY, JSON.stringify(store));
  } catch {
    // Storage blocked: the change lasts until the page reloads.
  }
  return store;
}

/**
 * Run against the server; on a 404 for a route that isn't deployed, fall back
 * to the preview store in dev, or report "not switched on" in production.
 */
async function call(serverFn, previewFn) {
  if (mode !== 'preview') {
    try {
      const result = await serverFn();
      mode = 'server';
      return result;
    } catch (err) {
      if (err?.status !== 404 || mode === 'server') throw err;
      if (!import.meta.env.DEV) throw new NotDeployedError();
      mode = 'preview';
    }
  }
  return previewFn();
}

const list = (json) => (Array.isArray(json) ? json : json?.data || json?.items || []);
const id = (v) => encodeURIComponent(v);

/** True once the data is known to come from this browser's preview store. */
export const isPreview = () => mode === 'preview';

export const partnersAPI = {
  me: (previewDealerId) => call(
    () => request('/me'),
    () => {
      const dealer = loadPreview().dealers.find((d) => d.id === previewDealerId) || null;
      return { role: dealer ? 'dealer' : 'admin', dealer };
    },
  ),

  listDealers: () => call(
    async () => list(await request('/dealers')),
    () => dealersWithCounts(loadPreview()),
  ),

  createDealer: (data) => call(
    () => request('/dealers', { method: 'POST', body: JSON.stringify(data) }),
    () => { const r = addDealer(loadPreview(), data); savePreview(r.store); return r.dealer; },
  ),

  updateDealer: (dealerId, data) => call(
    () => request(`/dealers/${id(dealerId)}`, { method: 'PATCH', body: JSON.stringify(data) }),
    () => { const r = editDealer(loadPreview(), dealerId, data); savePreview(r.store); return r.dealer; },
  ),

  deleteDealer: (dealerId) => call(
    () => request(`/dealers/${id(dealerId)}`, { method: 'DELETE' }),
    () => { savePreview(removeDealer(loadPreview(), dealerId)); return null; },
  ),

  setDealerDevices: (dealerId, serials) => call(
    () => request(`/dealers/${id(dealerId)}/devices`, { method: 'PUT', body: JSON.stringify({ serials }) }),
    () => { savePreview(assignDevices(loadPreview(), dealerId, serials)); return null; },
  ),

  listCustomers: ({ dealerId } = {}) => call(
    async () => list(await request(dealerId ? `/customers?dealer_id=${id(dealerId)}` : '/customers')),
    () => loadPreview().customers.filter((c) => !dealerId || c.dealer_id === dealerId),
  ),

  createCustomer: (data) => call(
    () => request('/customers', { method: 'POST', body: JSON.stringify(data) }),
    () => { const r = addCustomer(loadPreview(), data); savePreview(r.store); return r.customer; },
  ),

  updateCustomer: (customerId, data) => call(
    () => request(`/customers/${id(customerId)}`, { method: 'PATCH', body: JSON.stringify(data) }),
    () => { const r = editCustomer(loadPreview(), customerId, data); savePreview(r.store); return r.customer; },
  ),

  deleteCustomer: (customerId) => call(
    () => request(`/customers/${id(customerId)}`, { method: 'DELETE' }),
    () => { savePreview(removeCustomer(loadPreview(), customerId)); return null; },
  ),
};
