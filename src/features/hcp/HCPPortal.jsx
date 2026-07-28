import React, { useState, useEffect } from "react";
import {
  Activity, Users, Building2, Stethoscope, Shield, FileText,
  ChevronDown, LogOut, Search, Plus, X, Edit2, Trash2, Eye,
  Wifi, WifiOff, AlertTriangle, UserPlus, MapPin, ClipboardList,
  Settings, ArrowLeft, Menu, HeartPulse
} from "lucide-react";
import ReportsSection from "./ReportsSection.jsx";
import { sendOTP, verifyOTP } from "../../services/hcpApi.js";

/* ---------------------------------------------------------
   DeckLink — Clinician Portal
   Palette: deep navy base + steel-blue accent gradient
   Glassmorphic panels, responsive mobile nav
--------------------------------------------------------- */

const COLORS = {
  bg: "#0B1220",
  panel: "rgba(20, 29, 44, 0.72)",
  panelSolid: "#141D2C",
  panel2: "#101724",
  glass: "rgba(11, 18, 32, 0.82)",
  border: "#263042",
  borderGlass: "rgba(255,255,255,0.08)",
  orange1: "#2E7DB8",   // primary accent — steel blue
  orange2: "#3E97D6",
  text: "#E6EAF0",
  sub: "#7C8AA0",
  danger: "#D9534F",
  ok: "#3FA772",
  warn: "#C99A3C",
};

const uid = () => Math.random().toString(36).slice(2, 10);

const HCP_ROLES = [
  "HCP Head",
  "Sub dealer",
  "Employee",
  "Jr Doc",
  "Receptionist",
];

const DOCTOR_ROLES = [
  "Head doctor",
  "Jr Doc",
  "Employee",
];

const LS_KEY = "decklink_data_v3";
const SS_KEY = "decklink_session_v1";

const seedData = () => ({
  orgs: [
    { id: "org1", name: "Faridabad Sleep & Respiratory Clinic", type: "Healthcare Professional" },
    { id: "org2", name: "Metro Cardiology Group", type: "Doctors" },
  ],
  users: {
    org1: [
      { id: "u_rahul", name: "Rahul Mehta", role: "HCP Head", email: "kanishka.sharma@deckmount.in", phone: "9810000002", providerId: "", password: "123" },
      { id: "u_aditi", name: "Dr. Aditi Sharma", role: "Jr Doc", email: "aditi.sharma@fsrc.in", phone: "9810000001", providerId: "PRV-1001", password: "123" },
      { id: "u_priya", name: "Priya Nair", role: "Receptionist", email: "priya.nair@fsrc.in", phone: "9810000003", providerId: "", password: "123" },
    ],
    org2: [
      { id: "u_karan", name: "Dr. Karan Bose", role: "Head doctor", email: "karan.bose@metrocardio.in", phone: "9911112222", providerId: "PRV-2001", password: "123" },
      { id: "u_sunita", name: "Dr. Sunita Rao", role: "Jr Doc", email: "sunita.rao@metrocardio.in", phone: "9911113333", providerId: "PRV-2002", password: "123" },
    ],
  },
  physicians: {
    org1: [
      { id: "u_karan", name: "Dr. Karan Bose", speciality: "Pulmonology", hospital: "Apollo Gurgaon", phone: "9911112222", access: "Read-only" },
      { id: "u_sunita", name: "Dr. Sunita Rao", speciality: "Sleep Medicine", hospital: "Fortis Faridabad", phone: "9911113333", access: "Read-only" },
    ],
    org2: [],
  },
  insurers: {
    org1: [
      { id: "ins1", name: "Star Health", policyPortal: "portal.starhealth.in", contact: "billing@starhealth.in" },
    ],
    org2: [],
  },
  locations: {
    org1: [
      { id: "loc1", name: "Main Clinic", address: "Sector 15, Faridabad, HR" },
    ],
    org2: [],
  },
  patients: {
    org1: [
      { id: "pat1", name: "Vikram Chauhan", age: 54, therapy: "CPAP", connectivity: "Wireless", ahi: 3.2, usageHrs: 6.5, status: "Compliant", alert: null, doctorId: "u_karan", serial: "0010" },
      { id: "pat2", name: "Meena Kulkarni", age: 61, therapy: "BiPAP", connectivity: "Wireless", ahi: 8.9, usageHrs: 3.1, status: "Attention", alert: "Low usage 3 nights", doctorId: "u_sunita", serial: "0000" },
      { id: "pat3", name: "Ashok Verma", age: 47, therapy: "CPAP", connectivity: "SD Card", ahi: 1.8, usageHrs: 7.2, status: "Compliant", alert: null, doctorId: null, serial: "A010" },
      { id: "pat4", name: "Ritu Malhotra", age: 39, therapy: "BiPAP-Ventilation", connectivity: "Wireless", ahi: 12.4, usageHrs: 2.0, status: "Critical", alert: "High residual AHI + low adherence", doctorId: "u_karan", serial: "A057" },
      { id: "pat5", name: "Suresh Iyer", age: 66, therapy: "CPAP", connectivity: "Wireless", ahi: 2.1, usageHrs: 6.9, status: "Compliant", alert: null, doctorId: null, serial: "" },
    ],
    org2: [],
  },
  referrals: {
    org1: [
      { id: "ref1", patient: "Neha Kapoor", referredBy: "Dr. Karan Bose", reason: "Suspected OSA", date: "2026-06-28", status: "Pending" },
    ],
    org2: [],
  },
  devices: {
    org1: [
      { id: "dev1", serial: "0000", model: "RhythmUltra V1" },
      { id: "dev2", serial: "0010", model: "RhythmUltra V1" },
      { id: "dev3", serial: "A010", model: "RhythmUltra V1" },
      { id: "dev4", serial: "A057", model: "RhythmUltra V1" },
    ],
    org2: [],
  },
  approvedReports: {},
});

function loadData() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  const seeded = seedData();
  localStorage.setItem(LS_KEY, JSON.stringify(seeded));
  return seeded;
}
function saveData(d) {
  localStorage.setItem(LS_KEY, JSON.stringify(d));
}

async function triggerEmailNotification(toEmail, subject, htmlBody) {
  if (!toEmail) return;
  try {
    const res = await fetch("http://localhost:8000/api/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to_email: toEmail,
        subject: subject,
        html_body: htmlBody
      })
    });
    if (!res.ok) {
      console.warn("Failed to send notification email via FastAPI endpoint.");
    }
  } catch (err) {
    console.error("Error triggering email notification:", err);
  }
}
function loadSession() {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}
function saveSession(s) {
  sessionStorage.setItem(SS_KEY, JSON.stringify(s));
}
function clearSession() {
  sessionStorage.removeItem(SS_KEY);
}

/* ---------------- Shared UI bits ---------------- */

function Btn({ children, onClick, variant = "primary", style, type = "button", disabled }) {
  const base = {
    padding: "10px 18px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    border: "1px solid transparent",
    transition: "all .15s",
    opacity: disabled ? 0.5 : 1,
  };
  const variants = {
    primary: {
      background: `linear-gradient(135deg, ${COLORS.orange1}, ${COLORS.orange2})`,
      color: "#FFFFFF",
    },
    ghost: {
      background: "transparent",
      color: COLORS.text,
      border: `1px solid ${COLORS.border}`,
    },
    danger: {
      background: "transparent",
      color: COLORS.danger,
      border: `1px solid ${COLORS.danger}55`,
    },
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, color: COLORS.sub, marginBottom: 6, letterSpacing: 0.3 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.panel2,
  color: COLORS.text,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(4,7,14,0.6)",
      backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      padding: 16,
    }}>
      <div style={{
        width, maxWidth: "94vw", maxHeight: "85vh", overflowY: "auto",
        background: COLORS.glass, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${COLORS.borderGlass}`,
        borderRadius: 16, padding: 24,
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 17, color: COLORS.text }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: COLORS.sub, cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    Compliant: { c: COLORS.ok, bg: "#3DDC9722" },
    Attention: { c: COLORS.warn, bg: "#FFC65C22" },
    Critical: { c: COLORS.danger, bg: "#FF5C7A22" },
    Pending: { c: COLORS.warn, bg: "#FFC65C22" },
  };
  const s = map[status] || { c: COLORS.sub, bg: "#8A96AE22" };
  return (
    <span style={{
      color: s.c, background: s.bg, fontSize: 12, fontWeight: 600,
      padding: "4px 10px", borderRadius: 999,
    }}>
      {status}
    </span>
  );
}

/* ---------------- Landing / Org / Role / Auth flow ---------------- */

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
      .hcp-portal-root * { font-family: 'Outfit', system-ui, sans-serif; box-sizing: border-box; }
      .hcp-portal-root ::selection { background: ${COLORS.orange1}55; }
      .hcp-portal-root input:disabled { opacity: 0.6; }
      .hcp-portal-root select { appearance: none; }
    `}</style>
  );
}

