import React, { useState, useEffect, useCallback } from "react";
import {
  FileText, Download, Eye, AlertTriangle, RefreshCw,
  CheckCircle, Clock, Database, Wifi, WifiOff, Filter,
  ChevronDown, HeartPulse, Activity, Zap
} from "lucide-react";
import { fetchOrgReports, rolePermissions } from "../../services/hcpApi.js";
import WaveformAnalysis from "../../pages/WaveformAnalysis.jsx";

/* ── palette ─────────────────────────────────────────────────── */
const C = {
  panel: "rgba(20, 29, 44, 0.72)", panel2: "#101724",
  border: "#263042", borderGlass: "rgba(255,255,255,0.08)",
  blue1: "#2E7DB8", blue2: "#3E97D6",
  text: "#E6EAF0", sub: "#7C8AA0",
  danger: "#D9534F", ok: "#3FA772", warn: "#C99A3C",
  purple: "#7C5CBF",
};

/* ── Report type meta ────────────────────────────────────────── */
const TYPE_META = {
  "12_lead": {
    label: "12-Lead ECG",
    icon: <Activity size={13} />,
    color: C.blue2,
    bg: C.blue1 + "22",
  },
  hrv: {
    label: "HRV",
    icon: <HeartPulse size={13} />,
    color: C.ok,
    bg: C.ok + "22",
  },
  hyperkalemia: {
    label: "Hyperkalemia",
    icon: <Zap size={13} />,
    color: C.warn,
    bg: C.warn + "22",
  },
  holter: {
    label: "Holter / 4-Lead",
    icon: <Activity size={13} />,
    color: C.purple,
    bg: C.purple + "22",
  },
  raw_ecg: {
    label: "Raw ECG Data",
    icon: <Database size={13} />,
    color: C.sub,
    bg: C.sub + "18",
  },
  ecg: {
    label: "ECG Report",
    icon: <FileText size={13} />,
    color: C.blue2,
    bg: C.blue1 + "15",
  },
  unknown: {
    label: "Report",
    icon: <FileText size={13} />,
    color: C.sub,
    bg: C.sub + "15",
  },
};

function TypeBadge({ type }) {
  const m = TYPE_META[type] || TYPE_META.unknown;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: m.bg, color: m.color,
      fontSize: 11, fontWeight: 700, padding: "3px 9px",
      borderRadius: 20, letterSpacing: 0.2, whiteSpace: "nowrap",
    }}>
      {m.icon} {m.label}
    </span>
  );
}

function SerialBadge({ serial }) {
  return (
    <span style={{
      background: "rgba(62, 151, 214, 0.12)",
      color: C.blue2, fontSize: 11.5, fontWeight: 700,
      padding: "2px 8px", borderRadius: 6, fontFamily: "monospace",
      letterSpacing: 0.5,
    }}>
      {serial}
    </span>
  );
}

