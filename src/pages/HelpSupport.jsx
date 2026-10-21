import React, { useState } from 'react';
import GlassCard from '../components/GlassCard';

export default function HelpSupport() {
  const [openFaq, setOpenFaq] = useState(null);

  const faqs = [
    { q: 'How often should I change my CPAP mask cushion?', a: 'Mask cushions should be swapped every 3 to 6 months to prevent seal leaks, skin rashes, and bacteria build-up.' },
    { q: 'What pressure should I use?', a: 'Therapy pressure is prescribed by your clinician for you. Do not change it without their advice.' },
    { q: 'Why does my humidifier run out of water during sleep?', a: 'This is usually caused by excessive mask leaks or dry ambient room humidity. Check mask fits or reduce the humidity setting.' },
    { q: 'How do I download historical compliance PDFs?', a: 'Go to the Reports page, adjust the patient date filters, and click "Open report" to print it or save it as a PDF.' }
  ];


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
              <p>Email: <a href="mailto:support@deckmount.in">support@deckmount.in</a></p>
            </div>

            <div className="support-buttons-column" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <a href="mailto:support@deckmount.in" className="icon-text-button" style={{ display: 'inline-flex', textDecoration: 'none', justifyContent: 'center', alignItems: 'center' }}>
                Email Helpdesk
              </a>
            </div>
          </div>
        </GlassCard>
      </div>

    </div>
  );
}
