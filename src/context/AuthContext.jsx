// src/context/AuthContext.jsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearCognitoSession, forgetRefreshToken, getCognitoSession, loginWithAlias, loginWithCognito, loginWithTeamKey,
  readTokenClaims, TEAM_KEY_STORAGE,
} from '../services/respireeAuth';

// Which sign-in page the user came through, so sign-out and expiry return there.
const LOGIN_PATH_KEY = 'resproxLoginPath';

/** Takes ?team=<key> off the URL once and remembers it on this browser. */
function captureTeamKey() {
  try {
    const url = new URL(window.location.href);
    const key = url.searchParams.get('team');
    if (key) {
      localStorage.setItem(TEAM_KEY_STORAGE, key);
      url.searchParams.delete('team');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    return localStorage.getItem(TEAM_KEY_STORAGE);
  } catch {
    return null;
  }
}

/**
 * `npm run dev` only: the developer's Cognito account from .env.local, so the
 * app signs in by itself instead of showing the form on every restart or
 * expiry. `import.meta.env.DEV` is false in a production build, so this is
 * dropped from the bundle and the variables never ship.
 */
const DEV_CREDENTIALS = import.meta.env.DEV
  && import.meta.env.VITE_DEV_LOGIN_EMAIL && import.meta.env.VITE_DEV_LOGIN_PASSWORD
  ? { email: import.meta.env.VITE_DEV_LOGIN_EMAIL, password: import.meta.env.VITE_DEV_LOGIN_PASSWORD }
  : null;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const initialSession = getCognitoSession();
  const [token, setToken] = useState(initialSession.idToken || null);
  const [username, setUsername] = useState(initialSession.username || localStorage.getItem('adminUsername') || null);
  const skipLogin = import.meta.env.DEV && import.meta.env.VITE_SKIP_LOGIN === 'true';
  const hasStoredToken = Boolean(initialSession.idToken || localStorage.getItem('adminToken'));
  const [isAuthenticated, setIsAuthenticated] = useState(skipLogin || hasStoredToken);
  // Team browsers (opened once via the ?team= link) sign in by themselves and never see the form.
  const [teamKey] = useState(captureTeamKey);
  const canAutoSignIn = import.meta.env.DEV ? Boolean(DEV_CREDENTIALS) : Boolean(teamKey);
  const [teamSigningIn, setTeamSigningIn] = useState(() => canAutoSignIn && !hasStoredToken);

  const applySession = (res, shown) => {
    localStorage.setItem('adminToken', res.idToken);
    localStorage.setItem('adminUsername', res.username);
    localStorage.setItem('adminEmail', res.username || shown);
    setToken(res.idToken);
    setUsername(res.username);
    setIsAuthenticated(true);
  };

  // Silent sign-in: the team key on a deployed build, the .env.local account in dev.
  const teamSignIn = useCallback(async () => {
    const key = localStorage.getItem(TEAM_KEY_STORAGE);
    if (import.meta.env.DEV ? !DEV_CREDENTIALS : !key) return false;
    setTeamSigningIn(true);
    try {
      applySession(DEV_CREDENTIALS
        ? await loginWithCognito(DEV_CREDENTIALS.email, DEV_CREDENTIALS.password)
        : await loginWithTeamKey(key));
      return true;
    } catch (err) {
      if (DEV_CREDENTIALS) console.warn('[auth] Dev auto sign-in failed — check VITE_DEV_LOGIN_EMAIL / VITE_DEV_LOGIN_PASSWORD in .env.local', err);
      else if (err?.status === 401 || err?.status === 404) localStorage.removeItem(TEAM_KEY_STORAGE);
      return false;
    } finally {
      setTeamSigningIn(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Keyed on the token, not isAuthenticated: VITE_SKIP_LOGIN marks the app signed in without one.
    if (canAutoSignIn && !hasStoredToken) teamSignIn();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (user, pass, { remember = true, doctor = false } = {}) => {
    // Team shortcut: a short alias (e.g. admin / 2026) signs in with one shared Cognito
    // account. In `npm run dev` it comes from .env.local; on Vercel a name without "@"
    // goes to /api/alias-login, which keeps the real password server-side.
    if (import.meta.env.DEV) {
      const env = import.meta.env;
      if (env.VITE_DEV_ALIAS_USER && user === env.VITE_DEV_ALIAS_USER && pass === env.VITE_DEV_ALIAS_PASS
        && env.VITE_DEV_LOGIN_EMAIL && env.VITE_DEV_LOGIN_PASSWORD) {
        user = env.VITE_DEV_LOGIN_EMAIL;
        pass = env.VITE_DEV_LOGIN_PASSWORD;
      }
    }
    try {
      const res = !import.meta.env.DEV && !user.includes('@')
        ? await loginWithAlias(user, pass)
        : await loginWithCognito(user, pass);
      if (!remember) forgetRefreshToken();
      localStorage.setItem(LOGIN_PATH_KEY, doctor ? '/doctor/login' : '/login');
      applySession(res, user);
      return true;
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    clearCognitoSession();
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUsername');
    setToken(null);
    setUsername(null);
    setIsAuthenticated(false);
  };

  // Name for the header. Doctors registered with a licence number, so its
  // claim marks a doctor's account.
  const profile = useMemo(() => {
    const claims = token ? readTokenClaims(token) : {};
    return { name: claims.name || '', isDoctor: Boolean(claims['custom:license_no']) };
  }, [token]);

  const loginPath = () => localStorage.getItem(LOGIN_PATH_KEY) || '/login';

  const value = {
    token,
    username,
    profile,
    loginPath,
    isAuthenticated,
    teamSigningIn,
    teamSignIn,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
