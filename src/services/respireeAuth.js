const COGNITO_REGION = import.meta.env.VITE_COGNITO_REGION || 'us-east-1';
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_APP_CLIENT_ID || '4t8fgoocp4b8j8q62japdacnhu';
const COGNITO_USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID || 'us-east-1_GxXK1txac';
const COGNITO_ENDPOINT = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;

const STORAGE_KEYS = {
  idToken: 'respireeIdToken',
  accessToken: 'respireeAccessToken',
  refreshToken: 'respireeRefreshToken',
  username: 'respireeUsername',
  expiresAt: 'respireeExpiresAt',
};

function storeSession(session) {
  if (!session) return;
  localStorage.setItem(STORAGE_KEYS.idToken, session.idToken || '');
  localStorage.setItem(STORAGE_KEYS.accessToken, session.accessToken || '');
  localStorage.setItem(STORAGE_KEYS.refreshToken, session.refreshToken || '');
  localStorage.setItem(STORAGE_KEYS.username, session.username || '');
  if (session.expiresAt) {
    localStorage.setItem(STORAGE_KEYS.expiresAt, String(session.expiresAt));
  } else {
    localStorage.removeItem(STORAGE_KEYS.expiresAt);
  }
}

function clearSession() {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}

function getStoredSession() {
  return {
    idToken: localStorage.getItem(STORAGE_KEYS.idToken) || localStorage.getItem('adminToken') || '',
    accessToken: localStorage.getItem(STORAGE_KEYS.accessToken) || '',
    refreshToken: localStorage.getItem(STORAGE_KEYS.refreshToken) || '',
    username: localStorage.getItem(STORAGE_KEYS.username) || localStorage.getItem('adminUsername') || '',
    expiresAt: Number(localStorage.getItem(STORAGE_KEYS.expiresAt) || 0) || 0,
  };
}

async function callCognito(payload) {
  const res = await fetch(COGNITO_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.__type || 'Cognito authentication failed');
  }
  return json;
}

export async function loginWithCognito(username, password) {
  const json = await callCognito({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: COGNITO_CLIENT_ID,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
    },
  });

  const result = json.AuthenticationResult || {};
  const expiresIn = Number(result.ExpiresIn || 3600);
  const session = {
    idToken: result.IdToken || '',
    accessToken: result.AccessToken || '',
    refreshToken: result.RefreshToken || '',
    username,
    expiresAt: Date.now() + (expiresIn * 1000),
  };

  if (!session.idToken) {
    throw new Error('Cognito login did not return an IdToken.');
  }

  storeSession(session);
  return session;
}

export async function refreshCognitoSession(refreshTokenInput) {
  const refreshToken = refreshTokenInput || getStoredSession().refreshToken;
  if (!refreshToken) {
    throw new Error('Missing refresh token');
  }

  const json = await callCognito({
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: COGNITO_CLIENT_ID,
    AuthParameters: {
      REFRESH_TOKEN: refreshToken,
    },
  });

  const result = json.AuthenticationResult || {};
  const expiresIn = Number(result.ExpiresIn || 3600);
  const current = getStoredSession();
  const session = {
    idToken: result.IdToken || '',
    accessToken: result.AccessToken || current.accessToken || '',
    refreshToken: result.RefreshToken || refreshToken,
    username: current.username,
    expiresAt: Date.now() + (expiresIn * 1000),
  };

  if (!session.idToken) {
    throw new Error('Cognito refresh did not return an IdToken.');
  }

  storeSession(session);
  return session;
}

export function getCognitoSession() {
  return getStoredSession();
}

export function clearCognitoSession() {
  clearSession();
}

export const cognitoConfig = {
  region: COGNITO_REGION,
  clientId: COGNITO_CLIENT_ID,
  userPoolId: COGNITO_USER_POOL_ID,
};
