/**
 * DeckLink × CardioX — Live Backend API Service
 *
 * Connects to the AWS backend shared with the CardioX desktop app.
 * Base URL: https://pmltkfluqk.execute-api.us-east-1.amazonaws.com
 *
 * Auth flow (OTP-based):
 *   1. sendOTP(phone)        → OTP sent via SMS
 *   2. verifyOTP(phone, otp) → returns JWT token + user data
 *   3. All subsequent calls attach JWT via Authorization: Bearer <token>
 */

const BASE_URL =
  import.meta.env.VITE_ECG_API_BASE_URL !== undefined
    ? import.meta.env.VITE_ECG_API_BASE_URL
    : "https://pmltkfluqk.execute-api.us-east-1.amazonaws.com";

const AUTH_PREFIX = import.meta.env.VITE_ECG_AUTH_PREFIX || "/dev/api";
const API_PREFIX  = import.meta.env.VITE_ECG_API_PREFIX  || "/api";

const SESSION_KEY = "decklink_session_v1";

// ─── Token helpers ────────────────────────────────────────────────────────────

export function getToken() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw)?.token || null;
  } catch { return null; }
}

export function saveToken(token) {
  try {
    const existing = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}");
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...existing, token }));
  } catch {}
}

// ─── Core request helper ──────────────────────────────────────────────────────

