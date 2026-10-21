// src/context/AuthContext.jsx
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  clearCognitoSession, getCognitoSession, loginWithAlias, loginWithCognito, loginWithTeamKey, TEAM_KEY_STORAGE,
} from '../services/respireeAuth';

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

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const initialSession = getCognitoSession();
  const [token, setToken] = useState(initialSession.idToken || null);
  const [username, setUsername] = useState(initialSession.username || localStorage.getItem('adminUsername') || null);
  const skipLogin = import.meta.env.DEV && import.meta.env.VITE_SKIP_LOGIN === 'true';
  const [isAuthenticated, setIsAuthenticated] = useState(skipLogin || !!(initialSession.idToken || localStorage.getItem('adminToken')));
  // Team browsers (opened once via the ?team= link) sign in by themselves and never see the form.
  const [teamKey] = useState(captureTeamKey);
  const [teamSigningIn, setTeamSigningIn] = useState(() => Boolean(teamKey) && !isAuthenticated && !import.meta.env.DEV);

  const applySession = (res, shown) => {
    localStorage.setItem('adminToken', res.idToken);
    localStorage.setItem('adminUsername', res.username);
    localStorage.setItem('adminEmail', res.username || shown);
    setToken(res.idToken);
    setUsername(res.username);
    setIsAuthenticated(true);
  };

  const teamSignIn = useCallback(async () => {
    const key = localStorage.getItem(TEAM_KEY_STORAGE);
    if (!key || import.meta.env.DEV) return false;
    setTeamSigningIn(true);
    try {
      applySession(await loginWithTeamKey(key));
      return true;
    } catch (err) {
      if (err?.status === 401 || err?.status === 404) localStorage.removeItem(TEAM_KEY_STORAGE);
      return false;
    } finally {
      setTeamSigningIn(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (teamKey && !isAuthenticated) teamSignIn();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (user, pass) => {
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

  const value = {
    token,
    username,
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
