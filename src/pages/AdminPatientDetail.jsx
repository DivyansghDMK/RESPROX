import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMockPatientDetail } from '../services/adminService';
import { useTherapy } from '../context/TherapyContext';
import GlassCard from '../components/GlassCard';

const STATUS_COLOR = {
  active:   { bg: '#e6f9f0', text: '#0f6e56', dot: '#1d9e75' },
  inactive: { bg: '#f1efe8', text: '#5f5e5a', dot: '#888780' },
  critical: { bg: '#fcebeb', text: '#a32d2d', dot: '#e24b4a' },
};

const AHI_BADGE = (ahi) => {
  if (ahi <= 5)  return { label: 'Normal',   bg: '#e6f9f0', text: '#0f6e56' };
  if (ahi <= 15) return { label: 'Mild',     bg: '#faeeda', text: '#854f0b' };
  if (ahi <= 30) return { label: 'Moderate', bg: '#faece7', text: '#993c1d' };
  return               { label: 'Severe',   bg: '#fcebeb', text: '#a32d2d' };
};

import AdminSettingsEditor from '../components/AdminSettingsEditor';

export default function AdminPatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setShowToast, setSaveState } = useTherapy();

  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPatientDetail = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMockPatientDetail(id);
      setPatient(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPatientDetail();
  }, [fetchPatientDetail]);

  if (loading) {
    return (
      <div className="admin-detail-page loading-state">
        <div className="admin-loading">
          <div className="admin-spinner" />
          <span>Loading patient details…</span>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="admin-detail-page error-state">
        <div className="admin-empty">
          <p>Patient not found or error loading profile.</p>
          <button className="admin-page-btn" onClick={() => navigate('/admin')}>
            ← Back to Patients
          </button>
        </div>
      </div>
    );
  }

  const sc = STATUS_COLOR[patient.status] || STATUS_COLOR.inactive;
  const ab = AHI_BADGE(patient.ahi);
  const initials = patient.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // Find max values in sessions to scale the bar charts
  const maxAHI = Math.max(...patient.sessions.map((s) => s.ahi), 5);
  const maxUsage = Math.max(...patient.sessions.map((s) => s.usage_hours), 8);
  const maxLeak = Math.max(...patient.sessions.map((s) => s.mask_leak), 24);

  return (
    <div className="admin-detail-page">
      
      {/* ── Header Area ── */}
      <div className="admin-detail-header-row">
        <button className="admin-back-btn" onClick={() => navigate('/admin')}>
          ← Back to Patients
        </button>
        <div className="admin-patient-profile">
          <div className="admin-profile-avatar">{initials}</div>
          <div className="admin-profile-info">
            <div className="admin-profile-name-row">
              <h1>{patient.name}</h1>
              <span className="admin-status-pill" style={{ background: sc.bg, color: sc.text }}>
                <span className="admin-status-dot" style={{ background: sc.dot }} />
                {patient.status}
              </span>
            </div>
            <div className="admin-profile-sub">
              <span><strong>ID:</strong> {patient.id}</span>
              <span><strong>Age:</strong> {patient.age}y</span>
              <span><strong>Gender:</strong> {patient.gender}</span>
              <span><strong>Device:</strong> {patient.device_model} ({patient.device_id})</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <div className="admin-detail-kpis">
        <div className="admin-kpi-card">
          <span className="admin-kpi-label">AHI (Events/hr)</span>
          <span className="admin-kpi-value">{patient.ahi}</span>
          <span className="admin-kpi-badge" style={{ background: ab.bg, color: ab.text }}>
            {ab.label}
          </span>
        </div>
        <div className="admin-kpi-card">
          <span className="admin-kpi-label">Mask Leak</span>
          <span className="admin-kpi-value">{patient.mask_leak} <span className="unit">L/min</span></span>
          <span className={`admin-kpi-badge ${patient.mask_leak < 24 ? 'good' : 'warning'}`}>
            {patient.mask_leak < 24 ? 'Optimal Leak' : 'High Leak'}
          </span>
        </div>
        <div className="admin-kpi-card">
          <span className="admin-kpi-label">95th Percentile Pressure</span>
          <span className="admin-kpi-value">{patient.pressure_95} <span className="unit">cmH₂O</span></span>
          <span className="admin-kpi-badge info">Therapy Target</span>
        </div>
        <div className="admin-kpi-card">
          <span className="admin-kpi-label">Last Session Usage</span>
          <span className="admin-kpi-value">{patient.usage_hours} <span className="unit">hrs</span></span>
          <span className={`admin-kpi-badge ${patient.usage_hours >= 4 ? 'good' : 'warning'}`}>
            {patient.usage_hours >= 4 ? 'Compliant Usage' : 'Short Usage'}
          </span>
        </div>
        <div className="admin-kpi-card">
          <span className="admin-kpi-label">Compliance Rate (7d)</span>
          <span className="admin-kpi-value">{patient.compliance_pct}%</span>
          <span className={`admin-kpi-badge ${patient.compliance_pct >= 70 ? 'good' : 'warning'}`}>
            {patient.compliance_pct >= 70 ? 'Adherent' : 'Non-Adherent'}
          </span>
        </div>
      </div>

      {/* ── Mid Columns ── */}
      <div className="admin-detail-grid">
        
        {/* Configuration Card */}
        <AdminSettingsEditor patientId={patient.id} initial={patient} />

        {/* 7-Day trends card */}
        <GlassCard className="admin-trends-card">
          <div className="section-title">
            <h2>7-Day Therapy History</h2>
          </div>
          
          <div className="admin-trend-mini-section">
            <div className="trend-header">
              <h3>AHI Trend (Events/hr)</h3>
              <span className="trend-target">Target: ≤ 5.0</span>
            </div>
            <div className="mini-chart-container">
              {patient.sessions.map((s, idx) => {
                const heightPct = Math.min((s.ahi / maxAHI) * 100, 100);
                const isOverTarget = s.ahi > 5.0;
                return (
                  <div key={idx} className="mini-chart-bar-wrap">
                    <div className="mini-chart-tooltip">{s.ahi}</div>
                    <div className="mini-chart-bar-bg">
                      <div
                        className={`mini-chart-bar-fill ${isOverTarget ? 'warning' : 'good'}`}
                        style={{ height: `${heightPct || 4}%` }}
                      />
                    </div>
                    <span className="mini-chart-date">{s.date.split(' ')[0]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="admin-trend-mini-section">
            <div className="trend-header">
              <h3>Usage hours</h3>
              <span className="trend-target">Target: ≥ 4.0h</span>
            </div>
            <div className="mini-chart-container">
              {patient.sessions.map((s, idx) => {
                const heightPct = Math.min((s.usage_hours / maxUsage) * 100, 100);
                const isCompliant = s.usage_hours >= 4.0;
                return (
                  <div key={idx} className="mini-chart-bar-wrap">
                    <div className="mini-chart-tooltip">{s.usage_hours}h</div>
                    <div className="mini-chart-bar-bg">
                      <div
                        className={`mini-chart-bar-fill ${isCompliant ? 'good' : 'warning'}`}
                        style={{ height: `${heightPct || 4}%` }}
                      />
                    </div>
                    <span className="mini-chart-date">{s.date.split(' ')[0]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="admin-trend-mini-section">
            <div className="trend-header">
              <h3>Mask Leak (L/min)</h3>
              <span className="trend-target">Target: ≤ 24 L/min</span>
            </div>
            <div className="mini-chart-container">
              {patient.sessions.map((s, idx) => {
                const heightPct = Math.min((s.mask_leak / maxLeak) * 100, 100);
                const isLeakHigh = s.mask_leak > 24.0;
                return (
                  <div key={idx} className="mini-chart-bar-wrap">
                    <div className="mini-chart-tooltip">{s.mask_leak} L</div>
                    <div className="mini-chart-bar-bg">
                      <div
                        className={`mini-chart-bar-fill ${isLeakHigh ? 'warning' : 'neutral'}`}
                        style={{ height: `${heightPct || 4}%` }}
                      />
                    </div>
                    <span className="mini-chart-date">{s.date.split(' ')[0]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </GlassCard>

      </div>

      {/* ── History Table ── */}
      <GlassCard className="admin-logs-card">
        <div className="section-title">
          <h2>Session Log History (Past 7 Days)</h2>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Usage Hours</th>
                <th>AHI</th>
                <th>Mask Leak</th>
                <th>95th Pressure</th>
                <th>Compliance Status</th>
              </tr>
            </thead>
            <tbody>
              {[...patient.sessions].reverse().map((s, idx) => {
                const isCompliant = s.usage_hours >= 4.0;
                return (
                  <tr key={idx}>
                    <td><strong>{s.date}</strong></td>
                    <td>{s.usage_hours} hrs</td>
                    <td>
                      <span className="admin-badge" style={{
                        background: s.ahi <= 5 ? '#e6f9f0' : '#faece7',
                        color: s.ahi <= 5 ? '#0f6e56' : '#993c1d'
                      }}>
                        {s.ahi}
                      </span>
                    </td>
                    <td>{s.mask_leak} L/min</td>
                    <td>{s.pressure_95} cmH₂O</td>
                    <td>
                      <span className="admin-status-pill" style={{
                        background: isCompliant ? '#e6f9f0' : '#fcebeb',
                        color: isCompliant ? '#0f6e56' : '#a32d2d'
                      }}>
                        <span className="admin-status-dot" style={{
                          background: isCompliant ? '#1d9e75' : '#e24b4a'
                        }} />
                        {isCompliant ? 'Compliant' : 'Non-compliant'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

    </div>
  );
}
