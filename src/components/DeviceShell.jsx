import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { BellIcon, ChevronRightIcon, DeviceIcon, HomeIcon, PulseIcon, ChartIcon, FileIcon, UserIcon } from './Icons';
import { useTherapy } from '../context/TherapyContext';

const BRAND_GRADIENT = 'linear-gradient(97deg, #001B66 -2.93%, #0047CC -1.33%, #16E0B3 94.91%)';

function formatDeviceTitle(deviceData, serial) {
  if (!deviceData && !serial) return 'Enter a device serial to begin';
  const model = deviceData?.model || 'Device';
  const displaySerial = serial || deviceData?.serial || '—';
  return `${model} · ${displaySerial}`;
}

function formatMetricValue(value, suffix = '') {
  if (value === null || value === undefined || value === '') return '—';
  return `${value}${suffix}`;
}

function Metric({ icon, label, value, sub }) {
  return (
    <div className="device-shell-metric">
      <div className="device-shell-metric-icon">{icon}</div>
      <div className="device-shell-metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        {sub ? <small>{sub}</small> : null}
      </div>
    </div>
  );
}

export default function DeviceShell({ activeTab = 'dashboard' }) {
  const { deviceData, adminActiveSerial, setAdminActiveSerial } = useTherapy();
  const navigate = useNavigate();
  const location = useLocation();
  const [serial, setSerial] = useState(adminActiveSerial || deviceData?.serial || '');

  useEffect(() => {
    setSerial(adminActiveSerial || deviceData?.serial || '');
  }, [adminActiveSerial, deviceData?.serial]);

  const currentSerial = adminActiveSerial || deviceData?.serial || '';
  const deviceStatus = deviceData?.device_online || deviceData?.status === 'ONLINE' || deviceData?.status === 'online';
  const live = deviceData?.live_data || {};

  const navTabs = useMemo(() => ([
    { label: 'Dashboard', to: currentSerial ? `/device/${currentSerial}` : '/devices', icon: HomeIcon, active: activeTab === 'dashboard' },
    { label: 'Therapy', to: '/therapy', icon: PulseIcon, active: activeTab === 'therapy' },
    { label: 'Trends', to: '/trends', icon: ChartIcon, active: activeTab === 'trends' },
    { label: 'Reports', to: '/reports', icon: FileIcon, active: activeTab === 'reports' },
  ]), [activeTab, currentSerial]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const nextSerial = serial.trim().toUpperCase();
    if (!nextSerial) return;
    setAdminActiveSerial(nextSerial);
    localStorage.setItem('adminActiveSerial', nextSerial);
    navigate(`/device/${nextSerial}`);
  };

  const usageHours = live.usage_hours != null ? live.usage_hours : null;
  const usageDisplay = usageHours != null ? `${Math.floor(usageHours)}h ${Math.round((usageHours % 1) * 60)}m` : '—';

  return (
    <section className="device-shell">
      <div className="device-shell-topbar">
        <button className="device-shell-avatar" aria-label="Profile">
          <UserIcon />
        </button>
        <div className="device-shell-brand">
          <span className="device-shell-brand-dark">respro</span>
          <span className="device-shell-brand-accent">X</span>
        </div>
        <button className="device-shell-bell" aria-label="Notifications">
          <BellIcon />
        </button>
      </div>

      <div className="device-shell-hero">
        <div className="device-shell-hero-left">
          <div className="device-shell-chip">
            <DeviceIcon />
          </div>
          <div>
            <div className="device-shell-title">{formatDeviceTitle(deviceData, currentSerial)}</div>
            <div className={`device-shell-status ${deviceStatus ? 'online' : 'offline'}`}>
              <span className="device-shell-status-dot" />
              {deviceStatus ? 'Connected' : 'No device selected'}
            </div>
          </div>
        </div>

        <button
          className="device-shell-info-btn"
          onClick={() => currentSerial ? navigate(`/device/${currentSerial}`) : navigate('/devices')}
          type="button"
        >
          Device info <ChevronRightIcon />
        </button>
      </div>

      <form className="device-shell-lookup" onSubmit={handleSubmit}>
        <label htmlFor="device-serial" className="device-shell-lookup-label">Device serial</label>
        <div className="device-shell-lookup-row">
          <input
            id="device-serial"
            type="text"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="Type a device serial and press Enter"
          />
          <button type="submit" style={{ background: BRAND_GRADIENT, color: '#fff' }}>
            Pull from Server
          </button>
        </div>
      </form>

      <div className="device-shell-tabs">
        {navTabs.map(({ label, to, icon: Icon, active }) => (
          <NavLink
            key={label}
            to={to}
            className={({ isActive }) => `device-shell-tab ${active || isActive ? 'active' : ''}`}
          >
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>

      <div className="device-shell-summary">
        <Metric icon="⏱" label="Usage" value={usageDisplay} sub="Last pulled" />
        <Metric icon="🫧" label="Mask Seal" value={formatMetricValue(live.mask_leak, ' L/min')} sub={live.mask_leak == null ? 'Waiting for telemetry' : 'Live telemetry'} />
        <Metric icon="◔" label="Pressure" value={formatMetricValue(live.pressure_95, ' cmH2O')} sub={live.pressure_95 == null ? 'Waiting for telemetry' : '95th percentile'} />
        <Metric icon="❤" label="AHI" value={formatMetricValue(live.ahi)} sub={live.ahi == null ? 'Waiting for telemetry' : 'events/hr'} />
      </div>
    </section>
  );
}
