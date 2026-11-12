// src/services/partners.js
//
// Dealers and their customers: field rules, and the preview store used in
// `npm run dev` until the backend routes are deployed. Pure functions on plain
// objects, so they are testable without a browser.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s-]{7,15}$/;

const clean = (v) => String(v ?? '').trim();

/** Field errors for a dealer form, `{}` when it is valid. */
export function validateDealer(d = {}) {
  const errors = {};
  if (!clean(d.name)) errors.name = 'Enter the dealer’s name.';
  if (!clean(d.email)) errors.email = 'Enter an email address. The dealer signs in with it.';
  else if (!EMAIL_RE.test(clean(d.email))) errors.email = 'This email address doesn’t look right.';
  if (clean(d.phone) && !PHONE_RE.test(clean(d.phone))) errors.phone = 'Use 7–15 digits, optionally starting with +.';
  return errors;
}

/** Field errors for a customer form, `{}` when it is valid. */
export function validateCustomer(c = {}) {
  const errors = {};
  if (!clean(c.name)) errors.name = 'Enter the customer’s name.';
  if (clean(c.email) && !EMAIL_RE.test(clean(c.email))) errors.email = 'This email address doesn’t look right.';
  if (clean(c.phone) && !PHONE_RE.test(clean(c.phone))) errors.phone = 'Use 7–15 digits, optionally starting with +.';
  if (!clean(c.dealer_id)) errors.dealer_id = 'Choose the dealer this customer belongs to.';
  return errors;
}

export function normalizeDealer(d = {}) {
  return {
    name: clean(d.name),
    company: clean(d.company),
    email: clean(d.email).toLowerCase(),
    phone: clean(d.phone),
    city: clean(d.city),
  };
}

export function normalizeCustomer(c = {}) {
  return {
    dealer_id: clean(c.dealer_id),
    name: clean(c.name),
    phone: clean(c.phone),
    email: clean(c.email).toLowerCase(),
    device_serial: clean(c.device_serial).toUpperCase() || null,
    notes: clean(c.notes),
  };
}

// ── preview store ─────────────────────────────────────────────────────────────
// Same shapes and rules the server will apply, so the pages behave the same
// once the real routes exist. Every function returns a new store.

export const emptyStore = () => ({ dealers: [], customers: [] });

const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function conflict(message) {
  const err = new Error(message);
  err.status = 409;
  return err;
}

function notFound(what) {
  const err = new Error(`${what} not found.`);
  err.status = 404;
  return err;
}

export function addDealer(store, input, now = new Date()) {
  const dealer = normalizeDealer(input);
  if (store.dealers.some((d) => d.email === dealer.email)) throw conflict('A dealer with this email already exists.');
  const created = { id: newId('dlr'), ...dealer, device_serials: [], created_at: now.toISOString() };
  return { store: { ...store, dealers: [...store.dealers, created] }, dealer: created };
}

export function editDealer(store, id, input) {
  const existing = store.dealers.find((d) => d.id === id);
  if (!existing) throw notFound('Dealer');
  const patch = normalizeDealer({ ...existing, ...input });
  if (store.dealers.some((d) => d.id !== id && d.email === patch.email)) throw conflict('A dealer with this email already exists.');
  const dealer = { ...existing, ...patch };
  return { store: { ...store, dealers: store.dealers.map((d) => (d.id === id ? dealer : d)) }, dealer };
}

/** Removing a dealer removes their customers too, as the server will. */
export function removeDealer(store, id) {
  return {
    dealers: store.dealers.filter((d) => d.id !== id),
    customers: store.customers.filter((c) => c.dealer_id !== id),
  };
}

/**
 * Give a dealer exactly these devices. A device belongs to one dealer at a
 * time, and a customer keeps a device only while their dealer has it.
 */
export function assignDevices(store, id, serials) {
  if (!store.dealers.some((d) => d.id === id)) throw notFound('Dealer');
  const wanted = [...new Set(serials.map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
  const taken = store.dealers.find((d) => d.id !== id && d.device_serials.some((s) => wanted.includes(s)));
  if (taken) {
    const serial = taken.device_serials.find((s) => wanted.includes(s));
    throw conflict(`${serial} already belongs to ${taken.name}. Remove it there first.`);
  }
  const dealers = store.dealers.map((d) => (d.id === id ? { ...d, device_serials: wanted } : d));
  const customers = store.customers.map((c) => (
    c.dealer_id === id && c.device_serial && !wanted.includes(c.device_serial) ? { ...c, device_serial: null } : c
  ));
  return { dealers, customers };
}

function checkCustomerDevice(store, customer, selfId = null) {
  if (!customer.device_serial) return;
  const dealer = store.dealers.find((d) => d.id === customer.dealer_id);
  if (!dealer) throw notFound('Dealer');
  if (!dealer.device_serials.includes(customer.device_serial)) {
    throw conflict(`${customer.device_serial} is not one of ${dealer.name}’s devices.`);
  }
  const user = store.customers.find((c) => c.id !== selfId && c.device_serial === customer.device_serial);
  if (user) throw conflict(`${customer.device_serial} is already used by ${user.name}.`);
}

export function addCustomer(store, input, now = new Date()) {
  const customer = normalizeCustomer(input);
  if (!store.dealers.some((d) => d.id === customer.dealer_id)) throw notFound('Dealer');
  checkCustomerDevice(store, customer);
  const created = { id: newId('cus'), ...customer, created_at: now.toISOString() };
  return { store: { ...store, customers: [...store.customers, created] }, customer: created };
}

export function editCustomer(store, id, input) {
  const existing = store.customers.find((c) => c.id === id);
  if (!existing) throw notFound('Customer');
  // A customer stays with their dealer; moving them is not an edit.
  const customer = { ...existing, ...normalizeCustomer({ ...existing, ...input, dealer_id: existing.dealer_id }) };
  checkCustomerDevice(store, customer, id);
  return { store: { ...store, customers: store.customers.map((c) => (c.id === id ? customer : c)) }, customer };
}

export function removeCustomer(store, id) {
  return { ...store, customers: store.customers.filter((c) => c.id !== id) };
}

/** Dealers with their customer count, as GET /dealers returns them. */
export function dealersWithCounts(store) {
  return store.dealers.map((d) => ({
    ...d,
    customer_count: store.customers.filter((c) => c.dealer_id === d.id).length,
  }));
}
