import React, { useState, useEffect } from 'react';
import GlassCard from '../components/GlassCard';
import { UserIcon, GearIcon, BellIcon, LockIcon, InfoIcon } from '../components/Icons';
import { useTherapy } from '../context/TherapyContext';

export default function Settings() {
  const { deviceData } = useTherapy();
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'notifications' | 'account' | 'appearance'
  const [isDangerExpanded, setIsDangerExpanded] = useState(false);

  // States for Settings settings
  const [units, setUnits] = useState('cmH2O');
  const [language, setLanguage] = useState('en');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');

  const [reminderTherapy, setReminderTherapy] = useState(true);
  const [reminderMaint, setReminderMaint] = useState(true);

  const activeSerial = deviceData ? deviceData.serial : '';
  const [username, setUsername] = useState('Admin');
  const [email, setEmail] = useState('admin@decklink.com');
  const [themeMode, setThemeMode] = useState('system'); // 'light' | 'dark' | 'system'

  const handleDangerAction = (action) => {
    if (window.confirm(`⚠️ WARNING: Are you sure you want to trigger this action: "${action}"? This cannot be undone.`)) {
      alert(`${action} triggered successfully.`);
    }
  };

  if (!deviceData) {
    return (
      <div className="settings-page" style={{ padding: '40px 20px', textAlign: 'center' }}>
        <GlassCard>
          <h2 style={{ color: '#0d7de6', fontWeight: 800 }}>No Device Selected</h2>
          <p style={{ color: 'var(--muted)', marginTop: 8 }}>Please select a device from the Devices registry to view settings.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-tabs-container">
        {/* Settings Navigation Tabs */}
        <div className="settings-tabs-sidebar">
          <button className={activeTab === 'general' ? 'active' : ''} onClick={() => setActiveTab('general')}>
            <GearIcon />
            <span>General</span>
          </button>
          <button className={activeTab === 'notifications' ? 'active' : ''} onClick={() => setActiveTab('notifications')}>
            <BellIcon />
            <span>Notifications</span>
          </button>
          <button className={activeTab === 'account' ? 'active' : ''} onClick={() => setActiveTab('account')}>
            <UserIcon />
            <span>Account</span>
          </button>
          <button className={activeTab === 'appearance' ? 'active' : ''} onClick={() => setActiveTab('appearance')}>
            <GearIcon />
            <span>Appearance</span>
          </button>
        </div>

        {/* Settings Tab Panel content */}
        <div className="settings-tabs-content">
          <GlassCard className="settings-content-card">
            {activeTab === 'general' && (
              <div className="settings-tab-panel">
                <h3>General Settings</h3>
                <div className="input-field">
                  <label htmlFor="settings-units">Pressure Units</label>
                  <select id="settings-units" value={units} onChange={(e) => setUnits(e.target.value)}>
                    <option value="cmH2O">cm H₂O</option>
                    <option value="hPa">hPa</option>
                  </select>
                </div>
                <div className="input-field">
                  <label htmlFor="settings-lang">Language</label>
                  <select id="settings-lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
                    <option value="en">English (US)</option>
                    <option value="es">Español</option>
                    <option value="de">Deutsch</option>
                  </select>
                </div>
                <div className="input-field">
                  <label htmlFor="settings-date">Date Format</label>
                  <select id="settings-date" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="settings-tab-panel">
                <h3>Notification Settings</h3>
                <div className="toggle-row">
                  <div>
                    <strong>Therapy Reminders</strong>
                    <span>Send alerts if device is not used by midnight</span>
                  </div>
                  <label className="switch" aria-label="Toggle Therapy Reminders">
                    <input type="checkbox" checked={reminderTherapy} onChange={(e) => setReminderTherapy(e.target.checked)} />
                    <span className="slider round"></span>
                  </label>
                </div>
                <div className="toggle-row">
                  <div>
                    <strong>Maintenance Reminders</strong>
                    <span>Send alerts for filter, mask, and humidifier swaps</span>
                  </div>
                  <label className="switch" aria-label="Toggle Maintenance Reminders">
                    <input type="checkbox" checked={reminderMaint} onChange={(e) => setReminderMaint(e.target.checked)} />
                    <span className="slider round"></span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="settings-tab-panel">
                <h3>Account Settings</h3>
                <div className="input-field">
                  <label htmlFor="settings-username">Profile Name</label>
                  <input id="settings-username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>
                <div className="input-field">
                  <label htmlFor="settings-email">Email Address</label>
                  <input id="settings-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>

                <div className="password-section-border" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--line)' }}>
                  <h4>Change Password</h4>
                  <div className="input-field">
                    <label htmlFor="settings-old-pass">Current Password</label>
                    <input id="settings-old-pass" type="password" placeholder="••••••••" />
                  </div>
                  <div className="input-field">
                    <label htmlFor="settings-new-pass">New Password</label>
                    <input id="settings-new-pass" type="password" placeholder="New Password" />
                  </div>
                </div>

                <button className="icon-text-button outline" style={{ marginTop: '20px' }}>
                  <span>Save Profile Changes</span>
                </button>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="settings-tab-panel">
                <h3>Appearance settings</h3>
                <div className="appearance-theme-options">
                  <button className={`theme-opt-btn ${themeMode === 'light' ? 'active' : ''}`} onClick={() => setThemeMode('light')}>
                    Light Mode
                  </button>
                  <button className={`theme-opt-btn ${themeMode === 'dark' ? 'active' : ''}`} onClick={() => setThemeMode('dark')}>
                    Dark Mode
                  </button>
                  <button className={`theme-opt-btn ${themeMode === 'system' ? 'active' : ''}`} onClick={() => setThemeMode('system')}>
                    System Default
                  </button>
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* Expandable Danger Zone */}
      <GlassCard className="danger-zone-card" style={{ marginTop: '20px' }}>
        <button
          className="danger-zone-header-btn"
          onClick={() => setIsDangerExpanded(!isDangerExpanded)}
          aria-expanded={isDangerExpanded}
        >
          <div className="danger-title-wrap">
            <span className="danger-dot"></span>
            <h3>Danger Zone (Expand to view reset options)</h3>
          </div>
          <span>{isDangerExpanded ? '▼' : '▶'}</span>
        </button>

        {isDangerExpanded && (
          <div className="danger-zone-body">
            <p className="danger-warning-text">
              These actions are high-risk. Performing reset procedures will wipe device sync tokens and erase local configurations.
            </p>
            <div className="danger-buttons-grid">
              <button className="danger-action-btn" onClick={() => handleDangerAction('Reset Device Settings')}>
                Reset Device Settings
              </button>
              <button className="danger-action-btn" onClick={() => handleDangerAction('Factory Reset')}>
                Factory Reset Device
              </button>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