function Logo({ small }) {
  const height = small ? 30 : 48;
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: small ? 0 : 8 }}>
      <img src="/decklink-logo.svg" alt="DeckLink Logo" style={{ height, objectFit: "contain" }} />
    </div>
  );
}

function Centered({ children }) {
  return (
    <div style={{
      minHeight: "100vh",
      backgroundImage: "linear-gradient(rgba(11, 18, 32, 0.45), rgba(11, 18, 32, 0.65)), url('/hcp-login-bg.png')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      fontFamily: "'Outfit', system-ui, sans-serif",
    }}>
      <GlobalStyles />
      {children}
    </div>
  );
}

const cardStyle = {
  background: "rgba(11, 18, 32, 0.82)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: "24px",
  padding: "36px 40px",
  width: "100%",
  maxWidth: "460px",
  boxShadow: "0 32px 64px rgba(0,0,0,0.65)",
  backdropFilter: "blur(20px)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center"
};

function Landing({ onNewOrg, onExisting }) {
  return (
    <Centered>
      <div style={cardStyle}>
        <Logo />
        <p style={{ color: COLORS.sub, marginBottom: 32, textAlign: "center", fontSize: 14 }}>
          CardioX ECG & sleep therapy monitoring — clinician portal
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
          <Btn onClick={onNewOrg} style={{ width: "100%" }}>Register new organisation</Btn>
          <Btn variant="ghost" onClick={onExisting} style={{ width: "100%" }}>Sign in to existing organisation</Btn>
        </div>
      </div>
    </Centered>
  );
}

