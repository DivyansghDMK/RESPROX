// Central API layer for admin panel — swap BASE_URL to your actual server

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('adminToken');
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
  return res.json();
}

// ─── Patients ────────────────────────────────────────────────────────────────

/**
 * GET /admin/patients?page=1&limit=20&search=&status=
 * Returns: { patients: [...], total: number, page: number, totalPages: number }
 *
 * Expected patient shape:
 * {
 *   id: string,
 *   name: string,
 *   age: number,
 *   gender: 'M' | 'F' | 'Other',
 *   device_id: string,
 *   device_model: string,
 *   last_session: string,        // ISO date
 *   status: 'active' | 'inactive' | 'critical',
 *   ahi: number,                 // events/hr
 *   usage_hours: number,         // last night
 *   compliance_pct: number,      // 0–100
 * }
 */
export const getPatients = ({ page = 1, limit = 20, search = '', status = '' } = {}) =>
  request(`/admin/patients?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&status=${status}`);

/**
 * GET /admin/patients/:id
 * Returns full patient detail:
 * {
 *   id, name, age, gender, device_id, device_model,
 *   therapy_mode: 'CPAP' | 'AUTO CPAP',
 *   pressure: number,
 *   min_pressure: number,
 *   max_pressure: number,
 *   aflex: 0 | 1 | 2 | 3,
 *   ramp: number,
 *   status, last_session,
 *   sessions: [                  // last 7 days
 *     { date: string, ahi: number, usage_hours: number, mask_leak: number, pressure_95: number }
 *   ],
 *   ahi: number,
 *   mask_leak: number,           // L/min
 *   pressure_95: number,         // cmH₂O
 *   compliance_pct: number,
 *   usage_hours: number,
 * }
 */
export const getPatientDetail = (id) => request(`/admin/patients/${id}`);

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

/**
 * GET /admin/stats
 * Returns:
 * {
 *   total_patients: number,
 *   active_tonight: number,
 *   critical_alerts: number,
 *   avg_ahi: number,
 *   avg_compliance: number,
 * }
 */
export const getAdminStats = () => request('/admin/stats');

// ─── Mock fallback (dev only) ─────────────────────────────────────────────────
// Remove this section once your real API is ready.

const LOCAL_STORAGE_KEY = 'DECKLINK_MOCK_PATIENTS';

let MOCK_PATIENTS = [];
try {
  const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (localData) {
    MOCK_PATIENTS = JSON.parse(localData);
  }
} catch (e) {
  console.warn("Failed loading MOCK_PATIENTS from localStorage", e);
}

if (!MOCK_PATIENTS || MOCK_PATIENTS.length === 0) {
  MOCK_PATIENTS = Array.from({ length: 30 }, (_, i) => ({
    id: `P${String(i + 1).padStart(3, '0')}`,
    name: ['Arjun Sharma', 'Priya Mehta', 'Ravi Kumar', 'Sunita Verma', 'Deepak Nair',
           'Kavita Joshi', 'Suresh Patel', 'Anita Singh', 'Manoj Gupta', 'Pooja Rao'][i % 10],
    age: 35 + (i % 30),
    gender: i % 3 === 0 ? 'F' : 'M',
    device_id: `VT30-${1000 + i}`,
    device_model: 'CPAP VT30 D',
    last_session: new Date(Date.now() - i * 86400000 * (i % 3)).toISOString(),
    status: i % 7 === 0 ? 'critical' : i % 4 === 0 ? 'inactive' : 'active',
    ahi: parseFloat((Math.random() * 15).toFixed(1)),
    usage_hours: parseFloat((4 + Math.random() * 4).toFixed(1)),
    compliance_pct: Math.round(60 + Math.random() * 40),
  }));
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(MOCK_PATIENTS));
  } catch (e) {}
}

export const getMockPatients = ({ page = 1, limit = 10, search = '', status = '' } = {}) => {
  let filtered = MOCK_PATIENTS.filter(p =>
    (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.id.includes(search)) &&
    (!status || p.status === status)
  );
  const total = filtered.length;
  const patients = filtered.slice((page - 1) * limit, page * limit);
  return Promise.resolve({ patients, total, page, totalPages: Math.ceil(total / limit) });
};

export const createMockPatient = (patientData) => {
  const newIdNum = MOCK_PATIENTS.reduce((max, p) => {
    const num = parseInt(p.id.substring(1));
    return num > max ? num : max;
  }, 0) + 1;

  const newPatient = {
    id: `P${String(newIdNum).padStart(3, '0')}`,
    status: 'active',
    ahi: 1.5,
    usage_hours: 6.8,
    compliance_pct: 90,
    last_session: new Date().toISOString(),
    ...patientData,
  };

  MOCK_PATIENTS.unshift(newPatient); // Prepend so it is at the top of lists
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(MOCK_PATIENTS));
  } catch (e) {}

  return Promise.resolve(newPatient);
};

export const getMockPatientDetail = (id) => {
  const base = MOCK_PATIENTS.find(p => p.id === id) || MOCK_PATIENTS[0];
  return Promise.resolve({
    ...base,
    therapy_mode: Math.random() > 0.5 ? 'AUTO CPAP' : 'CPAP',
    pressure: 12.0,
    min_pressure: 8.0,
    max_pressure: 18.0,
    aflex: Math.floor(Math.random() * 4),
    ramp: 15,
    mask_leak: parseFloat((5 + Math.random() * 30).toFixed(1)),
    pressure_95: parseFloat((10 + Math.random() * 5).toFixed(1)),
    sessions: Array.from({ length: 7 }, (_, i) => ({
      date: new Date(Date.now() - i * 86400000).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      ahi: parseFloat((Math.random() * 10).toFixed(1)),
      usage_hours: parseFloat((4 + Math.random() * 4).toFixed(1)),
      mask_leak: parseFloat((5 + Math.random() * 25).toFixed(1)),
      pressure_95: parseFloat((10 + Math.random() * 5).toFixed(1)),
    })).reverse(),
  });
};

export const getMockStats = () => Promise.resolve({
  total_patients: MOCK_PATIENTS.length,
  active_tonight: Math.round(MOCK_PATIENTS.length * 0.6),
  critical_alerts: MOCK_PATIENTS.filter(p => p.status === 'critical').length,
  avg_ahi: parseFloat((MOCK_PATIENTS.reduce((sum, p) => sum + p.ahi, 0) / MOCK_PATIENTS.length).toFixed(1)),
  avg_compliance: Math.round(MOCK_PATIENTS.reduce((sum, p) => sum + p.compliance_pct, 0) / MOCK_PATIENTS.length),
});