async function request(method, endpoint, { body, auth = false } = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  let json;
  try { json = await res.json(); } catch { json = { status: "error", message: res.statusText }; }
  if (!res.ok) {
    const msg = json?.message || json?.error || json?.detail || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

// ─── Auth Endpoints ────────────────────────────────────────────────────────────

export async function sendOTP(phone) {
  const mobile_number = normalizePhone(phone);
  return request("POST", `${AUTH_PREFIX}/auth/send-otp`, { body: { mobile_number } });
}

export async function verifyOTP(phone, otp) {
  const mobile_number = normalizePhone(phone);
  const res = await request("POST", `${AUTH_PREFIX}/auth/verify-otp`, {
    body: { mobile_number, otp: String(otp).trim() },
  });
  const token =
    res.token || res.jwt || res.access_token || res.id_token ||
    res.data?.token || res.data?.jwt || res.data?.access_token;
  if (!token) throw new Error("OTP verified but no JWT returned from server.");
  saveToken(token);
  return { ...res, token };
}

export async function checkMobile(phone) {
  const mobile_number = normalizePhone(phone);
  return request("GET", `${API_PREFIX}/user/check-mobile?mobile_number=${mobile_number}`);
}

// ─── User Endpoints ────────────────────────────────────────────────────────────

export async function getUserDetails() {
  return request("GET", `${API_PREFIX}/user/details`, { auth: true });
}

export async function saveUserDetails(payload) {
  return request("POST", `${API_PREFIX}/user/details`, { auth: true, body: payload });
}

// ─── Report Endpoints ─────────────────────────────────────────────────────────

// FastAPI server base URL (server-side S3 scanner)
const FASTAPI_BASE = import.meta.env.VITE_API_BASE_URL?.replace("/api", "") || "http://localhost:8000";

/**
 * Fetch ECG reports for an org's registered devices directly from S3.
 * Calls the FastAPI /api/reports/s3 endpoint which scans
 *   reports/{YYYY}/{MM}/{DD}/{serial}/
 * and returns presigned URLs for PDFs and JSONs.
 *
 * @param {string[]} serials  - Array of RhythmUltra device serials
 * @param {number}   days     - How many days back to scan (default 30)
 */
export async function fetchOrgReports(serials = [], days = 30) {
  if (!serials.length) return [];
  const params = new URLSearchParams({
    serials: serials.join(","),
    days: String(days),
    presign_expiry: "900",
  });
  const res = await fetch(`${FASTAPI_BASE}/api/reports/s3?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.reports || [];
}

/** Legacy: fetch from the reviewed-reports API Gateway (returns reviewed ECG reports) */
export async function getReports(serial = "") {
  let url = import.meta.env.VITE_REVIEWED_REPORTS_API_URL ||
    "https://6jhix49qt6.execute-api.us-east-1.amazonaws.com/api/public/reviewed-reports";
  if (serial) {
    url += `?RhythmUltra_serial=${encodeURIComponent(serial)}`;
  }
  const apiKey = import.meta.env.VITE_REVIEWED_REPORTS_API_KEY || "9q7RZrcSkc7UMYwXLAJXo33N4AvulrfF5r23KrIL";

  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch reviewed reports.`);
  return res.json();
}

/**
 * Role-based access rules for the HCP portal.
 *
 * Access Matrix:
 * ┌──────────────┬─────────────┬──────────┬──────────┬───────────┬─────────────┬────────────┐
 * │ Role         │ Org Type    │ ViewList │ ViewPDF  │ ViewJSON  │ CanApprove  │ IsAdmin    │
 * ├──────────────┼─────────────┼──────────┼──────────┼───────────┼─────────────┼────────────┤
 * │ HCP Head     │ HCP         │ ✅       │ ✅       │ ✅        │ ❌          │ ✅         │
 * │ Sub dealer   │ HCP         │ ✅       │ ✅       │ ✅        │ ❌          │ ✅         │
 * │ Employee     │ HCP         │ ✅       │ ✅       │ ❌        │ ❌          │ ❌         │
 * │ Jr Doc       │ HCP         │ ✅       │ ✅       │ ❌        │ ❌          │ ❌         │
 * │ Receptionist │ HCP         │ ✅       │ ❌       │ ❌        │ ❌          │ ❌         │
 * │ Head doctor  │ Doctors     │ ✅       │ ✅       │ ✅        │ ✅          │ ✅         │
 * │ Jr Doc       │ Doctors     │ ✅       │ ✅       │ ❌        │ ✅          │ ❌         │
 * │ Employee     │ Doctors     │ ✅       │ ✅       │ ❌        │ ❌          │ ❌         │
 * └──────────────┴─────────────┴──────────┴──────────┴───────────┴─────────────┴────────────┘
 *
 * Note: canApprove is enforced by isDoctorOrg check in ReportsSection — this
 * function provides per-role flags, but isDoctorOrg controls the approve button context.
 *
 * Returns { canViewList, canViewPDF, canViewJSON, canApprove, isAdmin, isHead, isDoctorRole }
 */
export function rolePermissions(role) {
  switch (role) {
    // ── HCP Org: Full Admin Heads ──────────────────────────────────────────────
    case "HCP Head":
      return {
        canViewList: true, canViewPDF: true, canViewJSON: true,
        canApprove: false, isAdmin: true, isHead: true, isDoctorRole: false
      };

    case "Sub dealer":
      return {
        canViewList: true, canViewPDF: true, canViewJSON: true,
        canApprove: false, isAdmin: true, isHead: false, isDoctorRole: false
      };

    // ── HCP Org: Clinical Staff (can view list + PDF, no JSON, no approve) ────
    case "Employee":
      return {
        canViewList: true, canViewPDF: true, canViewJSON: false,
        canApprove: false, isAdmin: false, isHead: false, isDoctorRole: false
      };

    case "Jr Doc":
      return {
        canViewList: true, canViewPDF: true, canViewJSON: false,
        canApprove: false, isAdmin: false, isHead: false, isDoctorRole: false
      };

    // ── HCP Org: Receptionist (view only, no PDF download, no JSON) ───────────
    case "Receptionist":
      return {
        canViewList: true, canViewPDF: false, canViewJSON: false,
        canApprove: false, isAdmin: false, isHead: false, isDoctorRole: false
      };

    // ── Doctor Org: Head Doctor (full access + can approve) ───────────────────
    case "Head doctor":
      return {
        canViewList: true, canViewPDF: true, canViewJSON: true,
        canApprove: true, isAdmin: true, isHead: true, isDoctorRole: true
      };

    // ── Legacy role aliases ────────────────────────────────────────────────────
    case "Sr. Clinical Doctor":
    case "Jr. Clinical Doctor":
      return {
        canViewList: true, canViewPDF: true, canViewJSON: false,
        canApprove: false, isAdmin: false, isHead: false, isDoctorRole: false
      };
    case "Sr. Admin":
    case "Jr. Admin":
      return {
        canViewList: true, canViewPDF: true, canViewJSON: true,
        canApprove: false, isAdmin: true, isHead: false, isDoctorRole: false
      };

    // ── No access by default ──────────────────────────────────────────────────
    default:
      return {
        canViewList: false, canViewPDF: false, canViewJSON: false,
        canApprove: false, isAdmin: false, isHead: false, isDoctorRole: false
      };
  }
}

export function filterReportsByRole(reports, session) {
  if (!Array.isArray(reports)) return [];
  const perms = rolePermissions(session?.role);
  if (!perms.canViewList) return [];
  return reports;
}

export function canViewPDF(role) {
  return rolePermissions(role).canViewPDF;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits;
}
