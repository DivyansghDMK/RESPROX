// src/context/AuthContext.jsx
import React, { createContext, useContext, useState } from 'react';
import { clearCognitoSession, getCognitoSession, loginWithCognito } from '../services/respireeAuth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const initialSession = getCognitoSession();
  const [token, setToken] = useState(initialSession.idToken || null);
  const [username, setUsername] = useState(initialSession.username || localStorage.getItem('adminUsername') || null);
  const skipLogin = import.meta.env.DEV && import.meta.env.VITE_SKIP_LOGIN === 'true';
  const [isAuthenticated, setIsAuthenticated] = useState(skipLogin || !!(initialSession.idToken || localStorage.getItem('adminToken')));

  const login = async (user, pass) => {
    // Local-development shortcut: a short alias (e.g. admin / 2026) signs in with the
    // real Cognito account named in .env.local. Only in `npm run dev`; a production
    // build drops this branch, so the credentials never reach a deployed bundle.
    if (import.meta.env.DEV) {
      const env = import.meta.env;
      if (env.VITE_DEV_ALIAS_USER && user === env.VITE_DEV_ALIAS_USER && pass === env.VITE_DEV_ALIAS_PASS
        && env.VITE_DEV_LOGIN_EMAIL && env.VITE_DEV_LOGIN_PASSWORD) {
        user = env.VITE_DEV_LOGIN_EMAIL;
        pass = env.VITE_DEV_LOGIN_PASSWORD;
      }
    }
    try {
      const res = await loginWithCognito(user, pass);
      localStorage.setItem('adminToken', res.idToken);
      localStorage.setItem('adminUsername', res.username);
      localStorage.setItem('adminEmail', user);
      setToken(res.idToken);
      setUsername(res.username);
      setIsAuthenticated(true);
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