function OrgSelect({ data, onSelect }) {
  return (
    <Centered>
      <div style={cardStyle}>
        <Logo />
        <div style={{ width: "100%", marginTop: 20 }}>
          <h3 style={{ color: COLORS.text, fontSize: 16, marginBottom: 14, textAlign: "center" }}>Select organisation</h3>
          {data.orgs.length === 0 && <p style={{ color: COLORS.sub, fontSize: 14, textAlign: "center", marginBottom: 14 }}>No organisations yet.</p>}
          <div style={{ maxHeight: "240px", overflowY: "auto", width: "100%", paddingRight: 4, marginBottom: 14 }}>
            {data.orgs.map((o) => (
              <div key={o.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: COLORS.panel2, border: `1px solid ${COLORS.border}`,
                borderRadius: 10, padding: "12px 14px", marginBottom: 10, gap: 10
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: COLORS.text, fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</div>
                  <div style={{ color: COLORS.sub, fontSize: 11.5 }}>{o.type}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn onClick={() => onSelect(o)} style={{ padding: "6px 12px", fontSize: 12.5 }}>Continue</Btn>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Centered>
  );
}

function RoleCard({ label, desc, onClick }) {
  return (
    <div onClick={onClick} style={{
      width: "100%", background: COLORS.panel2, border: `1px solid ${COLORS.border}`,
      borderRadius: 12, padding: 18, cursor: "pointer",
      transition: "border-color .15s",
    }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = COLORS.orange1}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = COLORS.border}
    >
      <div style={{ color: COLORS.orange1, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ color: COLORS.sub, fontSize: 12.5, lineHeight: 1.4 }}>{desc}</div>
    </div>
  );
}

function RoleSelect({ onPick, onBack }) {
  return (
    <Centered>
      <div style={cardStyle}>
        <Logo />
        <h3 style={{ color: COLORS.text, fontSize: 16, margin: "20px 0 16px" }}>Register New Organisation</h3>
        <div style={{ display: "flex", gap: 14, flexDirection: "column", width: "100%", marginBottom: 20 }}>
          <RoleCard label="Clinic Account (Healthcare Professional)" desc="Used for ECG testing and patient CPAP/BiPAP compliance tracking." onClick={() => onPick("HCP Head", "Healthcare Professional")} />
          <RoleCard label="Doctor Account (Doctors)" desc="Used by doctors to view and approve ECG test reports." onClick={() => onPick("Head doctor", "Doctors")} />
        </div>
        <Btn variant="ghost" onClick={onBack} style={{ width: "100%" }}>
          <ArrowLeft size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Back
        </Btn>
      </div>
    </Centered>
  );
}

function TabBtn({ active, children, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "8px 10px", borderRadius: 8, fontSize: 13, cursor: "pointer",
      border: `1px solid ${active ? COLORS.orange1 : COLORS.border}`,
      background: active ? `${COLORS.orange1}18` : "transparent",
      color: active ? COLORS.orange1 : COLORS.sub, fontWeight: 600,
    }}>
      {children}
    </button>
  );
}

function FirstLoginReset({ user, onSubmit, onCancel }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);

  const handleResetSubmit = (e) => {
    e.preventDefault();
    if (newPassword.length < 3) {
      setError("Password must be at least 3 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    onSubmit(newPassword);
  };

  return (
    <Centered>
      <div style={{ ...cardStyle, maxWidth: "480px" }}>
        <Logo />
        <div style={{ width: "100%", marginTop: 18 }}>
          <h3 style={{ color: COLORS.text, fontSize: 18, marginBottom: 6, textAlign: "center", fontWeight: 700 }}>
            Reset Password
          </h3>
          <p style={{ color: COLORS.sub, fontSize: 13, marginBottom: 20, textAlign: "center", lineHeight: 1.5 }}>
            Welcome, <strong>{user.name}</strong>! As this is your first sign-in, please configure a new secure password.
          </p>

          <form onSubmit={handleResetSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {error && (
              <div style={{ color: COLORS.danger, fontSize: 13, marginBottom: 4, background: "rgba(226,75,74,0.08)", padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(226,75,74,0.2)" }}>
                {error}
              </div>
            )}

            <Field label="New Password">
              <input 
                type="password" 
                style={inputStyle} 
                value={newPassword} 
                onChange={(e) => { setNewPassword(e.target.value); setError(null); }} 
                placeholder="Enter new password"
                required
              />
            </Field>

            <Field label="Confirm New Password">
              <input 
                type="password" 
                style={inputStyle} 
                value={confirmPassword} 
                onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }} 
                placeholder="Re-type new password"
                required
              />
            </Field>

            <Btn type="submit" style={{ width: "100%", marginTop: 12, minHeight: "44px" }}>
              Update Password &amp; Login
            </Btn>

            <Btn variant="ghost" onClick={onCancel} style={{ width: "100%" }}>
              Cancel
            </Btn>
          </form>
        </div>
      </div>
    </Centered>
  );
}

function AuthForm({ mode, role, onSubmit, onSwitchMode, onBack, pendingRole }) {
  const [tab, setTab] = useState("password");
  const [form, setForm] = useState({
    orgName: "", name: "", email: "", phone: "", password: "", providerId: "", city: "", otp: "",
  });
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSendOTP = async () => {
    if (!form.phone) {
      setOtpError("Please enter your phone number.");
      return;
    }
    setOtpLoading(true); setOtpError(null);
    try {
      await sendOTP(form.phone);
      setOtpSent(true);
    } catch (err) {
      setOtpError(err.message || "Failed to send OTP. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!form.otp) {
      setOtpError("Please enter the 6-digit OTP.");
      return;
    }
    setOtpLoading(true); setOtpError(null);
    try {
      const res = await verifyOTP(form.phone, form.otp);
      onSubmit({ ...form, token: res.token, isOtpVerified: true });
    } catch (err) {
      setOtpError(err.message || "Invalid or expired OTP.");
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <Centered>
      <div style={{ ...cardStyle, maxWidth: "500px" }}>
        <Logo />
        <div style={{ width: "100%", marginTop: 16 }}>
          <h3 style={{ color: COLORS.text, fontSize: 17, marginBottom: 4, textAlign: "center" }}>
            {mode === "signup" ? "Create Account" : "Sign In"}
          </h3>
          <p style={{ color: COLORS.sub, fontSize: 13, marginBottom: 18, textAlign: "center" }}>
            {mode === "signup" ? `${role} — ${form.orgName || "Organisation"}` : (pendingRole?.org?.name ? `Access ${pendingRole.org.name}` : "Access CPAP & ECG clinical monitoring portal")}
          </p>

          {/* {mode === "login" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              <TabBtn active={tab === "password"} onClick={() => setTab("password")}>Name & Password</TabBtn>
              <TabBtn active={tab === "phone"} onClick={() => setTab("phone")}>Phone OTP</TabBtn>
            </div>
          )} */}

          <div style={{ maxHeight: "360px", overflowY: "auto", paddingRight: 4, marginBottom: 18 }}>
            {mode === "signup" && (
              <>
                <Field label="Organisation Name">
                  <input style={inputStyle} value={form.orgName} onChange={set("orgName")} placeholder="e.g. Faridabad Sleep & Respiratory Clinic" />
                </Field>
                <Field label="Full Name">
                  <input style={inputStyle} value={form.name} onChange={set("name")} placeholder="Dr. / Mr. / Ms. full name" />
                </Field>
                <Field label="Email">
                  <input style={inputStyle} value={form.email} onChange={set("email")} placeholder="name@clinic.in" />
                </Field>
                <Field label="Phone Number">
                  <input style={inputStyle} value={form.phone} onChange={set("phone")} placeholder="10-digit mobile" />
                </Field>
                {(role === "Doctor Head" || role === "Head doctor") && (
                  <Field label="Provider ID">
                    <input style={inputStyle} value={form.providerId} onChange={set("providerId")} placeholder="Clinical provider identifier" />
                  </Field>
                )}
                <Field label="City">
                  <input style={inputStyle} value={form.city} onChange={set("city")} placeholder="City" />
                </Field>
                <Field label="Password">
                  <input type="password" style={inputStyle} value={form.password} onChange={set("password")} placeholder="Create a password" />
                </Field>
              </>
            )}

            {mode === "login" && tab === "password" && (
              <>
                <Field label="Name">
                  <input style={inputStyle} value={form.name} onChange={set("name")} placeholder="Your name" />
                </Field>
                <Field label="Password">
                  <input type="password" style={inputStyle} value={form.password} onChange={set("password")} placeholder="Password" />
                </Field>
              </>
            )}
            {/* {mode === "login" && tab === "phone" && (
              <>
                <Field label="Phone Number">
                  <input style={inputStyle} value={form.phone} onChange={set("phone")} placeholder="10-digit mobile" disabled={otpSent} />
                </Field>
                {otpSent && (
                  <Field label="Enter 6-Digit OTP">
                    <input style={inputStyle} value={form.otp} onChange={set("otp")} placeholder="e.g. 123456" maxLength={6} />
                  </Field>
                )}
                {otpError && (
                  <div style={{ color: COLORS.danger, fontSize: 13, marginBottom: 12 }}>
                    {otpError}
                  </div>
                )}
              </>
            )} */}
          </div>

          {/* {mode === "login" && tab === "phone" ? (
            !otpSent ? (
              <Btn onClick={handleSendOTP} disabled={otpLoading} style={{ width: "100%", minHeight: "44px" }}>
                {otpLoading ? "Sending..." : "Send Verification OTP"}
              </Btn>
            ) : (
              <Btn onClick={handleVerifyOTP} disabled={otpLoading} style={{ width: "100%", minHeight: "44px" }}>
                {otpLoading ? "Verifying..." : "Verify & Sign In"}
              </Btn>
            )
          ) : ( */}
            <Btn onClick={() => onSubmit(form)} style={{ width: "100%", minHeight: "44px" }}>
              {mode === "signup" ? "Create Account" : "Sign In"}
            </Btn>
          {/* )} */}

          {onBack && pendingRole && (
            <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 16, alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <Btn variant="ghost" onClick={onBack} style={{ padding: "8px 12px" }}><ArrowLeft size={13} style={{ marginRight: 4, verticalAlign: -1 }} />Back</Btn>
            </div>
          )}
        </div>
      </div>
    </Centered>
  );
}

/* ---------------- Dashboard shell + top nav ---------------- */

const NAV = {
  patients: [
    { key: "all", label: "All therapy" },
    { key: "wireless", label: "Wireless" },
    { key: "action", label: "Action Groups" },
    { key: "ventilation", label: "Ventilation patients" },
    { key: "referrals", label: "Referrals" },
  ],
  business: [
    { key: "modules", label: "Module management" },
    { key: "compliance", label: "Compliance exports" },
  ],
  admin: [
    { key: "org", label: "Organisation Details" },
    { key: "locations", label: "Locations" },
    { key: "users", label: "Users" },
    { key: "physicians", label: "Physicians" },
    { key: "insurers", label: "Insurers" },
    { key: "devices", label: "ECG Devices" },
    { key: "complianceOptions", label: "Compliance options" },
  ],
  ecgReports: [
    { key: "all", label: "All Reports" },
    { key: "pending", label: "Pending" },
    { key: "assigned", label: "Assigned" },
    { key: "reviewed", label: "Reviewed" },
  ],
};

function NavDropdown({ label, icon, items, onPick, active }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button style={{
        display: "flex", alignItems: "center", gap: 6, background: "none",
        border: "none", color: active ? COLORS.orange1 : COLORS.text,
        fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "8px 4px",
      }}>
        {icon}{label}<ChevronDown size={14} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, background: COLORS.panelSolid,
          border: `1px solid ${COLORS.border}`, borderRadius: 10, minWidth: 200,
          padding: 6, zIndex: 50, boxShadow: "0 12px 24px rgba(0,0,0,0.4)",
        }}>
          {items.map((it) => (
            <div key={it.key} onClick={() => { onPick(it.key); setOpen(false); }} style={{
              padding: "10px 12px", borderRadius: 7, fontSize: 13.5, color: COLORS.text,
              cursor: "pointer", fontWeight: 500,
            }}
              onMouseEnter={(e) => e.currentTarget.style.background = COLORS.panel2}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              {it.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

function TopBar({ session, isDoctorOrg, view, setView, onLogout }) {
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);

  const glassBar = {
    background: COLORS.glass,
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderBottom: `1px solid ${COLORS.borderGlass}`,
  };

  if (isMobile) {
    return (
      <div style={{ position: "sticky", top: 0, zIndex: 60, ...glassBar }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px",
        }}>
          <Logo small />
          <button onClick={() => setMenuOpen(!menuOpen)} style={{
            background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 8,
            color: COLORS.text, padding: "8px 10px", cursor: "pointer",
          }}>
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
            {!isDoctorOrg && (
              <>
                <MobileNavGroup label="Patients" icon={<Users size={15} />} items={NAV.patients}
                  onPick={(k) => { setView({ section: "patients", tab: k }); setMenuOpen(false); }} />
                <MobileNavGroup label="Business" icon={<Building2 size={15} />} items={NAV.business}
                  onPick={(k) => { setView({ section: "business", tab: k }); setMenuOpen(false); }} />
              </>
            )}
            <MobileNavGroup label="Administration" icon={<Shield size={15} />} items={isDoctorOrg ? NAV.admin.filter(x => x.key === "users" || x.key === "org") : NAV.admin}
              onPick={(k) => { setView({ section: "admin", tab: k }); setMenuOpen(false); }} />
            <button
              onClick={() => { setView({ section: "ecgReports", tab: "all" }); setMenuOpen(false); }}
              style={{
                textAlign: "left", background: "none", border: "none",
                color: view.section === "ecgReports" ? COLORS.orange2 : COLORS.text,
                fontSize: 14, fontWeight: 600, padding: "10px 4px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              ECG Reports
            </button>
            <button onClick={() => { setView({ section: "profile" }); setMenuOpen(false); }} style={{
              textAlign: "left", background: "none", border: "none", color: COLORS.text,
              fontSize: 14, fontWeight: 600, padding: "10px 4px", cursor: "pointer",
            }}>
              My profile
            </button>
            <div style={{ fontSize: 12.5, color: COLORS.sub, padding: "6px 4px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              {session.userName} · <span style={{ color: COLORS.orange2 }}>{session.role}</span>
              {session.role !== "HCP Head" && session.role !== "Sub dealer" && session.role !== "Head doctor" && (
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                  textTransform: "uppercase", background: COLORS.danger + "22",
                  color: COLORS.danger, padding: "2px 6px", borderRadius: 4,
                }}>
                  View Only
                </span>
              )}
            </div>
            <button onClick={onLogout} style={{
              background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 8,
              color: COLORS.sub, cursor: "pointer", padding: "10px 12px", display: "flex",
              alignItems: "center", gap: 6, fontSize: 13, marginTop: 4,
            }}>
              <LogOut size={14} /> Logout
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 60,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 28px", ...glassBar,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
        <Logo small />
        {!isDoctorOrg && (
          <>
            <NavDropdown
              label="Patients" icon={<Users size={15} style={{ marginRight: 2 }} />}
              items={NAV.patients} active={view.section === "patients"}
              onPick={(k) => setView({ section: "patients", tab: k })}
            />
            <NavDropdown
              label="Business" icon={<Building2 size={15} style={{ marginRight: 2 }} />}
              items={NAV.business} active={view.section === "business"}
              onPick={(k) => setView({ section: "business", tab: k })}
            />
          </>
        )}
        <NavDropdown
          label="Administration" icon={<Shield size={15} style={{ marginRight: 2 }} />}
          items={isDoctorOrg ? NAV.admin.filter(x => x.key === "users" || x.key === "org") : NAV.admin} active={view.section === "admin"}
          onPick={(k) => setView({ section: "admin", tab: k })}
        />
        <div
          onClick={() => setView({ section: "ecgReports", tab: "all" })}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            color: view.section === "ecgReports" ? COLORS.orange2 : COLORS.text,
            fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "8px 4px",
          }}
        >
          ECG Reports
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div onClick={() => setView({ section: "profile" })} style={{
          cursor: "pointer", fontSize: 13.5, color: view.section === "profile" ? COLORS.orange2 : COLORS.text,
          fontWeight: 600,
        }}>
          My profile
        </div>
        <div style={{ fontSize: 12.5, color: COLORS.sub, display: "flex", alignItems: "center", gap: 6 }}>
          {session.userName} · <span style={{ color: COLORS.orange2 }}>{session.role}</span>
          {session.role !== "HCP Head" && session.role !== "Sub dealer" && session.role !== "Head doctor" && (
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
              textTransform: "uppercase", background: COLORS.danger + "22",
              color: COLORS.danger, padding: "2px 6px", borderRadius: 4,
            }}>
              View Only
            </span>
          )}
        </div>
        <button onClick={onLogout} style={{
          background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 8,
          color: COLORS.sub, cursor: "pointer", padding: "7px 12px", display: "flex",
          alignItems: "center", gap: 6, fontSize: 13,
        }}>
          <LogOut size={14} /> Logout
        </button>
      </div>
    </div>
  );
}

function MobileNavGroup({ label, icon, items, onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "none", border: "none", color: COLORS.text, fontSize: 14, fontWeight: 600,
        padding: "10px 4px", cursor: "pointer",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>{icon}{label}</span>
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {open && (
        <div style={{ paddingLeft: 22, display: "flex", flexDirection: "column" }}>
          {items.map((it) => (
            <button key={it.key} onClick={() => onPick(it.key)} style={{
              textAlign: "left", background: "none", border: "none", color: COLORS.sub,
              fontSize: 13.5, padding: "8px 4px", cursor: "pointer",
            }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Patients section ---------------- */

function findDoctor(orgData, doctorId) {
  if (!doctorId) return null;
  for (const orgId in orgData.users) {
    const org = orgData.orgs.find((o) => o.id === orgId);
    if (org?.type === "Doctors") {
      const doc = orgData.users[orgId].find((u) => u.id === doctorId);
      if (doc) return doc;
    }
  }
  return null;
}

function getAllDoctors(orgData) {
  const list = [];
  orgData.orgs.forEach((org) => {
    if (org.type === "Doctors") {
      const users = orgData.users[org.id] || [];
      users.forEach((u) => {
        if (u.role === "Head doctor" || u.role === "Jr Doc") {
          list.push({ id: u.id, name: u.name, orgName: org.name });
        }
      });
    }
  });
  return list;
}

function triggerDoctorAssociationEmail(orgData, vals) {
  const doc = findDoctor(orgData, vals.doctorId);
  if (!doc) return;
  
  const emailSubject = "New Patient Assignment - CardioX";
  const emailBody = `
    <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
      <h2 style="color: #2E7DB8; margin-top: 0;">CardioX Patient Assignment</h2>
      <p>Dear Dr. ${doc.name},</p>
      <p>You have been associated as the primary reviewer for a new patient monitor record:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr style="background: #f9f9f9;">
          <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Patient Name</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${vals.name}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Age</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${vals.age}</td>
        </tr>
        <tr style="background: #f9f9f9;">
          <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Therapy Mode</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${vals.therapy}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Device Serial</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${vals.serial || "—"}</td>
        </tr>
      </table>
      <p>Please log in to your CardioX Doctor account to monitor their reports and compliance data.</p>
      <p>Link: <a href="http://localhost:5175/hcp" style="color: #3E97D6; font-weight: bold; text-decoration: none;">http://localhost:5175/hcp</a></p>
      <p style="color: #777; font-size: 12px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">This is an automated clinical notification from the CardioX dashboard.</p>
    </div>
  `;
  triggerEmailNotification(doc.email, emailSubject, emailBody);
}

function PatientModal({ title, initial, doctors, onClose, onSave }) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    age: initial?.age || 40,
    therapy: initial?.therapy || "CPAP",
    connectivity: initial?.connectivity || "Wireless",
    serial: initial?.serial || "",
    ahi: initial?.ahi || 2.0,
    usageHrs: initial?.usageHrs || 7.0,
    status: initial?.status || "Compliant",
    alert: initial?.alert || "",
    doctorId: initial?.doctorId || "",
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal title={title} onClose={onClose}>
      <Field label="Patient Name"><input style={inputStyle} value={form.name} onChange={set("name")} /></Field>
      <Field label="Age"><input type="number" style={inputStyle} value={form.age} onChange={set("age")} /></Field>
      <Field label="Therapy">
        <select style={inputStyle} value={form.therapy} onChange={set("therapy")}>
          <option value="CPAP">CPAP</option>
          <option value="BiPAP">BiPAP</option>
          <option value="BiPAP-Ventilation">BiPAP-Ventilation</option>
        </select>
      </Field>
      <Field label="Connectivity">
        <select style={inputStyle} value={form.connectivity} onChange={set("connectivity")}>
          <option value="Wireless">Wireless</option>
          <option value="SD Card">SD Card</option>
        </select>
      </Field>
      <Field label="Device Serial Number (for linking S3 ECG reports)"><input style={inputStyle} value={form.serial} onChange={set("serial")} placeholder="e.g. 0010, A010" /></Field>
      <Field label="AHI (events/hr)"><input type="number" step="0.1" style={inputStyle} value={form.ahi} onChange={set("ahi")} /></Field>
      <Field label="Usage Hours/Night"><input type="number" step="0.1" style={inputStyle} value={form.usageHrs} onChange={set("usageHrs")} /></Field>
      <Field label="Status">
        <select style={inputStyle} value={form.status} onChange={set("status")}>
          <option value="Compliant">Compliant</option>
          <option value="Attention">Attention</option>
          <option value="Critical">Critical</option>
        </select>
      </Field>
      <Field label="Alert Message (optional)"><input style={inputStyle} value={form.alert} onChange={set("alert")} /></Field>
      <Field label="Associate Doctor">
        <select style={inputStyle} value={form.doctorId} onChange={set("doctorId")}>
          <option value="">-- No doctor associated --</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>{d.name} ({d.orgName})</option>
          ))}
        </select>
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => onSave(form)} disabled={!form.name}>Save</Btn>
      </div>
    </Modal>
  );
}

function PatientsSection({ tab, orgData, orgId, setOrgData, session }) {
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null);
  const patients = orgData.patients[orgId] || [];
  const referrals = orgData.referrals[orgId] || [];
  const doctorsList = getAllDoctors(orgData);

  const commit = (next) => {
    setOrgData(next);
    saveData(next);
  };
  const locs = orgData.locations[orgId] || [];

  const isAdmin = session?.role === "HCP Head" || session?.role === "Doctor Head";
  
  // Default selected location is "All" for admins.
  // For clinical/junior users, it is locked to the first location name (or "Main Clinic")
  const defaultLoc = isAdmin ? "All" : (locs.length > 0 ? locs[0].name : "Main Clinic");
  const [selectedLocation, setSelectedLocation] = useState(defaultLoc);

  // Sync selected location if role changes (e.g. in development/testing)
  useEffect(() => {
    setSelectedLocation(isAdmin ? "All" : (locs.length > 0 ? locs[0].name : "Main Clinic"));
  }, [isAdmin, locs.length]);

  if (tab === "referrals") {
    return (
      <Panel title="Referrals" icon={<ClipboardList size={18} />}>
        <Table
          cols={["Patient", "Referred by", "Reason", "Date", "Status"]}
          rows={referrals.map((r) => [r.patient, r.referredBy, r.reason, r.date, <StatusPill status={r.status} />])}
          empty="No referrals yet."
        />
      </Panel>
    );
  }

  // Filter patients by name and location assignment
  let filtered = patients;
  if (tab === "wireless") filtered = patients.filter((p) => p.connectivity === "Wireless");
  if (tab === "ventilation") filtered = patients.filter((p) => p.therapy.includes("Ventilation") || p.therapy === "BiPAP");
  if (tab === "action") filtered = patients.filter((p) => p.status !== "Compliant");

  // Filter by search query
  filtered = filtered.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  // Filter by location
  filtered = filtered.filter((p) => {
    const pLoc = locs.length > 0 ? locs[p.age % locs.length].name : "Main Clinic";
    if (selectedLocation !== "All" && pLoc !== selectedLocation) return false;
    return true;
  });

  const titleMap = {
    all: "All therapy",
    wireless: "Wireless patients",
    action: "Action Groups — needs attention",
    ventilation: "Ventilation patients",
  };

  return (
    <Panel title={titleMap[tab] || "Patients"} icon={<Users size={18} />}
      right={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Location Scope Selector */}
          {isAdmin ? (
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              style={{
                background: COLORS.panel2,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                color: COLORS.text,
                padding: "6px 10px",
                fontSize: 13,
                outline: "none"
              }}
            >
              <option value="All">All Locations</option>
              {locs.map((l) => (
                <option key={l.id} value={l.name}>{l.name}</option>
              ))}
            </select>
          ) : (
            <span style={{
              fontSize: 12.5,
              color: COLORS.sub,
              background: COLORS.panel2,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              padding: "6px 12px",
              display: "inline-flex",
              alignItems: "center",
              gap: 4
            }}>
              📍 Scoped: {locs.length > 0 ? locs[0].name : "Main Clinic"}
            </span>
          )}

          {/* Search bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.panel2, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px" }}>
            <Search size={14} color={COLORS.sub} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patients"
              style={{ background: "none", border: "none", outline: "none", color: COLORS.text, fontSize: 13 }} />
          </div>
          <Btn onClick={() => setModal({ type: "create" })}><Plus size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Add Patient</Btn>
        </div>
      }
    >
      <Table
        cols={["Patient", "Age", "Assigned Location", "Therapy", "Connectivity", "Device Serial", "AHI", "Usage (hrs/night)", "Status", "Alert", "Doctor", "Actions"]}
        rows={filtered.map((p) => {
          const doc = findDoctor(orgData, p.doctorId);
          const pLoc = locs.length > 0 ? locs[p.age % locs.length].name : "Main Clinic";
          return [
            p.name,
            p.age,
            <span style={{ color: COLORS.orange2, fontWeight: 600 }}>{pLoc}</span>,
            p.therapy,
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {p.connectivity === "Wireless" ? <Wifi size={13} color={COLORS.ok} /> : <WifiOff size={13} color={COLORS.sub} />}
              {p.connectivity}
            </span>,
            p.serial || <span style={{ color: COLORS.sub }}>—</span>,
            p.ahi,
            p.usageHrs,
            <StatusPill status={p.status} />,
            p.alert ? <span style={{ color: COLORS.warn, fontSize: 12.5, display: "flex", alignItems: "center", gap: 4 }}><AlertTriangle size={12} />{p.alert}</span> : <span style={{ color: COLORS.sub }}>—</span>,
            doc ? <span style={{ color: COLORS.orange2, fontWeight: 600 }}>{doc.name}</span> : <span style={{ color: COLORS.sub }}>Unassigned</span>,
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setModal({ type: "edit", item: p })} style={{ background: "none", border: "none", color: COLORS.sub, cursor: "pointer" }}><Edit2 size={14} /></button>
              <button onClick={() => {
                const next = { ...orgData };
                next.patients[orgId] = patients.filter((x) => x.id !== p.id);
                commit(next);
              }} style={{ background: "none", border: "none", color: COLORS.danger, cursor: "pointer" }}><Trash2 size={14} /></button>
            </div>
          ];
        })}
        empty="No patients match this view."
      />

      {modal?.type === "create" && (
        <PatientModal title="Add Patient" doctors={doctorsList} onClose={() => setModal(null)}
          onSave={(vals) => {
            const next = { ...orgData };
            next.patients[orgId] = [...patients, { id: uid(), ...vals }];
            commit(next); setModal(null);
            triggerDoctorAssociationEmail(next, vals);
          }}
        />
      )}
      {modal?.type === "edit" && (
        <PatientModal title="Edit Patient" initial={modal.item} doctors={doctorsList} onClose={() => setModal(null)}
          onSave={(vals) => {
            const next = { ...orgData };
            next.patients[orgId] = patients.map((x) => x.id === modal.item.id ? { ...x, ...vals } : x);
            commit(next); setModal(null);
            if (vals.doctorId && vals.doctorId !== modal.item.doctorId) {
              triggerDoctorAssociationEmail(next, vals);
            }
          }}
        />
      )}
    </Panel>
  );
}

/* ---------------- Business section ---------------- */

function BusinessSection({ tab }) {
  if (tab === "modules") {
    return (
      <Panel title="Module management" icon={<Settings size={18} />}>
        {["CPAP Monitoring", "BiPAP Monitoring", "Ventilation Add-on", "Sleep Apnea Screening"].map((m) => (
          <div key={m} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 16px", border: `1px solid ${COLORS.border}`, borderRadius: 10, marginBottom: 10,
            background: COLORS.panel2,
          }}>
            <span style={{ color: COLORS.text, fontSize: 14 }}>{m}</span>
            <span style={{ color: COLORS.ok, fontSize: 12.5, fontWeight: 600 }}>Active</span>
          </div>
        ))}
      </Panel>
    );
  }
  return (
    <Panel title="Compliance exports" icon={<FileText size={18} />}>
      <p style={{ color: COLORS.sub, fontSize: 13.5, marginBottom: 16 }}>
        Generate adherence/compliance reports for insurer reimbursement.
      </p>
      <Btn>Export compliance report (CSV)</Btn>
    </Panel>
  );
}

/* ---------------- Administration section ---------------- */

function AdminSection({ tab, orgData, orgId, setOrgData, isRestricted, onRestrictedClick }) {
  const [modal, setModal] = useState(null);

  const commit = (next) => {
    setOrgData(next);
    saveData(next);
  };

  if (tab === "org") {
    const org = orgData.orgs.find((o) => o.id === orgId);
    return (
      <Panel title="Organisation Details" icon={<Building2 size={18} />}>
        <Field label="Organisation name"><input style={inputStyle} defaultValue={org?.name} disabled={isRestricted} /></Field>
        <Field label="Organisation type"><input style={inputStyle} defaultValue={org?.type} disabled /></Field>
        <Btn onClick={isRestricted ? onRestrictedClick : undefined} disabled={isRestricted} style={isRestricted ? { background: "#cccccc", color: "#666666" } : undefined}>Save changes</Btn>
      </Panel>
    );
  }

  if (tab === "locations") {
    const locs = orgData.locations[orgId] || [];
    return (
      <Panel title="Locations" icon={<MapPin size={18} />} right={<Btn onClick={isRestricted ? onRestrictedClick : () => setModal({ type: "location" })} style={isRestricted ? { background: "#cccccc", color: "#666666" } : undefined}><Plus size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Add location</Btn>}>
        <Table cols={["Name", "Address"]} rows={locs.map((l) => [l.name, l.address])} empty="No locations added." />
        {modal?.type === "location" && (
          <SimpleAddModal title="Add location" fields={[{ k: "name", label: "Location name" }, { k: "address", label: "Address" }]}
            onClose={() => setModal(null)}
            onSave={(vals) => {
              const next = { ...orgData };
              next.locations[orgId] = [...locs, { id: uid(), ...vals }];
              commit(next); setModal(null);
            }}
          />
        )}
      </Panel>
    );
  }

  if (tab === "insurers") {
    const insurers = orgData.insurers[orgId] || [];
    return (
      <Panel title="Insurers" icon={<Shield size={18} />} right={<Btn onClick={isRestricted ? onRestrictedClick : () => setModal({ type: "insurer" })} style={isRestricted ? { background: "#cccccc", color: "#666666" } : undefined}><Plus size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Add insurer</Btn>}>
        <Table cols={["Name", "Policy portal", "Contact"]} rows={insurers.map((i) => [i.name, i.policyPortal, i.contact])} empty="No insurers added." />
        {modal?.type === "insurer" && (
          <SimpleAddModal title="Add insurer" fields={[{ k: "name", label: "Insurer name" }, { k: "policyPortal", label: "Policy portal URL" }, { k: "contact", label: "Contact email" }]}
            onClose={() => setModal(null)}
            onSave={(vals) => {
              const next = { ...orgData };
              next.insurers[orgId] = [...insurers, { id: uid(), ...vals }];
              commit(next); setModal(null);
            }}
          />
        )}
      </Panel>
    );
  }

  if (tab === "devices") {
    const devices = orgData.devices?.[orgId] || [];
    return (
      <Panel title="ECG Devices" icon={<Activity size={18} />} right={<Btn onClick={isRestricted ? onRestrictedClick : () => setModal({ type: "device" })} style={isRestricted ? { background: "#cccccc", color: "#666666" } : undefined}><Plus size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Register Device</Btn>}>
        <p style={{ color: COLORS.sub, fontSize: 12.5, marginBottom: 12 }}>
          Register clinical ECG hardware devices (by serial number) to link S3 report folders.
        </p>
        <Table cols={["Serial Number", "Model / Name", ""]} rows={devices.map((d) => [
          d.serial, d.model,
          <button onClick={isRestricted ? onRestrictedClick : () => {
            const next = { ...orgData };
            next.devices[orgId] = devices.filter((x) => x.id !== d.id);
            commit(next);
          }} style={{ background: "none", border: "none", color: isRestricted ? COLORS.sub + "55" : COLORS.danger, cursor: "pointer" }}>
            <Trash2 size={14} />
          </button>
        ])} empty="No devices registered." />
        {modal?.type === "device" && (
          <SimpleAddModal title="Register Device" fields={[
            { k: "serial", label: "Device Serial Number (e.g. A010, A057)" },
            { k: "model", label: "Model / Description", value: "RhythmUltra V1", disabled: true }
          ]}
            onClose={() => setModal(null)}
            onSave={(vals) => {
              const next = { ...orgData };
              next.devices[orgId] = [...devices, { id: uid(), ...vals }];
              commit(next); setModal(null);
            }}
          />
        )}
      </Panel>
    );
  }

  if (tab === "complianceOptions") {
    return (
      <Panel title="Compliance options" icon={<FileText size={18} />}>
        <Field label="Minimum usage hours/night for compliance">
          <input style={inputStyle} defaultValue="4" disabled={isRestricted} />
        </Field>
        <Field label="Minimum compliant nights (of 30)">
          <input style={inputStyle} defaultValue="21" disabled={isRestricted} />
        </Field>
        <Btn onClick={isRestricted ? onRestrictedClick : undefined} disabled={isRestricted} style={isRestricted ? { background: "#cccccc", color: "#666666" } : undefined}>Save options</Btn>
      </Panel>
    );
  }

  if (tab === "physicians") {
    const physicians = orgData.physicians[orgId] || [];
    return (
      <Panel title="Physicians" icon={<Stethoscope size={18} />}
        right={<Btn onClick={isRestricted ? onRestrictedClick : () => setModal({ type: "physician" })} style={isRestricted ? { background: "#cccccc", color: "#666666" } : undefined}><Plus size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Add physician</Btn>}
      >
        <p style={{ color: COLORS.sub, fontSize: 12.5, marginBottom: 12 }}>
          External referring physicians — read-only access to their referred patients' data.
        </p>
        <Table
          cols={["Name", "Speciality", "Hospital", "Phone", "Access", ""]}
          rows={physicians.map((p) => [
            p.name, p.speciality, p.hospital, p.phone, p.access,
            <button onClick={isRestricted ? onRestrictedClick : () => {
              const next = { ...orgData };
              next.physicians[orgId] = physicians.filter((x) => x.id !== p.id);
              commit(next);
            }} style={{ background: "none", border: "none", color: isRestricted ? COLORS.sub + "55" : COLORS.danger, cursor: "pointer" }}>
              <Trash2 size={14} />
            </button>,
          ])}
          empty="No physicians added."
        />
        {modal?.type === "physician" && (
          <SimpleAddModal title="Add physician" fields={[
            { k: "name", label: "Full name" }, { k: "speciality", label: "Speciality" },
            { k: "hospital", label: "Hospital / clinic" }, { k: "phone", label: "Phone" },
          ]}
            onClose={() => setModal(null)}
            onSave={(vals) => {
              const next = { ...orgData };
              next.physicians[orgId] = [...physicians, { id: uid(), access: "Read-only", ...vals }];
              commit(next); setModal(null);
            }}
          />
        )}
      </Panel>
    );
  }

  // Users CRUD
  const users = orgData.users[orgId] || [];
  const org = orgData.orgs.find((o) => o.id === orgId);
  const rolesList = org?.type === "Doctors" ? DOCTOR_ROLES : HCP_ROLES;
  return (
    <Panel title="Users" icon={<Users size={18} />}
      right={<Btn onClick={isRestricted ? onRestrictedClick : () => setModal({ type: "userCreate" })} style={isRestricted ? { background: "#cccccc", color: "#666666" } : undefined}><UserPlus size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Add user</Btn>}
    >
      <Table
        cols={["Name", "Role", "Email", "Phone", ""]}
        rows={users.map((u) => [
          u.name, u.role, u.email, u.phone,
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setModal({ type: "userView", item: u })} style={{ background: "none", border: "none", color: COLORS.sub, cursor: "pointer" }}><Eye size={14} /></button>
            <button onClick={isRestricted ? onRestrictedClick : () => setModal({ type: "userEdit", item: u })} style={{ background: "none", border: "none", color: isRestricted ? COLORS.sub + "55" : COLORS.sub, cursor: "pointer" }}><Edit2 size={14} /></button>
            <button onClick={isRestricted ? onRestrictedClick : () => {
              const next = { ...orgData };
              next.users[orgId] = users.filter((x) => x.id !== u.id);
              commit(next);
            }} style={{ background: "none", border: "none", color: isRestricted ? COLORS.danger + "55" : COLORS.danger, cursor: "pointer" }}><Trash2 size={14} /></button>
          </div>,
        ])}
        empty="No users yet."
      />

      {modal?.type === "userCreate" && (
        <UserModal title="Add user" roles={rolesList} onClose={() => setModal(null)}
          onSave={(vals) => {
            const next = { ...orgData };
            next.users[orgId] = [...users, { id: uid(), providerId: "", ...vals }];
            commit(next); setModal(null);
            
            const emailSubject = "Welcome to CardioX - Account Credentials";
            const emailBody = `
              <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #2E7DB8; margin-top: 0;">Welcome to CardioX</h2>
                <p>Dear ${vals.name},</p>
                <p>An account has been created for you under the organisation <strong>${org?.name || "CardioX Organisation"}</strong>.</p>
                <p>Here are your account credentials to log in to the portal:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                  <tr style="background: #f9f9f9;">
                    <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Role</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${vals.role}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Login Username</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${vals.name}</td>
                  </tr>
                  <tr style="background: #f9f9f9;">
                    <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Password</td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${vals.password || "123"}</td>
                  </tr>
                </table>
                <p>You can access the clinician portal at: <a href="http://localhost:5175/hcp" style="color: #3E97D6; font-weight: bold; text-decoration: none;">http://localhost:5175/hcp</a></p>
                <p style="color: #777; font-size: 12px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">This is an automated message. Please contact your administrator if you did not request this account.</p>
              </div>
            `;
            triggerEmailNotification(vals.email, emailSubject, emailBody);
          }}
        />
      )}
      {modal?.type === "userEdit" && (
        <UserModal title="Edit user" initial={modal.item} roles={rolesList} onClose={() => setModal(null)}
          onSave={(vals) => {
            const next = { ...orgData };
            next.users[orgId] = users.map((x) => x.id === modal.item.id ? { ...x, ...vals } : x);
            commit(next); setModal(null);
          }}
        />
      )}
      {modal?.type === "userView" && (
        <Modal title="User details" onClose={() => setModal(null)}>
          {Object.entries(modal.item).filter(([k]) => k !== "id").map(([k, v]) => (
            <div key={k} style={{ marginBottom: 10, fontSize: 13.5 }}>
              <span style={{ color: COLORS.sub, textTransform: "capitalize" }}>{k}: </span>
              <span style={{ color: COLORS.text }}>{v || "—"}</span>
            </div>
          ))}
        </Modal>
      )}
    </Panel>
  );
}

function UserModal({ title, initial, roles, onClose, onSave }) {
  const [form, setForm] = useState({
    name: initial?.name || "", role: initial?.role || roles?.[0] || "",
    email: initial?.email || "", phone: initial?.phone || "", providerId: initial?.providerId || "",
    password: initial?.password || "123",
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal title={title} onClose={onClose}>
      <Field label="Full name"><input style={inputStyle} value={form.name} onChange={set("name")} /></Field>
      <Field label="Role">
        <select style={inputStyle} value={form.role} onChange={set("role")}>
          {roles?.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Email"><input style={inputStyle} value={form.email} onChange={set("email")} /></Field>
      <Field label="Phone"><input style={inputStyle} value={form.phone} onChange={set("phone")} /></Field>
      <Field label="Provider ID (clinical roles)"><input style={inputStyle} value={form.providerId} onChange={set("providerId")} /></Field>
      <Field label="Password"><input type="password" style={inputStyle} value={form.password} onChange={set("password")} /></Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => onSave(form)} disabled={!form.name}>Save</Btn>
      </div>
    </Modal>
  );
}

function SimpleAddModal({ title, fields, onClose, onSave }) {
  const init = {};
  fields.forEach((f) => {
    init[f.k] = f.value !== undefined ? f.value : "";
  });
  const [form, setForm] = useState(init);
  return (
    <Modal title={title} onClose={onClose}>
      {fields.map((f) => (
        <Field key={f.k} label={f.label}>
          <input 
            style={inputStyle} 
            value={form[f.k]} 
            disabled={f.disabled} 
            onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} 
          />
        </Field>
      ))}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => onSave(form)}>Save</Btn>
      </div>
    </Modal>
  );
}

/* ---------------- Profile section ---------------- */

function ProfileSection({ session, isRestricted, onRestrictedClick, orgData, setOrgData }) {
  const [tab, setTab] = useState("basic");
  
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdMessage, setPwdMessage] = useState(null);
  const [pwdMessageType, setPwdMessageType] = useState("success");

  const handleUpdatePassword = () => {
    if (isRestricted) {
      onRestrictedClick();
      return;
    }

    const orgUsers = orgData.users[session.orgId] || [];
    const userInDb = orgUsers.find(u => u.id === session.id);
    
    if (!userInDb) {
      setPwdMessage("User not found in database.");
      setPwdMessageType("error");
      return;
    }

    if (currentPassword !== userInDb.password) {
      setPwdMessage("Current password is incorrect.");
      setPwdMessageType("error");
      return;
    }

    if (newPassword.length < 3) {
      setPwdMessage("New password must be at least 3 characters.");
      setPwdMessageType("error");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwdMessage("New passwords do not match.");
      setPwdMessageType("error");
      return;
    }

    userInDb.password = newPassword;
    const updatedData = { ...orgData };
    setOrgData(updatedData);

    session.password = newPassword;
    saveSession(session);

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPwdMessage("Password updated successfully!");
    setPwdMessageType("success");
  };

  return (
    <Panel title="My profile" icon={<Settings size={18} />}>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <TabBtn active={tab === "basic"} onClick={() => setTab("basic")}>Basic details</TabBtn>
        <TabBtn active={tab === "contact"} onClick={() => setTab("contact")}>Contact details</TabBtn>
        <TabBtn active={tab === "password"} onClick={() => setTab("password")}>Change Password</TabBtn>
      </div>

      {tab === "basic" && (
        <>
          <Field label="Full name"><input style={inputStyle} defaultValue={session.userName} disabled={isRestricted} /></Field>
          <Field label="Role"><input style={inputStyle} defaultValue={session.role} disabled /></Field>
          <Field label="Username"><input style={inputStyle} defaultValue={session.userName?.replace(/\s+/g, "")} disabled /></Field>
          <Field label="Provider ID"><input style={inputStyle} defaultValue={session.providerId || ""} disabled={isRestricted} /></Field>
          <Btn onClick={isRestricted ? onRestrictedClick : undefined} disabled={isRestricted} style={isRestricted ? { background: "#cccccc", color: "#666666", marginTop: 12 } : { marginTop: 12 }}>Save changes</Btn>
        </>
      )}

      {tab === "contact" && (
        <>
          <Field label="Email"><input style={inputStyle} defaultValue={session.email || ""} disabled={isRestricted} /></Field>
          <Field label="Phone"><input style={inputStyle} defaultValue={session.phone || ""} disabled={isRestricted} /></Field>
          <Btn onClick={isRestricted ? onRestrictedClick : undefined} disabled={isRestricted} style={isRestricted ? { background: "#cccccc", color: "#666666", marginTop: 12 } : { marginTop: 12 }}>Save changes</Btn>
        </>
      )}

      {tab === "password" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: "400px" }}>
          {pwdMessage && (
            <div style={{ 
              color: pwdMessageType === "success" ? "#34d399" : "#f87171", 
              fontSize: "13px", 
              fontWeight: "600",
              background: pwdMessageType === "success" ? "rgba(52, 211, 153, 0.08)" : "rgba(248, 113, 113, 0.08)",
              border: pwdMessageType === "success" ? "1px solid rgba(52, 211, 153, 0.2)" : "1px solid rgba(248, 113, 113, 0.2)",
              borderRadius: "8px",
              padding: "10px 14px",
              marginBottom: "8px"
            }}>
              {pwdMessage}
            </div>
          )}

          <Field label="Current Password">
            <input 
              type="password" 
              style={inputStyle} 
              value={currentPassword} 
              onChange={(e) => { setCurrentPassword(e.target.value); setPwdMessage(null); }} 
              placeholder="Enter current password" 
              disabled={isRestricted}
            />
          </Field>
          
          <Field label="New Password">
            <input 
              type="password" 
              style={inputStyle} 
              value={newPassword} 
              onChange={(e) => { setNewPassword(e.target.value); setPwdMessage(null); }} 
              placeholder="Enter new password" 
              disabled={isRestricted}
            />
          </Field>

          <Field label="Confirm New Password">
            <input 
              type="password" 
              style={inputStyle} 
              value={confirmPassword} 
              onChange={(e) => { setConfirmPassword(e.target.value); setPwdMessage(null); }} 
              placeholder="Re-type new password" 
              disabled={isRestricted}
            />
          </Field>

          <Btn 
            onClick={handleUpdatePassword} 
            disabled={isRestricted} 
            style={isRestricted ? { background: "#cccccc", color: "#666666", marginTop: 12 } : { marginTop: 12 }}
          >
            Update Password
          </Btn>
        </div>
      )}
    </Panel>
  );
}

/* ---------------- Layout helpers ---------------- */

function Panel({ title, icon, right, children }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ padding: isMobile ? "18px 14px" : "28px 32px" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center",
        marginBottom: 20, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ color: COLORS.orange2 }}>{icon}</div>
          <h2 style={{ margin: 0, fontSize: isMobile ? 17 : 19, color: COLORS.text, fontWeight: 700 }}>{title}</h2>
        </div>
        {right}
      </div>
      <div style={{
        background: COLORS.glass,
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${COLORS.borderGlass}`, borderRadius: 16,
        padding: isMobile ? 14 : 22,
        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      }}>
        {children}
      </div>
    </div>
  );
}

function Table({ cols, rows, empty }) {
  if (rows.length === 0) {
    return <div style={{ color: COLORS.sub, fontSize: 13.5, padding: "20px 0", textAlign: "center" }}>{empty}</div>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 560 }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} style={{ textAlign: "left", color: COLORS.sub, fontWeight: 600, padding: "0 10px 12px", fontSize: 12, letterSpacing: 0.3, textTransform: "uppercase", whiteSpace: "nowrap" }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${COLORS.borderGlass}` }}>
              {r.map((cell, j) => (
                <td key={j} style={{ padding: "12px 10px", color: COLORS.text, whiteSpace: "nowrap" }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Root HCP Portal Component ---------------- */

export default function HCPPortal() {
  const [data, setData] = useState(loadData());
  const [session, setSession] = useState(loadSession());
  const [screen, setScreen] = useState(session ? "dashboard" : "auth");
  const [pendingRole, setPendingRole] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [view, setView] = useState({ section: "patients", tab: "all" });
  const [restrictedAlert, setRestrictedAlert] = useState(false);
  const [firstLoginUser, setFirstLoginUser] = useState(null);

  useEffect(() => { saveData(data); }, [data]);

  useEffect(() => {
    if (session) {
      const currentOrg = data.orgs.find((o) => o.id === session.orgId);
      if (currentOrg?.type === "Doctors" && view.section === "patients") {
        setView({ section: "ecgReports", tab: "all" });
      }
    }
  }, [session, data.orgs, view.section]);

  const goDashboard = (sess) => {
    saveSession(sess);
    setSession(sess);
    setScreen("dashboard");
  };

  if (screen === "orgSelect") {
    return <OrgSelect
      data={data}
      onSelect={(org) => { setAuthMode("login"); setScreen("auth"); setPendingRole({ org }); }}
    />;
  }

  if (screen === "orgFlowNew") {
    return <RoleSelect
      onBack={() => setScreen("landing")}
      onPick={(role, orgType) => { setPendingRole({ role, orgType, isNew: true }); setAuthMode("signup"); setScreen("auth"); }}
    />;
  }

  if (screen === "roleSelect") {
    return <RoleSelect
      onBack={() => setScreen("orgSelect")}
      onPick={(role, orgType) => { setPendingRole({ ...pendingRole, role, orgType }); setScreen("auth"); }}
    />;
  }

  if (screen === "auth") {
    return <AuthForm
      mode={authMode}
      role={pendingRole?.role}
      pendingRole={pendingRole}
      onBack={() => setScreen(pendingRole?.isNew ? "orgFlowNew" : "orgSelect")}
      onSwitchMode={() => setAuthMode(authMode === "signup" ? "login" : "signup")}
      onSubmit={(form) => {
        if (authMode === "signup") {
          const orgId = "org" + uid();
          const orgType = pendingRole.orgType || (pendingRole.role === "HCP Head" ? "Healthcare Professional" : "Doctors");
          const headUser = {
            id: uid(),
            name: form.name || "Head Owner",
            role: pendingRole.role,
            email: form.email || "",
            phone: form.phone || "",
            providerId: form.providerId || "",
            password: form.password || "123"
          };
          const next = {
            ...data,
            orgs: [...data.orgs, { id: orgId, name: form.orgName || "New Organisation", type: orgType }],
            users: { ...data.users, [orgId]: [headUser] },
            physicians: { ...data.physicians, [orgId]: [] },
            insurers: { ...data.insurers, [orgId]: [] },
            locations: { ...data.locations, [orgId]: [] },
            patients: { ...data.patients, [orgId]: [] },
            referrals: { ...data.referrals, [orgId]: [] },
            devices: { ...data.devices, [orgId]: [] },
          };
          setData(next); saveData(next);
          goDashboard({ orgId, ...headUser, userName: headUser.name });
          
          const emailSubject = "CardioX Registration Successful";
          const emailBody = `
            <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
              <h2 style="color: #2E7DB8; margin-top: 0;">CardioX Registration Successful</h2>
              <p>Dear ${form.name || "Head Owner"},</p>
              <p>Your organisation <strong>${form.orgName || "New Organisation"}</strong> has been successfully registered with CardioX.</p>
              <p>Here are your account credentials and role details:</p>
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr style="background: #f9f9f9;">
                  <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Organisation Type</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${orgType}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Your Role</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${pendingRole.role}</td>
                </tr>
                <tr style="background: #f9f9f9;">
                  <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Username</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${form.name || "Head Owner"}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Password</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${form.password || "123"}</td>
                </tr>
              </table>
              <p>You can access the portal and manage your team at: <a href="http://localhost:5175/hcp" style="color: #3E97D6; font-weight: bold; text-decoration: none;">http://localhost:5175/hcp</a></p>
              <p style="color: #777; font-size: 12px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">This is an automated notification from the CardioX platform.</p>
            </div>
          `;
          triggerEmailNotification(form.email, emailSubject, emailBody);
        } else {
          if (form.isOtpVerified) {
            const defaultOrgId = Object.keys(data.users)[0] || "org1";
            goDashboard({
              orgId: defaultOrgId,
              userName: form.name || "Dr. CardioX Live",
              role: "HCP Head",
              phone: form.phone,
              token: form.token
            });
            return;
          }

          let user = null;
          let matchedOrgId = null;

          for (const [oId, userList] of Object.entries(data.users)) {
            let found = null;
            if (form.phone && form.phone.trim() !== "") {
              found = userList.find((u) => u.phone === form.phone);
            } else {
              found = userList.find((u) => u.name && u.name.toLowerCase() === form.name.toLowerCase() && u.password === form.password);
            }
            
            if (found) {
              user = found;
              matchedOrgId = oId;
              break;
            }
          }

          if (user && matchedOrgId) {
            if (user.isFirstLogin) {
              setFirstLoginUser({ user, orgId: matchedOrgId });
              setScreen("firstLoginReset");
            } else {
              goDashboard({ orgId: matchedOrgId, ...user, userName: user.name });
            }
          } else {
            alert("Invalid credentials. Please verify your Name and Password.");
          }
        }
      }}
    />;
  }

  if (screen === "firstLoginReset" && firstLoginUser) {
    return <FirstLoginReset 
      user={firstLoginUser.user}
      onSubmit={(newPassword) => {
        const db = { ...data };
        const orgUsers = db.users[firstLoginUser.orgId] || [];
        const userInDb = orgUsers.find(u => u.id === firstLoginUser.user.id);
        if (userInDb) {
          userInDb.password = newPassword;
          delete userInDb.isFirstLogin;
          setData(db);
          saveData(db);
          goDashboard({ orgId: firstLoginUser.orgId, ...userInDb, userName: userInDb.name });
        }
        setFirstLoginUser(null);
      }}
      onCancel={() => {
        setFirstLoginUser(null);
        setScreen("auth");
      }}
    />;
  }

  // dashboard
  const orgId = session.orgId;
  const currentOrg = data.orgs.find((o) => o.id === orgId);
  const isDoctorOrg = currentOrg?.type === "Doctors";
  const isRestricted = session.role !== "HCP Head" && session.role !== "Sub dealer" && session.role !== "Head doctor";
  const onRestrictedClick = () => setRestrictedAlert(true);

  return (
    <div className="hcp-portal-root" style={{
      minHeight: "100vh",
      background: `
        radial-gradient(circle at 10% 10%, rgba(46,125,184,0.12), transparent 40%),
        radial-gradient(circle at 90% 90%, rgba(62,151,214,0.10), transparent 45%),
        linear-gradient(160deg, #0B1220 0%, #0E1524 55%, #0B1220 100%)
      `,
      fontFamily: "'Outfit', system-ui, sans-serif",
    }}>
      <GlobalStyles />
      <TopBar session={session} isDoctorOrg={isDoctorOrg} view={view} setView={setView} onLogout={() => {
        clearSession(); setSession(null); setScreen("orgSelect");
      }} />
      {view.section === "patients" && <PatientsSection tab={view.tab} orgData={data} orgId={orgId} setOrgData={setData} session={session} />}
      {view.section === "business" && <BusinessSection tab={view.tab} />}
      {view.section === "admin" && <AdminSection tab={view.tab} orgData={data} orgId={orgId} setOrgData={setData} isRestricted={isRestricted} onRestrictedClick={onRestrictedClick} />}
      {view.section === "ecgReports" && <ReportsSection session={session} orgData={data} orgId={orgId} setOrgData={setData} />}
      {view.section === "profile" && <ProfileSection session={session} isRestricted={isRestricted} onRestrictedClick={onRestrictedClick} orgData={data} setOrgData={setData} />}

      {restrictedAlert && (
        <Modal title="Access Restricted" onClose={() => setRestrictedAlert(false)}>
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <p style={{ color: COLORS.text, fontSize: 15, marginBottom: 20 }}>
              This account can view reports and history only.
            </p>
            <Btn onClick={() => setRestrictedAlert(false)} style={{ minWidth: 100 }}>OK</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
