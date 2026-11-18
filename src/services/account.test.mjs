import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMe } from './account.js';
import { permissionsFor } from './access.js';

test('new /me: role, organisation, organisation roles and IP', () => {
  const a = parseMe({
    role: 'dealer',
    org: { id: 'org_asha', name: 'Asha Medical', type: 'dealer', path: 'deckmount.asha' },
    org_roles: ['clinical', 'Administrator', 'owner'],
    ip: '49.36.10.2',
  }, 'admin');
  assert.equal(a.role, 'dealer');
  assert.equal(a.roleFromServer, true);
  assert.deepEqual(a.org, { id: 'org_asha', name: 'Asha Medical', type: 'dealer', path: 'deckmount.asha' });
  assert.deepEqual(a.orgRoles, ['clinical', 'administrator']);
  assert.deepEqual(a.dealer, { id: 'org_asha', name: 'Asha Medical', device_serials: null });
  assert.equal(a.ip, '49.36.10.2');
});

test('the server role wins over the token; an unknown one falls back to it', () => {
  assert.equal(parseMe({ role: 'doctor' }, 'admin').role, 'doctor');
  assert.equal(parseMe({ role: 'superuser' }, 'dealer').role, 'dealer');
  assert.equal(parseMe({ ip: '1.2.3.4' }, 'admin').role, 'admin');
  assert.equal(parseMe(null, 'admin').roleFromServer, false);
});

test('old /me with a dealer record still works', () => {
  const a = parseMe({ role: 'dealer', dealer: { id: 7, name: 'Asha', device_serials: ['cvt3000001'] } }, 'dealer');
  assert.deepEqual(a.dealer, { id: '7', name: 'Asha', device_serials: ['CVT3000001'] });
  assert.equal(a.org.name, 'Asha');
});

test('a dealer whose server sends no device list sees what /devices returns', () => {
  const p = permissionsFor('dealer', null);
  assert.equal(p.canSeeDevice('CVT3000999'), true);
  assert.equal(p.allowedSerials, null);
  assert.equal(p.controlTherapy, false);
  assert.equal(permissionsFor('dealer', []).canSeeDevice('CVT3000999'), false);
});
