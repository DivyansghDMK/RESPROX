import { test } from 'node:test';
import assert from 'node:assert/strict';
import { permissionsFor, roleFromClaims } from './access.js';
import {
  addCustomer, addDealer, assignDevices, dealersWithCounts, editCustomer, emptyStore,
  removeDealer, validateCustomer, validateDealer,
} from './partners.js';

// ── roles ─────────────────────────────────────────────────────────────────────

test('role comes from the Cognito groups; no group is the original admin', () => {
  assert.equal(roleFromClaims({}), 'admin');
  assert.equal(roleFromClaims({ 'cognito:groups': ['dealer'] }), 'dealer');
  assert.equal(roleFromClaims({ 'cognito:groups': 'doctor' }), 'doctor');
  assert.equal(roleFromClaims({ 'custom:license_no': 'MH-1234' }), 'doctor');
  assert.equal(roleFromClaims({ 'cognito:groups': ['dealer', 'admin'] }), 'admin');
});

test('a dealer may change comfort settings only, on their own devices', () => {
  const dealer = permissionsFor('dealer', ['CVT3000001']);
  assert.equal(dealer.canEditGroup('COMFORT'), true);
  for (const group of ['CPAP', 'AUTO', 'OPTIONS', 'CONFIG']) assert.equal(dealer.canEditGroup(group), false);
  assert.equal(dealer.editTherapySettings, false);
  assert.equal(dealer.controlTherapy, false);
  assert.equal(dealer.manageDealers, false);
  assert.equal(dealer.manageCustomers, true);
  assert.equal(dealer.canSeeDevice('cvt3000001'), true);
  assert.equal(dealer.canSeeDevice('CVT3000002'), false);
});

test('admin may do everything; a doctor may not start or stop therapy', () => {
  const admin = permissionsFor('admin');
  assert.equal(admin.canEditGroup('OPTIONS'), true);
  assert.equal(admin.controlTherapy, true);
  assert.equal(admin.canSeeDevice('ANY'), true);
  const doctor = permissionsFor('doctor');
  assert.equal(doctor.controlTherapy, false);
  assert.equal(doctor.editTherapySettings, true);
  assert.equal(doctor.manageCustomers, false);
});

// ── forms ─────────────────────────────────────────────────────────────────────

test('dealer and customer forms explain what is wrong', () => {
  assert.deepEqual(validateDealer({ name: 'Asha', email: 'asha@example.com' }), {});
  const bad = validateDealer({ name: ' ', email: 'not-an-email', phone: '12' });
  assert.ok(bad.name && bad.email && bad.phone);
  assert.deepEqual(validateCustomer({ name: 'Ravi', dealer_id: 'dlr_1' }), {});
  assert.ok(validateCustomer({ name: 'Ravi' }).dealer_id);
});

// ── store rules ───────────────────────────────────────────────────────────────

function setup() {
  let store = emptyStore();
  const a = addDealer(store, { name: 'Asha Medical', email: 'Asha@Example.com' });
  store = a.store;
  const b = addDealer(store, { name: 'Bharat Care', email: 'bharat@example.com' });
  store = assignDevices(b.store, a.dealer.id, ['cvt3000001', 'CVT3000002']);
  return { store, a: a.dealer, b: b.dealer };
}

test('dealer emails are unique, ignoring case', () => {
  const { store } = setup();
  assert.throws(() => addDealer(store, { name: 'Copy', email: 'asha@example.com' }), { status: 409 });
});

test('a device belongs to one dealer at a time', () => {
  const { store, b } = setup();
  assert.throws(() => assignDevices(store, b.id, ['CVT3000001']), /already belongs to Asha Medical/);
});

test('a customer can only use a free device of their own dealer', () => {
  const { store, a, b } = setup();
  const first = addCustomer(store, { dealer_id: a.id, name: 'Ravi', device_serial: 'cvt3000001' });
  assert.equal(first.customer.device_serial, 'CVT3000001');
  assert.throws(() => addCustomer(first.store, { dealer_id: a.id, name: 'Meena', device_serial: 'CVT3000001' }), /already used by Ravi/);
  assert.throws(() => addCustomer(first.store, { dealer_id: b.id, name: 'Kiran', device_serial: 'CVT3000002' }), /not one of Bharat Care/);
  // Editing keeps the customer with their dealer even if the form says otherwise.
  const moved = editCustomer(first.store, first.customer.id, { dealer_id: b.id, name: 'Ravi K' });
  assert.equal(moved.customer.dealer_id, a.id);
  assert.equal(moved.customer.name, 'Ravi K');
});

test('taking a device from a dealer frees it from their customer', () => {
  const { store, a } = setup();
  const { store: withCustomer } = addCustomer(store, { dealer_id: a.id, name: 'Ravi', device_serial: 'CVT3000001' });
  const after = assignDevices(withCustomer, a.id, ['CVT3000002']);
  assert.equal(after.customers[0].device_serial, null);
});

test('removing a dealer removes their customers and counts stay right', () => {
  const { store, a, b } = setup();
  const { store: s1 } = addCustomer(store, { dealer_id: a.id, name: 'Ravi' });
  const { store: s2 } = addCustomer(s1, { dealer_id: b.id, name: 'Kiran' });
  assert.deepEqual(dealersWithCounts(s2).map((d) => d.customer_count), [1, 1]);
  const after = removeDealer(s2, a.id);
  assert.deepEqual(after.customers.map((c) => c.name), ['Kiran']);
});
