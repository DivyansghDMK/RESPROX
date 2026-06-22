// src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('adminToken') || null);
  const [username, setUsername] = useState(localStorage.getItem('adminUsername') || null);
  const [isAuthenticated, setIsAuthenticated] = useState(!!token);

  const login = async (user, pass) => {
    const res = await authAPI.login(user, pass);
    if (res.token) {
      localStorage.setItem('adminToken', res.token);
      localStorage.setItem('adminUsername', res.username);
      setToken(res.token);
      setUsername(res.username);
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
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
