import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './alias-login.js';

function call(body, method = 'POST') {
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return handler({ method, body }, res).then(() => res);
}

const env = { ALIAS_LOGIN_ENABLED: 'true', ALIAS_USER: 'admin', ALIAS_PASS: '2026',
  ALIAS_COGNITO_EMAIL: 'shared@example.com', ALIAS_COGNITO_PASSWORD: 'server-only' };

test('wrong alias is refused without contacting Cognito', async () => {
  Object.assign(process.env, env);
  let called = false;
  globalThis.fetch = async () => { called = true; return { ok: true, json: async () => ({}) }; };
  const res = await call({ username: 'admin', password: '0000' });
  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
});

test('turned off means not available', async () => {
  Object.assign(process.env, env, { ALIAS_LOGIN_ENABLED: 'false' });
  assert.equal((await call({ username: 'admin', password: '2026' })).statusCode, 404);
  process.env.ALIAS_LOGIN_ENABLED = 'true';
});

test('right alias returns tokens and never the stored password', async () => {
  Object.assign(process.env, env);
  let sent;
  globalThis.fetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    return { ok: true, json: async () => ({ AuthenticationResult: { IdToken: 'id', AccessToken: 'acc', RefreshToken: 'ref', ExpiresIn: 3600 } }) };
  };
  const res = await call({ username: 'admin', password: '2026' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.idToken, 'id');
  assert.equal(sent.AuthParameters.PASSWORD, 'server-only');
  assert.ok(!JSON.stringify(res.body).includes('server-only'));
});

test('only POST is accepted', async () => {
  assert.equal((await call({}, 'GET')).statusCode, 405);
});

test('the team key signs in; a wrong or short key does not', async () => {
  Object.assign(process.env, env, { ALIAS_TEAM_KEY: 'k'.repeat(32) });
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ AuthenticationResult: { IdToken: 'id' } }) });
  assert.equal((await call({ teamKey: 'k'.repeat(32) })).statusCode, 200);
  assert.equal((await call({ teamKey: 'x'.repeat(32) })).statusCode, 401);
  assert.equal((await call({ teamKey: 'k' })).statusCode, 401);
});
