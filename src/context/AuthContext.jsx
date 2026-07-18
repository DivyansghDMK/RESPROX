// src/context/AuthContext.jsx
import React, { createContext, useContext, useState } from 'react';
import { clearCognitoSession, getCognitoSession, loginWithCognito } from '../services/respireeAuth';

const AuthContext = createContext(null);

const DEMO_USERNAME = import.meta.env.VITE_MOCK_USERNAME || 'admin';
const DEMO_PASSWORD = import.meta.env.VITE_MOCK_PASSWORD || 'admin123';
const DEMO_TOKEN = import.meta.env.VITE_MOCK_TOKEN || 'admin-secret-token-change-me';
const DEV_ALIAS_USERNAME = import.meta.env.VITE_DEV_ALIAS_USERNAME || 'admin';
const DEV_ALIAS_PASSWORD = import.meta.env.VITE_DEV_ALIAS_PASSWORD || '2026';
const DEV_ALIAS_EMAIL = import.meta.env.VITE_DEV_ALIAS_EMAIL || 'kanishka.sharma@deckmount.in';
const DEV_ALIAS_EMAIL_PASSWORD = import.meta.env.VITE_DEV_ALIAS_EMAIL_PASSWORD || 'KanishkaDeck@20';

export function AuthProvider({ children }) {
  const initialSession = getCognitoSession();
  const [token, setToken] = useState(initialSession.idToken || null);
  const [username, setUsername] = useState(initialSession.username || localStorage.getItem('adminUsername') || null);
  const [isAuthenticated, setIsAuthenticated] = useState(!!(initialSession.idToken || localStorage.getItem('adminToken')));

  const login = async (user, pass) => {
    try {
      const authUser = user === DEV_ALIAS_USERNAME && pass === DEV_ALIAS_PASSWORD
        ? DEV_ALIAS_EMAIL
        : user;
      const authPass = user === DEV_ALIAS_USERNAME && pass === DEV_ALIAS_PASSWORD
        ? DEV_ALIAS_EMAIL_PASSWORD
        : pass;

      const res = await loginWithCognito(authUser, authPass);
      localStorage.setItem('adminToken', res.idToken);
      localStorage.setItem('adminUsername', user === DEV_ALIAS_USERNAME && pass === DEV_ALIAS_PASSWORD ? DEV_ALIAS_USERNAME : res.username);
      localStorage.setItem('adminEmail', authUser);
      setToken(res.idToken);
      setUsername(user === DEV_ALIAS_USERNAME && pass === DEV_ALIAS_PASSWORD ? DEV_ALIAS_USERNAME : res.username);
      setIsAuthenticated(true);
      return true;
    } catch (error) {
      const isDemoLogin = user === DEMO_USERNAME && pass === DEMO_PASSWORD;
      if (!isDemoLogin) {
        throw error;
      }
    }

    if (user === DEMO_USERNAME && pass === DEMO_PASSWORD) {
      localStorage.setItem('adminToken', DEMO_TOKEN);
      localStorage.setItem('adminUsername', DEMO_USERNAME);
      setToken(DEMO_TOKEN);
      setUsername(DEMO_USERNAME);
      setIsAuthenticated(true);
      return true;
    }

    return false;
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
