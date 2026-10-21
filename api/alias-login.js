// Vercel serverless function: POST /api/alias-login
//
// Team shortcut: a short alias (e.g. admin / 2026) signs in with one shared
// Cognito account. The real password lives only in this function's server-side
// env vars, so it never reaches the browser bundle. Turn it off by setting
// ALIAS_LOGIN_ENABLED to anything other than "true".
//
// shortcut: anyone who knows the alias can sign in as the shared account, and a
// 4-digit alias is easy to guess; replace with per-user Cognito accounts before
// real patients use this deployment.

import { timingSafeEqual } from 'node:crypto';

const COGNITO_URL = `https://cognito-idp.${process.env.COGNITO_REGION || 'us-east-1'}.amazonaws.com/`;

function sameSecret(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || expected.length < 24) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (process.env.ALIAS_LOGIN_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Alias sign-in is turned off.' });
  }

  const { username, password, teamKey } = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
  // Either the alias, or the team link's key (long and random, so it can't be guessed).
  const aliasOk = Boolean(process.env.ALIAS_USER) && username === process.env.ALIAS_USER && password === process.env.ALIAS_PASS;
  const keyOk = sameSecret(teamKey, process.env.ALIAS_TEAM_KEY);
  if (!aliasOk && !keyOk) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }

  let cognito;
  try {
    const r = await fetch(COGNITO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: process.env.COGNITO_CLIENT_ID || '4t8fgoocp4b8j8q62japdacnhu',
        AuthParameters: {
          USERNAME: process.env.ALIAS_COGNITO_EMAIL,
          PASSWORD: process.env.ALIAS_COGNITO_PASSWORD,
        },
      }),
    });
    cognito = { ok: r.ok, json: await r.json().catch(() => ({})) };
  } catch {
    return res.status(502).json({ error: "Couldn't reach the sign-in service." });
  }

  const result = cognito.json.AuthenticationResult;
  if (!cognito.ok || !result?.IdToken) {
    // The alias was right but the shared account was refused (e.g. its password changed).
    return res.status(502).json({ error: 'The shared account could not sign in. Check its Cognito password in the Vercel settings.' });
  }

  return res.status(200).json({
    idToken: result.IdToken,
    accessToken: result.AccessToken || '',
    refreshToken: result.RefreshToken || '',
    expiresIn: Number(result.ExpiresIn || 3600),
    username: process.env.ALIAS_COGNITO_EMAIL,
  });
}
