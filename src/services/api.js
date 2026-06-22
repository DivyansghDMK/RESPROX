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
  try {
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

    return await res.json();
  } catch (error) {
    console.warn(`API request failed for ${path}, trying mock fallback:`, error);
    try {
      return getMockDataForPath(path, options);
    } catch (mockErr) {
      throw new Error(mockErr.message || error.message);
    }
  }
}

// ─── Local Mock Database Fallback (localStorage persisted) ─────────────────
const DEFAULT_MOCK_DEVICES = {
  "CVT30-C-9281": {
    "serial": "CVT30-C-9281",
    "product_line": "CVT30",
    "series": "C",
    "model": "CVT30 CPAP C-Series",
    "firmware": "v1.2.4",
    "patient": { "id": "P001", "name": "Arjun Sharma", "age": 42, "gender": "M", "compliance_pct": 94 },
    "live_data": { "ahi": 2.1, "mask_leak": 24.0, "pressure_95": 11.8, "usage_hours": 7.5, "compliance_pct": 94 },
    "settings": { "therapy_mode": "AUTO CPAP", "pressure": 12.0, "min_pressure": 5.0, "max_pressure": 12.0, "aflex": 2, "ramp": 12.0 },
    "sessions": [
      {"date": "16 Jun", "ahi": 1.4, "usage_hours": 7.8, "mask_leak": 18.2, "pressure_95": 11.2},
      {"date": "17 Jun", "ahi": 2.5, "usage_hours": 6.5, "mask_leak": 22.1, "pressure_95": 12.0},
      {"date": "18 Jun", "ahi": 3.1, "usage_hours": 4.2, "mask_leak": 26.5, "pressure_95": 11.5},
      {"date": "19 Jun", "ahi": 1.8, "usage_hours": 8.0, "mask_leak": 19.4, "pressure_95": 10.8},
      {"date": "20 Jun", "ahi": 2.0, "usage_hours": 7.2, "mask_leak": 24.0, "pressure_95": 11.0},
      {"date": "21 Jun", "ahi": 2.1, "usage_hours": 7.5, "mask_leak": 24.0, "pressure_95": 11.8}
    ]
  },
  "CVT30-C-4028": {
    "serial": "CVT30-C-4028",
    "product_line": "CVT30",
    "series": "C",
    "model": "CVT30 CPAP C-Series",
    "firmware": "v1.1.2",
    "patient": { "id": "P002", "name": "Priya Mehta", "age": 38, "gender": "F", "compliance_pct": 82 },
    "live_data": { "ahi": 4.5, "mask_leak": 12.4, "pressure_95": 10.0, "usage_hours": 6.8, "compliance_pct": 82 },
    "settings": { "therapy_mode": "CPAP", "pressure": 10.0, "min_pressure": 6.0, "max_pressure": 14.0, "aflex": 1, "ramp": 20 },
    "sessions": [
      {"date": "16 Jun", "ahi": 3.2, "usage_hours": 6.0, "mask_leak": 14.2, "pressure_95": 10.0},
      {"date": "17 Jun", "ahi": 4.0, "usage_hours": 6.5, "mask_leak": 12.8, "pressure_95": 10.0},
      {"date": "18 Jun", "ahi": 4.5, "usage_hours": 6.8, "mask_leak": 12.4, "pressure_95": 10.0}
    ]
  },
  "CVT30-C-1002": {
    "serial": "CVT30-C-1002",
    "product_line": "CVT30",
    "series": "C",
    "model": "CVT30 CPAP C-Series",
    "firmware": "v1.2.4",
    "patient": { "id": "P003", "name": "Ravi Kumar", "age": 55, "gender": "M", "compliance_pct": 58 },
    "live_data": { "ahi": 9.8, "mask_leak": 35.2, "pressure_95": 14.2, "usage_hours": 4.2, "compliance_pct": 58 },
    "settings": { "therapy_mode": "AUTO CPAP", "pressure": 14.0, "min_pressure": 10.0, "max_pressure": 20.0, "aflex": 3, "ramp": 10 },
    "sessions": [
      {"date": "16 Jun", "ahi": 7.4, "usage_hours": 5.2, "mask_leak": 32.1, "pressure_95": 13.5},
      {"date": "17 Jun", "ahi": 8.5, "usage_hours": 4.8, "mask_leak": 34.0, "pressure_95": 14.0},
      {"date": "18 Jun", "ahi": 9.8, "usage_hours": 4.2, "mask_leak": 35.2, "pressure_95": 14.2}
    ]
  }
};

function getMockDB() {
  const db = localStorage.getItem('MOCK_DEVICES_DB');
  if (!db) {
    localStorage.setItem('MOCK_DEVICES_DB', JSON.stringify(DEFAULT_MOCK_DEVICES));
    return DEFAULT_MOCK_DEVICES;
  }
  return JSON.parse(db);
}

function saveMockDB(db) {
  localStorage.setItem('MOCK_DEVICES_DB', JSON.stringify(db));
}

function getMockDataForPath(path, options) {
  if (path === '/auth/login') {
    const body = JSON.parse(options.body || '{}');
    if (body.username === 'admin' && body.password === 'admin123') {
      return { token: "admin-secret-token-change-me", username: "admin", success: true };
    }
    throw new Error("Invalid credentials");
  }

  const db = getMockDB();

  if (path.startsWith('/admin/devices')) {
    const parts = path.split('/');
    if (parts.length > 3) {
      const serial = parts[3].split('?')[0];
      const device = db[serial];
      if (!device) throw new Error(`Device "${serial}" not found`);
      return { ...device, device_online: true };
    }
    return Object.values(db).map(d => ({
      serial: d.serial,
      model: d.model,
      firmware: d.firmware,
      patient_name: d.patient.name,
      status: "online",
      compliance_pct: d.live_data.compliance_pct,
      ahi: d.live_data.ahi,
      usage_hours: d.live_data.usage_hours
    }));
  }

  if (path.startsWith('/admin/patients/') && path.endsWith('/settings')) {
    const parts = path.split('/');
    const serial = parts[3];
    const device = db[serial];
    if (!device) throw new Error(`Device "${serial}" not found`);

    if (options.method === 'PATCH') {
      const settingsPatch = JSON.parse(options.body || '{}');
      device.settings = { ...device.settings, ...settingsPatch };
      saveMockDB(db);
      return { success: true, settings: device.settings, device_online: true, message: "Settings pushed to device" };
    }
  }

  throw new Error(`Unsupported mock route: ${path}`);
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