/* ── Main ReportsSection ─────────────────────────────────────── */
export default function ReportsSection({ session, orgData, orgId, setOrgData }) {
  const currentOrg = orgData?.orgs?.find((o) => o.id === orgId);
  const isDoctorOrg = currentOrg?.type === "Doctors";

  // Build a set of serials that are registered to THIS org's device list
  // This is the source-of-truth for ownership enforcement
  const orgRegisteredSerials = new Set(
    (orgData?.devices?.[orgId] || []).map((d) => d.serial).filter(Boolean)
  );

  let allSerials = [];
  if (isDoctorOrg) {
    // Doctors: collect serials of patients associated with this specific doctor user,
    // but only if those patient serials are registered to an HCP org device list
    // (cross-verify: the device must be owned by some HCP org)
    const allHcpSerials = new Set();
    Object.keys(orgData?.devices || {}).forEach((oId) => {
      const org = orgData.orgs?.find((o) => o.id === oId);
      if (org && org.type !== "Doctors") {
        (orgData.devices[oId] || []).forEach((d) => {
          if (d.serial) allHcpSerials.add(d.serial);
        });
      }
    });

    const seen = new Set();
    for (const hcpOrgId in orgData.patients || {}) {
      const pats = orgData.patients[hcpOrgId] || [];
      pats.forEach((p) => {
        if (p.doctorId === session.id && p.serial && allHcpSerials.has(p.serial) && !seen.has(p.serial)) {
          seen.add(p.serial);
          allSerials.push(p.serial);
        }
      });
    }
  } else {
    // HCP org: ONLY show reports for devices registered to this org
    allSerials = Array.from(orgRegisteredSerials);
  }

  const perms = rolePermissions(session?.role);

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [serialFilter, setSerialFilter] = useState("All");
  const [days, setDays] = useState(30);
  const [showFilters, setShowFilters] = useState(false);
  const [activeWaveformUrl, setActiveWaveformUrl] = useState(null);
  const [activePdfUrl, setActivePdfUrl] = useState(null);

  const load = useCallback(async () => {
    if (!allSerials.length) { setReports([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const data = await fetchOrgReports(allSerials, days);
      setReports(data);
      setIsLive(true);
    } catch (e) {
      setError(e.message);
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  }, [allSerials.join(","), days]);

  useEffect(() => { if (perms.canViewList) load(); }, [load, perms.canViewList]);

  const handleApprove = (reportId) => {
    const next = { ...orgData };
    if (!next.approvedReports) next.approvedReports = {};
    next.approvedReports[reportId] = {
      approvedBy: session.userName,
      approvedAt: new Date().toISOString(),
    };
    setOrgData(next);

    const reportObj = reports.find((x) => x.report_id === reportId);
    if (reportObj && reportObj.serial) {
      let patient = null;
      let hcpOrgId = null;
      for (const orgKey in orgData.patients || {}) {
        const p = orgData.patients[orgKey].find((x) => x.serial === reportObj.serial);
        if (p) {
          patient = p;
          hcpOrgId = orgKey;
          break;
        }
      }

      if (patient && hcpOrgId) {
        const hcpUsers = orgData.users[hcpOrgId] || [];
        const hcpHead = hcpUsers.find((u) => u.role === "HCP Head") || hcpUsers[0];
        if (hcpHead && hcpHead.email) {
          const emailSubject = `ECG Report Approved for Patient: ${patient.name}`;
          const emailBody = `
            <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
              <h2 style="color: #3FA772; margin-top: 0;">ECG Report Approved</h2>
              <p>Dear ${hcpHead.name},</p>
              <p>An ECG report for your patient has been reviewed and approved by the medical specialist:</p>
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr style="background: #f9f9f9;">
                  <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Patient Name</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${patient.name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Device Serial</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${reportObj.serial}</td>
                </tr>
                <tr style="background: #f9f9f9;">
                  <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Report Type</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${reportObj.report_type}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Approved By</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${session.userName} (${session.role})</td>
                </tr>
              </table>
              <p>You can download the approved PDF report directly from your CardioX clinician portal.</p>
              <p>Link: <a href="http://localhost:5175/hcp" style="color: #3E97D6; font-weight: bold; text-decoration: none;">http://localhost:5175/hcp</a></p>
              <p style="color: #777; font-size: 12px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">This is an automated clinical notification from the CardioX dashboard.</p>
            </div>
          `;
          fetch("http://localhost:8000/api/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to_email: hcpHead.email,
              subject: emailSubject,
              html_body: emailBody
            })
          }).catch((err) => console.error("Error triggering SES email:", err));
        }
      }
    }
  };

  /* ── No access ── */
  if (!perms.canViewList) {
    return (
      <div style={{ padding: "52px 32px", textAlign: "center" }}>
        <AlertTriangle size={40} color={C.warn} style={{ marginBottom: 16 }} />
        <p style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>Access Restricted</p>
        <p style={{ color: C.sub, fontSize: 13.5, marginTop: 6 }}>
          ECG report access is not available for your role ({session?.role}).
        </p>
      </div>
    );
  }

  /* ── No doctor patients associated ── */
  if (isDoctorOrg && !allSerials.length) {
    return (
      <div style={{ padding: "52px 32px", textAlign: "center" }}>
        <Clock size={40} color={C.sub} style={{ marginBottom: 16, opacity: 0.4 }} />
        <p style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>No Associated Patients</p>
        <p style={{ color: C.sub, fontSize: 13.5, marginTop: 6, maxWidth: 450, margin: "8px auto 0" }}>
          You have not been associated with any patient accounts yet. 
          Ask the Healthcare Professional (Clinic Account) administrator to select you as the associated doctor for their patients.
        </p>
      </div>
    );
  }

  /* ── No devices registered ── */
  if (!allSerials.length) {
    return (
      <div style={{ padding: "52px 32px", textAlign: "center" }}>
        <Database size={40} color={C.sub} style={{ marginBottom: 16, opacity: 0.4 }} />
        <p style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>No Devices Registered</p>
        <p style={{ color: C.sub, fontSize: 13.5, marginTop: 6, maxWidth: 400, margin: "8px auto 0" }}>
          Go to <strong style={{ color: C.blue2 }}>Administration → ECG Devices</strong> and register
          your RhythmUltra device serial numbers to see reports.
        </p>
      </div>
    );
  }

  /* ── Filter reports ── */
  // authorizedSerialSet: strict ownership check — only show reports for serials
  // this org/user is explicitly authorized to see (defense-in-depth)
  const authorizedSerialSet = new Set(allSerials);

  const visible = reports.filter((r) => {
    // Hard ownership gate — drop report if serial not in authorized set
    if (!authorizedSerialSet.has(r.serial)) return false;

    const q = search.toLowerCase();
    const matchQ = !q ||
      r.serial?.toLowerCase().includes(q) ||
      r.report_type?.toLowerCase().includes(q) ||
      r.filename?.toLowerCase().includes(q) ||
      r.date_label?.toLowerCase().includes(q);
    const matchType = typeFilter === "All" || r.report_type === typeFilter;
    const matchSerial = serialFilter === "All" || r.serial === serialFilter;
    return matchQ && matchType && matchSerial;
  });

  /* ── Stats ── */
  const total12  = reports.filter((r) => r.report_type === "12_lead").length;
  const totalHrv  = reports.filter((r) => r.report_type === "hrv").length;
  const totalHk   = reports.filter((r) => r.report_type === "hyperkalemia").length;
  const totalHolt = reports.filter((r) => r.report_type === "holter").length;

  return (
    <div style={{ padding: "28px 32px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ color: C.text, fontSize: 20, fontWeight: 700, margin: 0 }}>ECG Reports</h2>
            {isLive ? (
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", background: C.ok + "22", color: C.ok, padding: "2px 8px", borderRadius: 4, letterSpacing: 0.5 }}>
                ● Live S3
              </span>
            ) : (
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", background: C.warn + "22", color: C.warn, padding: "2px 8px", borderRadius: 4, letterSpacing: 0.5 }}>
                ○ Offline
              </span>
            )}
          </div>
          <p style={{ color: C.sub, fontSize: 13, marginTop: 4 }}>
            {perms.isHead ? "All reports from all org devices" :
             perms.isAdmin ? "All reports — view only (no PDF access)" :
             "Reports from registered devices"}
            {" · "}Devices: {allSerials.map(s => <SerialBadge key={s} serial={s} />).reduce((a, b) => <>{a} {b}</>)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.sub, cursor: "pointer", padding: "7px 12px", fontSize: 13 }}
          >
            <Filter size={13} /> Filters <ChevronDown size={12} style={{ transform: showFilters ? "rotate(180deg)" : "none" }} />
          </button>
          <button
            onClick={load}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.sub, cursor: "pointer", padding: "7px 14px", fontSize: 13 }}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Stats row ── */}
      {!loading && reports.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { label: "Total Reports", value: reports.length, color: C.blue2 },
            { label: "12-Lead ECG",   value: total12,        color: C.blue2 },
            { label: "HRV",           value: totalHrv,       color: C.ok },
            { label: "Hyperkalemia",  value: totalHk,        color: C.warn },
            { label: "Holter",        value: totalHolt,      color: C.purple },
          ].map((stat) => (
            <div key={stat.label} style={{
              background: C.panel, border: `1px solid ${C.borderGlass}`,
              borderRadius: 10, padding: "10px 18px", backdropFilter: "blur(10px)",
            }}>
              <div style={{ color: C.sub, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>{stat.label}</div>
              <div style={{ color: stat.color, fontSize: 22, fontWeight: 800, marginTop: 2 }}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Expandable Filters ── */}
      {showFilters && (
        <div style={{
          background: C.panel, border: `1px solid ${C.borderGlass}`,
          borderRadius: 12, padding: "16px 20px", marginBottom: 16,
          display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end",
        }}>
          <div>
            <div style={{ color: C.sub, fontSize: 11, fontWeight: 600, marginBottom: 5, letterSpacing: 0.4, textTransform: "uppercase" }}>Search</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Serial, type, date…"
              style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "8px 12px", fontSize: 13, outline: "none", width: 200 }}
            />
          </div>
          <div>
            <div style={{ color: C.sub, fontSize: 11, fontWeight: 600, marginBottom: 5, letterSpacing: 0.4, textTransform: "uppercase" }}>Report Type</div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "8px 12px", fontSize: 13, outline: "none" }}
            >
              {["All", "12_lead", "hrv", "hyperkalemia", "holter", "raw_ecg", "ecg"].map((t) => (
                <option key={t} value={t}>{t === "All" ? "All Types" : TYPE_META[t]?.label || t}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ color: C.sub, fontSize: 11, fontWeight: 600, marginBottom: 5, letterSpacing: 0.4, textTransform: "uppercase" }}>Device</div>
            <select
              value={serialFilter}
              onChange={(e) => setSerialFilter(e.target.value)}
              style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "8px 12px", fontSize: 13, outline: "none" }}
            >
              <option value="All">All Devices</option>
              {allSerials.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ color: C.sub, fontSize: 11, fontWeight: 600, marginBottom: 5, letterSpacing: 0.4, textTransform: "uppercase" }}>Days Back</div>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "8px 12px", fontSize: 13, outline: "none" }}
            >
              {[7, 14, 30, 60, 90, 180, 365].map((d) => (
                <option key={d} value={d}>Last {d} days</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{
          background: C.panel, border: `1px solid ${C.borderGlass}`,
          borderRadius: 14, padding: "60px 0", textAlign: "center", backdropFilter: "blur(12px)",
        }}>
          <RefreshCw size={28} color={C.blue2} style={{ marginBottom: 12, animation: "spin 1s linear infinite" }} />
          <p style={{ color: C.sub, margin: 0, fontSize: 14 }}>
            Scanning S3 for reports from {allSerials.join(", ")}…
          </p>
          <p style={{ color: C.sub, margin: "4px 0 0", fontSize: 12, opacity: 0.6 }}>
            Checking last {days} days
          </p>
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <div style={{ background: C.danger + "18", border: `1px solid ${C.danger}44`, borderRadius: 10, padding: "16px 22px" }}>
          <div style={{ color: C.danger, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
            <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            Failed to load reports
          </div>
          <div style={{ color: C.sub, fontSize: 13, marginBottom: 12 }}>{error}</div>
          <div style={{ color: C.sub, fontSize: 12.5, background: C.panel2, borderRadius: 8, padding: "10px 14px" }}>
            <strong style={{ color: C.text }}>Make sure the FastAPI server is running:</strong>
            <br />
            <code style={{ color: C.blue2 }}>uvicorn server.main:app --reload --port 8000</code>
          </div>
          <button onClick={load} style={{ marginTop: 12, background: "none", border: `1px solid ${C.blue1}`, borderRadius: 8, color: C.blue2, cursor: "pointer", padding: "7px 14px", fontSize: 13, fontWeight: 600 }}>
            Retry
          </button>
        </div>
      )}

      {/* ── Table ── */}
      {!loading && !error && (
        <div style={{ background: C.panel, borderRadius: 14, border: `1px solid ${C.borderGlass}`, backdropFilter: "blur(12px)", overflow: "hidden" }}>
          {visible.length === 0 ? (
            <div style={{ padding: "60px 0", textAlign: "center" }}>
              <FileText size={40} color={C.sub} style={{ marginBottom: 12, opacity: 0.35 }} />
              <p style={{ color: C.text, margin: 0, fontSize: 15, fontWeight: 600 }}>No reports found</p>
              <p style={{ color: C.sub, margin: "6px 0 0", fontSize: 13 }}>
                {reports.length > 0
                  ? "No reports match the current filters."
                  : `No ECG reports found in S3 for the last ${days} days.`}
              </p>
              {reports.length === 0 && (
                <p style={{ color: C.sub, fontSize: 12, marginTop: 6, opacity: 0.7 }}>
                  Reports are stored at <code style={{ color: C.blue2 }}>reports/YYYY/MM/DD/{"{serial}"}/ </code>in S3
                </p>
              )}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 700 }}>
                <thead>
                  <tr>
                    {["Device", "Type", "Date", "Size", "Status", "Actions"].map((col) => (
                      <th key={col} style={{
                        textAlign: "left", color: C.sub, fontWeight: 600,
                        padding: "12px 16px", fontSize: 11.5, letterSpacing: 0.4,
                        textTransform: "uppercase", borderBottom: `1px solid ${C.borderGlass}`,
                      }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r, i) => {
                    const isApproved = orgData?.approvedReports?.[r.report_id];
                    return (
                      <tr
                        key={r.report_id || i}
                        style={{ borderTop: i > 0 ? `1px solid ${C.borderGlass}` : "none" }}
                      >
                        {/* Device serial */}
                        <td style={{ padding: "13px 16px" }}>
                          <SerialBadge serial={r.serial} />
                        </td>
                        {/* Report type */}
                        <td style={{ padding: "13px 16px" }}>
                          <TypeBadge type={r.report_type} />
                        </td>
                        {/* Date */}
                        <td style={{ padding: "13px 16px", color: C.text, fontSize: 13 }}>
                          {r.date_label || (r.created_at
                            ? new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                            : "—")}
                          {r.created_at && (
                            <div style={{ color: C.sub, fontSize: 11, marginTop: 2 }}>
                              {new Date(r.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                        </td>
                        {/* Size */}
                        <td style={{ padding: "13px 16px", color: C.sub, fontSize: 12.5 }}>
                          {r.size_bytes > 0
                            ? `${(r.size_bytes / 1024).toFixed(1)} KB`
                            : "—"}
                        </td>
                        {/* Status */}
                        <td style={{ padding: "13px 16px" }}>
                          {isApproved ? (
                            <span style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              background: C.ok + "18",
                              color: C.ok,
                              fontSize: 12,
                              fontWeight: 700,
                              padding: "4px 10px",
                              borderRadius: 20,
                            }} title={`Approved at ${new Date(isApproved.approvedAt).toLocaleString()}`}>
                              <CheckCircle size={12} /> Approved ({isApproved.approvedBy})
                            </span>
                          ) : (
                            <span style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              background: C.warn + "18",
                              color: C.warn,
                              fontSize: 12,
                              fontWeight: 700,
                              padding: "4px 10px",
                              borderRadius: 20,
                            }}>
                              <Clock size={12} /> Pending Review
                            </span>
                          )}
                        </td>
                        {/* Actions */}
                        <td style={{ padding: "13px 16px" }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            {/* Approve button — only for Doctor org roles with canApprove permission */}
                            {isDoctorOrg && perms.canApprove && !isApproved && (
                              <button
                                onClick={() => handleApprove(r.report_id)}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "5px 12px",
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  background: C.ok,
                                  color: "white",
                                  border: "none",
                                  cursor: "pointer",
                                  boxShadow: "0 2px 4px rgba(63,167,114,0.3)"
                                }}
                              >
                                Approve
                              </button>
                            )}
                            {/* Already approved badge for doctor view */}
                            {isDoctorOrg && isApproved && (
                              <span style={{ fontSize: 11, color: C.ok, fontStyle: "italic" }}>
                                ✓ You approved this
                              </span>
                            )}
                            {/* PDF — visible to all except Receptionist */}
                            {perms.canViewPDF && r.pdf_url ? (
                              <>
                                <button
                                  onClick={() => setActivePdfUrl(r.pdf_url)}
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 4,
                                    padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                                    background: C.blue1 + "22", color: C.blue2,
                                    border: `1px solid ${C.blue1}44`, textDecoration: "none",
                                    cursor: "pointer"
                                  }}
                                >
                                  <Eye size={12} /> PDF
                                </button>
                                <a
                                  href={r.pdf_url}
                                  download
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 4,
                                    padding: "5px 9px", borderRadius: 6, fontSize: 12,
                                    background: "transparent", color: C.sub,
                                    border: `1px solid ${C.border}`, textDecoration: "none",
                                  }}
                                  title="Download PDF"
                                >
                                  <Download size={12} />
                                </a>
                              </>
                            ) : r.pdf_url ? (
                              <span style={{ color: C.sub, fontSize: 12, opacity: 0.5 }}>PDF — no access</span>
                            ) : (
                              <span style={{ color: C.sub, fontSize: 12, opacity: 0.4 }}>No PDF</span>
                            )}
                            {/* JSON — heads only (Disabled) */}
                            {/* {perms.canViewJSON && r.json_url && (
                              <a
                                href={r.json_url}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 4,
                                  padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                                  background: C.ok + "18", color: C.ok,
                                  border: `1px solid ${C.ok}44`, textDecoration: "none",
                                }}
                                title="View raw JSON data"
                              >
                                <Database size={11} /> JSON
                              </a>
                            )} */}
                            {/* Waveform Analysis */}
                            {r.json_url && (
                              <button
                                onClick={() => setActiveWaveformUrl(r.json_url)}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 4,
                                  padding: "5px 10.5px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                                  background: "rgba(34, 211, 238, 0.12)", color: "#22d3ee",
                                  border: "1px solid rgba(34, 211, 238, 0.35)",
                                  cursor: "pointer"
                                }}
                                title="Open Interactive Waveform Analysis"
                              >
                                <Activity size={11} /> Waveform
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PDF Preview Modal Overlay */}
      {activePdfUrl && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: "rgba(9, 14, 23, 0.9)",
          backdropFilter: "blur(10px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "24px",
          boxSizing: "border-box"
        }}>
          <div style={{
            background: "#0f172a",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "16px",
            width: "100%",
            maxWidth: "1000px",
            height: "90vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 24px 48px rgba(0, 0, 0, 0.6)",
            overflow: "hidden"
          }}>
            {/* Header */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 20px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              background: "rgba(30, 41, 59, 0.5)"
            }}>
              <span style={{ fontWeight: 600, color: "#f8fafc", fontSize: "14px" }}>
                Report PDF Preview
              </span>
              <button 
                onClick={() => setActivePdfUrl(null)}
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "none",
                  borderRadius: "6px",
                  color: "#f8fafc",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: "600",
                  padding: "6px 12px",
                  transition: "background 0.15s"
                }}
                onMouseOver={(e) => e.target.style.background = "rgba(255, 255, 255, 0.15)"}
                onMouseOut={(e) => e.target.style.background = "rgba(255, 255, 255, 0.08)"}
              >
                Close (✕)
              </button>
            </div>
            {/* PDF iframe */}
            <iframe 
              src={activePdfUrl} 
              style={{
                flex: 1,
                border: "none",
                width: "100%",
                height: "100%",
                background: "#ffffff"
              }}
              title="PDF Preview"
            />
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      {!loading && !error && visible.length > 0 && (
        <p style={{ color: C.sub, fontSize: 12, marginTop: 10 }}>
          Showing {visible.length} of {reports.length} report{reports.length !== 1 ? "s" : ""}
          {" · "}Presigned URLs valid for 15 minutes
          {" · "}S3 bucket: <code style={{ color: C.blue2 }}>deck-backend-demo</code>
        </p>
      )}

      {/* Waveform Analysis Modal Overlay */}
      {activeWaveformUrl && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: "rgba(9, 14, 23, 0.96)",
          display: "flex",
          flexDirection: "column",
          padding: "20px",
          boxSizing: "border-box"
        }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <WaveformAnalysis 
              preloadedReportUrl={activeWaveformUrl} 
              onClose={() => setActiveWaveformUrl(null)} 
              hideSelector={true}
            />
          </div>
        </div>
      )}

      {/* spin animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
