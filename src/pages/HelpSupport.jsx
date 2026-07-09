import React, { useState } from 'react';
import GlassCard from '../components/GlassCard';
import { HelpIcon, DownloadIcon, FileIcon } from '../components/Icons';

export default function HelpSupport() {
  const [openFaq, setOpenFaq] = useState(null);

  const faqs = [
    { q: 'How often should I change my CPAP mask cushion?', a: 'Mask cushions should be swapped every 3 to 6 months to prevent seal leaks, skin rashes, and bacteria build-up.' },
    { q: 'What pressure range is optimal for Obstructive Apnea?', a: 'Standard pressure setting ranges between 6 and 14 cmH₂O. Consult your therapist before altering these configurations.' },
    { q: 'Why does my humidifier run out of water during sleep?', a: 'This is usually caused by excessive mask leaks or dry ambient room humidity. Check mask fits or reduce the humidity setting.' },
    { q: 'How do I download historical compliance PDFs?', a: 'Go to the Reports page, adjust the patient date filters, and click the Download PDF button.' }
  ];

  const handleDiagnosticAction = (action) => {
    alert(`Initiating diagnostic procedure: "${action}"... Downloading report.`);
  };

  const handleSupportTicket = () => {
    alert('Support system accessed. Raising new patient service ticket...');
  };

  return (
    <div className="helpsupport-page">
      <div className="section-grid-2">
        {/* FAQs Accordion */}
        <GlassCard>
          <div className="section-title">
            <h2>Frequently Asked Questions</h2>
          </div>
          <div className="faq-list">
            {faqs.map((faq, idx) => (
              <div key={idx} className="faq-item">
                <button
                  className={`faq-question-btn ${openFaq === idx ? 'expanded' : ''}`}
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  aria-expanded={openFaq === idx}
                >
                  <span>{faq.q}</span>
                  <span>{openFaq === idx ? '−' : '+'}</span>
                </button>
                {openFaq === idx && (
                  <div className="faq-answer-panel">
                    <p>{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Support & Contacts */}
        <GlassCard>
          <div className="section-title">
            <h2>Contact Patient Support</h2>
          </div>
          <div className="support-contacts-wrapper">
            <div className="support-info-block">
              <h3>Support Helpdesk</h3>
              <p>Email: <a href="mailto:support@decklink.com">support@decklink.com</a></p>
              <p>Phone: +91 XXXXX XXXXX</p>
              <p>Hours: Mon - Fri (09:00 AM - 06:00 PM IST)</p>
            </div>

            <div className="support-buttons-column" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button className="icon-text-button outline" onClick={handleSupportTicket}>
                Raise Support Ticket
              </button>
              <a href="mailto:support@decklink.com" className="icon-text-button" style={{ display: 'inline-flex', textDecoration: 'none', justifyContent: 'center', alignItems: 'center' }}>
                Email Helpdesk
              </a>
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="section-grid-2" style={{ marginTop: '20px' }}>
        {/* User Manuals & Tutorials */}
        <GlassCard>
          <div className="section-title">
            <h2>User Manuals & Tutorials</h2>
          </div>
          <div className="downloads-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="download-item-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileIcon />
                <div>
                  <strong>DeckLink User Manual v1.2</strong>
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)' }}>PDF • 4.2 MB</span>
                </div>
              </div>
              <button className="icon-button" aria-label="Download DeckLink User Manual v1.2">
                <DownloadIcon />
              </button>
            </div>

            <div className="download-item-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileIcon />
                <div>
                  <strong>Mask Fitting Guide</strong>
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)' }}>PDF • 1.8 MB</span>
                </div>
              </div>
              <button className="icon-button" aria-label="Download Mask Fitting Guide">
                <DownloadIcon />
              </button>
            </div>
          </div>
        </GlassCard>

        {/* Diagnostics & Logs */}
        <GlassCard>
          <div className="section-title">
            <h2>System Diagnostics & Logs</h2>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '16px', lineHeight: '1.6' }}>
            If you encounter connection or pressure stability issues, export these logs for provider inspection.
          </p>
          <div className="diagnostics-actions-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
            <button className="icon-text-button outline" onClick={() => handleDiagnosticAction('System Logs')}>
              <DownloadIcon />
              <span>Download System Logs</span>
            </button>
            <button className="icon-text-button outline" onClick={() => handleDiagnosticAction('Device Diagnostics')}>
              <DownloadIcon />
              <span>Download Device Diagnostics</span>
            </button>
            <button className="icon-text-button outline" onClick={() => handleDiagnosticAction('Export Telemetry')}>
              <DownloadIcon />
              <span>Export Telemetry Logs</span>
            </button>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
