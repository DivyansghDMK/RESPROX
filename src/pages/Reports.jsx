import React, { useState } from 'react';
import GlassCard from '../components/GlassCard';
import { FileIcon, DownloadIcon, ShareIcon, InfoIcon } from '../components/Icons';

const mockReports = [
  { id: '1', date: '2026-06-08', usage: '7h 32m', ahi: 2.1, leak: '24 L/min', pressure: '11.8 cmH₂O', compliance: 'Yes' },
  { id: '2', date: '2026-06-07', usage: '6h 54m', ahi: 1.8, leak: '21 L/min', pressure: '12.0 cmH₂O', compliance: 'Yes' },
  { id: '3', date: '2026-06-06', usage: '8h 12m', ahi: 2.5, leak: '26 L/min', pressure: '11.5 cmH₂O', compliance: 'Yes' },
  { id: '4', date: '2026-06-05', usage: '4h 15m', ahi: 3.2, leak: '29 L/min', pressure: '12.2 cmH₂O', compliance: 'No' },
  { id: '5', date: '2026-06-04', usage: '7h 05m', ahi: 1.9, leak: '22 L/min', pressure: '11.9 cmH₂O', compliance: 'Yes' },
  { id: '6', date: '2026-06-03', usage: '7h 55m', ahi: 1.5, leak: '20 L/min', pressure: '12.4 cmH₂O', compliance: 'Yes' },
  { id: '7', date: '2026-06-02', usage: '8h 02m', ahi: 0.9, leak: '17 L/min', pressure: '11.8 cmH₂O', compliance: 'Yes' }
];

export default function Reports() {
  const [patient, setPatient] = useState('Divyansh');
  const [startDate, setStartDate] = useState('2026-06-01');
  const [endDate, setEndDate] = useState('2026-06-08');

  const handleAction = (action) => {
    alert(`${action} triggered for Patient: ${patient} from ${startDate} to ${endDate}`);
  };

  return (
    <div className="reports-page">
      {/* Filters Card */}
      <GlassCard className="reports-header-card">
        <div className="section-title">
          <h2>Clinical Report Filters</h2>
        </div>
        <div className="reports-filters-grid">
          <div className="input-field">
            <label htmlFor="patient-select">Patient</label>
            <select
              id="patient-select"
              value={patient}
              onChange={(e) => setPatient(e.target.value)}
              aria-label="Select Patient"
            >
              <option value="Divyansh">Divyansh</option>
              <option value="John Doe">John Doe</option>
              <option value="Jane Smith">Jane Smith</option>
            </select>
          </div>
          <div className="input-field">
            <label htmlFor="start-date">Start Date</label>
            <input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Start Date"
            />
          </div>
          <div className="input-field">
            <label htmlFor="end-date">End Date</label>
            <input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="End Date"
            />
          </div>
        </div>

        {/* Actions bar */}
        <div className="reports-actions-bar">
          <button className="icon-text-button" onClick={() => handleAction('View PDF')}>
            <FileIcon />
            <span>View PDF</span>
          </button>
          <button className="icon-text-button" onClick={() => handleAction('Download PDF')}>
            <DownloadIcon />
            <span>Download PDF</span>
          </button>
          <button className="icon-text-button" onClick={() => handleAction('Share Report')}>
            <ShareIcon />
            <span>Share Report</span>
          </button>
        </div>
      </GlassCard>

      {/* Reports Table */}
      <GlassCard style={{ marginTop: '20px' }}>
        <div className="section-title table-title-row">
          <h2>Compliance & Clinical History</h2>
          <span className="info-badge">
            <InfoIcon /> Active Patient: {patient}
          </span>
        </div>
        <div className="table-responsive">
          <table className="glass-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Usage</th>
                <th>AHI</th>
                <th>Leak Rate</th>
                <th>Pressure</th>
                <th>Compliance</th>
              </tr>
            </thead>
            <tbody>
              {mockReports.map((report) => (
                <tr key={report.id}>
                  <td><strong>{report.date}</strong></td>
                  <td>{report.usage}</td>
                  <td>{report.ahi} / hr</td>
                  <td>{report.leak}</td>
                  <td>{report.pressure}</td>
                  <td>
                    <span className={`compliance-tag ${report.compliance === 'Yes' ? 'pass' : 'fail'}`}>
                      {report.compliance === 'Yes' ? 'Passed' : 'Failed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
