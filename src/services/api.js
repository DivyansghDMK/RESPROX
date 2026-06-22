// src/services/api.js
// Central API layer for Devices CPAP Dashboard

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

function getHeaders() {
  const token = localStorage.getItem('adminToken');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      ...getHeaders(),
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `API Error ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

export const authAPI = {
  login: async (username, password) => {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },
};

export const devicesAPI = {
  getDevices: async (search = '') => {
    return request(`/admin/devices?search=${encodeURIComponent(search)}`);
  },
  getDeviceDetail: async (serial) => {
    return request(`/admin/devices/${serial}`);
  },
  updateSettings: async (serial, settings) => {
    return request(`/admin/patients/${serial}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
  },
};
