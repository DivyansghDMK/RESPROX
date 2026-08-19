import { useNotify } from '../context/NotifyContext';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft, Send, CheckCircle2 } from 'lucide-react';
import { useTherapy } from '../context/TherapyContext';

const LS_KEY = "decklink_data_v3";

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
  physicians: { org1: [], org2: [] },
  insurers: { org1: [], org2: [] },
  locations: { org1: [], org2: [] },
  patients: { org1: [], org2: [] },
  approvedReports: {}
});

// Stylings consistent with HCP Portal glassmorphism theme
const COLORS = {
  bg: "#0B1220",
  text: "#ffffff",
  sub: "#8fa0dd",
  subText: "#64748b",
  border: "rgba(255, 255, 255, 0.08)",
  inputBg: "rgba(15, 23, 42, 0.6)",
  cyan: "#06b6d4",
  cyanDark: "#0891b2"
};

const pageStyle = {
  minHeight: "100vh",
  background: `
    radial-gradient(circle at 10% 10%, rgba(6, 182, 212, 0.08), transparent 45%),
    radial-gradient(circle at 90% 90%, rgba(16, 185, 129, 0.06), transparent 45%),
    linear-gradient(160deg, #070c16 0%, #0d1525 55%, #070c16 100%)
  `,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  fontFamily: "'Outfit', system-ui, -apple-system, sans-serif",
  boxSizing: "border-box"
};

const cardStyle = {
  background: "rgba(11, 18, 32, 0.85)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: "24px",
  padding: "36px 40px",
  width: "100%",
  maxWidth: "520px",
  boxShadow: "0 32px 64px rgba(0,0,0,0.65)",
  backdropFilter: "blur(20px)",
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box"
};

const inputStyle = {
  background: COLORS.inputBg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: "10px",
  color: COLORS.text,
  padding: "10px 14px",
  fontSize: "13.5px",
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  transition: "border-color 0.2s",
  marginTop: "4px"
};

const selectStyle = {
  ...inputStyle,
  cursor: "pointer",
  height: "39px"
};

const labelStyle = {
  color: "rgba(255, 255, 255, 0.65)",
  fontSize: "11px",
  fontWeight: "700",
  textTransform: "uppercase",
  letterSpacing: "1px"
};

const submitBtnStyle = {
  background: `linear-gradient(135deg, ${COLORS.cyan} 0%, ${COLORS.cyanDark} 100%)`,
  color: COLORS.text,
  fontWeight: "700",
  fontSize: "14px",
  border: "none",
  borderRadius: "12px",
  padding: "12px 20px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  width: "100%",
  boxSizing: "border-box",
  transition: "transform 0.1s, opacity 0.2s",
  marginTop: "12px",
  boxShadow: "0 10px 15px -3px rgba(6, 182, 212, 0.2)"
};

const backBtnStyle = {
  background: "rgba(255, 255, 255, 0.03)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "30px",
  color: "#94a3b8",
  padding: "8px 16px",
  fontSize: "12px",
  fontWeight: "600",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "6px",
  marginBottom: "20px",
  alignSelf: "flex-start",
  transition: "color 0.2s, border-color 0.2s"
};

export default function CreateOrg() {
  const notify = useNotify();
  const navigate = useNavigate();
  const { setShowToast, setSaveState, setToastMessage } = useTherapy();
  
  const [form, setForm] = useState({
    orgName: '',
    orgType: 'Healthcare Professional',
    city: '',
    headName: '',
    email: '',
    phone: '',
    providerId: '',
    password: ''
  });

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const setVal = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      let db = {};
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) db = JSON.parse(raw);
      } catch (err) {}

      if (!db.orgs || !db.users) {
        db = seedData();
      }

      const orgId = "org_" + Date.now();
      const userId = "u_" + Date.now();

      const newOrg = {
        id: orgId,
        name: form.orgName,
        type: form.orgType
      };

      const newUser = {
        id: userId,
        name: form.headName,
        role: form.orgType === 'Doctors' ? 'Head doctor' : 'HCP Head',
        email: form.email,
        phone: form.phone,
        providerId: form.providerId || '',
        password: form.password,
        isFirstLogin: true
      };

      db.orgs.push(newOrg);
      db.users[orgId] = [newUser];
      db.patients[orgId] = [];
      db.physicians[orgId] = [];
      db.insurers[orgId] = [];
      db.locations[orgId] = [];

      localStorage.setItem(LS_KEY, JSON.stringify(db));

      const hcpLoginUrl = `${window.location.origin}/hcp`;
      const emailBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #0f172a; margin-top: 0;">Congratulations!</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">
            Your clinical organization <strong>${form.orgName}</strong> has been registered on DeckLink.
          </p>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">
            You have been assigned as the Organization Head Administrator. You can sign in using your credentials on the clinician portal.
          </p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <h4 style="margin: 0 0 10px 0; color: #0f172a; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Portal Credentials</h4>
            <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
              <tr>
                <td style="padding: 4px 0; color: #64748b; width: 120px;">Organization:</td>
                <td style="padding: 4px 0; color: #0f172a; font-weight: bold;">${form.orgName}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Username:</td>
                <td style="padding: 4px 0; color: #0f172a; font-weight: bold;">${form.headName}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Password:</td>
                <td style="padding: 4px 0; color: #0f172a; font-weight: bold; font-family: monospace;">${form.password}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Assigned Role:</td>
                <td style="padding: 4px 0; color: #0f172a;">${newUser.role}</td>
              </tr>
            </table>
          </div>

          <div style="margin: 28px 0; text-align: center;">
            <a href="${hcpLoginUrl}" style="background-color: #0ea5e9; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
              Open Clinician Portal (HCP)
            </a>
          </div>
          <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 24px 0;"/>
          <p style="color: #64748b; font-size: 11px;">
            This is an automated clinical notification. If you did not register this clinic, please contact DeckLink Support.
          </p>
        </div>
      `;

      let emailSent = false;
      try {
        const res = await fetch('http://localhost:8000/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to_email: form.email,
            subject: 'DeckLink Clinician Account Created - ' + form.orgName,
            html_body: emailBody
          })
        });
        if (res.ok) emailSent = true;
      } catch (err) {
        console.warn("AWS SES Send failed:", err);
      }

      setResult({
        orgName: form.orgName,
        headName: form.headName,
        email: form.email,
        password: form.password,
        emailSent
      });

      setForm({
        orgName: '',
        orgType: 'Healthcare Professional',
        city: '',
        headName: '',
        email: '',
        phone: '',
        providerId: '',
        password: ''
      });

      setToastMessage('Organization registered successfully!');
      setSaveState('success');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);

    } catch (error) {
      notify.fromError(error, { action: "register this organization" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={{ width: "100%", maxWidth: "520px", display: "flex", flexDirection: "column" }}>
        
        {/* Back navigation */}
        <button 
          onClick={() => navigate('/hcp')}
          style={backBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
        >
          <ArrowLeft size={13} /> Clinician Portal
        </button>

        <div style={cardStyle}>
          {/* Logo & Header */}
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "10px" }}>
              <Sparkles style={{ color: COLORS.cyan }} size={24} />
              <span style={{ color: COLORS.text, fontWeight: 800, fontSize: "24px", tracking: "wider", fontFamily: "monospace" }}>
                Deck<span style={{ color: COLORS.cyan }}>Link</span>
              </span>
            </div>
            <h2 style={{ color: COLORS.text, fontWeight: "700", fontSize: "19px", margin: "0 0 6px 0" }}>Register Medical Organization</h2>
            <p style={{ color: COLORS.sub, fontSize: "13px", margin: 0, opacity: 0.85 }}>Configure clinical portal access and set up the head physician account</p>
          </div>

          {!result ? (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              
              {/* Org Name */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <label style={labelStyle}>Organization Name</label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. Metro Cardiology Group"
                  value={form.orgName}
                  onChange={setVal('orgName')}
                  style={inputStyle}
                />
              </div>

              {/* Org Type / City Row */}
              <div style={{ display: "flex", gap: "16px" }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  <label style={labelStyle}>Org Type</label>
                  <select 
                    value={form.orgType}
                    onChange={setVal('orgType')}
                    style={selectStyle}
                  >
                    <option value="Healthcare Professional">HCP Group</option>
                    <option value="Doctors">Doctors (Clinic)</option>
                  </select>
                </div>
                
                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  <label style={labelStyle}>City</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. Faridabad"
                    value={form.city}
                    onChange={setVal('city')}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Head Name */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <label style={labelStyle}>Head Administrator Name</label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. Dr. Karan Bose"
                  value={form.headName}
                  onChange={setVal('headName')}
                  style={inputStyle}
                />
              </div>

              {/* Email / Phone Row */}
              <div style={{ display: "flex", gap: "16px" }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  <label style={labelStyle}>Email Address</label>
                  <input 
                    type="email" 
                    required 
                    placeholder="karan.bose@clinic.com"
                    value={form.email}
                    onChange={setVal('email')}
                    style={inputStyle}
                  />
                </div>
                
                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  <label style={labelStyle}>Phone Number</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="10-digit mobile"
                    value={form.phone}
                    onChange={setVal('phone')}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Provider ID */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <label style={labelStyle}>Clinical Provider ID (Optional)</label>
                <input 
                  type="text" 
                  placeholder="e.g. PRV-2001"
                  value={form.providerId}
                  onChange={setVal('providerId')}
                  style={inputStyle}
                />
              </div>

              {/* Password */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <label style={labelStyle}>Sign-In Password</label>
                <input 
                  type="password" 
                  required 
                  placeholder="••••••••"
                  value={form.password}
                  onChange={setVal('password')}
                  style={inputStyle}
                />
              </div>

              {/* Submit */}
              <button 
                type="submit" 
                disabled={submitting}
                style={{
                  ...submitBtnStyle,
                  opacity: submitting ? 0.6 : 1,
                  cursor: submitting ? "not-allowed" : "pointer"
                }}
                onMouseEnter={(e) => { if(!submitting) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { if(!submitting) e.currentTarget.style.transform = 'none'; }}
              >
                <Send size={14} /> {submitting ? 'Registering...' : 'Register & Email Credentials'}
              </button>

            </form>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ 
                background: "rgba(16, 185, 129, 0.08)", 
                border: "1px solid rgba(16, 185, 129, 0.25)", 
                borderRadius: "14px", 
                padding: "20px", 
                display: "flex", 
                flexDirection: "column", 
                gap: "8px" 
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#10b981" }}>
                  <CheckCircle2 size={20} />
                  <strong style={{ fontSize: "14.5px", fontWeight: "700" }}>Organization Created Successfully!</strong>
                </div>
                <p style={{ margin: 0, fontSize: "12.5px", color: "#a7f3d0", lineHeight: "1.6" }}>
                  {result.emailSent 
                    ? `An onboarding welcome email has been sent successfully to ${result.email} containing their clinical head credentials.`
                    : `Organization is registered in system DB, but email dispatch failed (AWS SES verified sender check). You can manually share the login details below.`}
                </p>
              </div>

              <div style={{ background: "rgba(0, 0, 0, 0.3)", border: `1px solid ${COLORS.border}`, borderRadius: "14px", padding: "18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", color: COLORS.sub }}>Credentials details</span>
                <table style={{ width: "100%", fontSize: "13px", color: "#f1f5f9" }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: "4px 0", color: "#64748b", width: "110px" }}>Portal URL:</td>
                      <td style={{ padding: "4px 0", color: COLORS.cyan, fontWeight: "700" }}>{window.location.origin}/hcp</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "4px 0", color: "#64748b" }}>Organization:</td>
                      <td style={{ padding: "4px 0", color: "#ffffff", fontWeight: "700" }}>{result.orgName}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "4px 0", color: "#64748b" }}>User Name:</td>
                      <td style={{ padding: "4px 0", color: "#ffffff", fontWeight: "700" }}>{result.headName}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "4px 0", color: "#64748b" }}>Password:</td>
                      <td style={{ padding: "4px 0", color: "#34d399", fontFamily: "monospace", fontWeight: "700" }}>{result.password}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <button 
                onClick={() => setResult(null)}
                style={{
                  ...submitBtnStyle,
                  marginTop: "10px"
                }}
              >
                Register Another Organization
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
