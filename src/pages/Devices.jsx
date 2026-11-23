import React, { useState } from 'react';
import { useTherapy } from '../context/TherapyContext';
import GlassCard from '../components/GlassCard';
import DeviceDataState from '../components/DeviceDataState';
import { DeviceInfoSkeleton } from '../components/Skeleton';
import { DeviceIcon, SyncIcon } from '../components/Icons';
import { therapyLabel } from '../services/deviceStatus';

// The backend's last_synced is a YYMMDDHHMM string (e.g. 2608151430).
function syncStamp(value) {
  if (!value) return '—';
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(value));
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (!m || !months[Number(m[2]) - 1]) return String(value);
  return `${m[3]} ${months[Number(m[2]) - 1]} 20${m[1]}, ${m[4]}:${m[5]}`;
}

export default function Devices() {
  const { deviceData, adminActiveSerial, fetchDeviceData } = useTherapy();
  const [refreshing, setRefreshing] = useState(false);
  const device = deviceData;

  const refresh = async () => {
    if (!adminActiveSerial) return;
    setRefreshing(true);
    try { await fetchDeviceData(adminActiveSerial); } finally { setRefreshing(false); }
  };

  if (!device) return <DeviceDataState what="device information" skeleton={DeviceInfoSkeleton} />;

  const rows = [
    ['Device Name', device.model || '—'],
    ['Serial Number', device.serial || '—'],
    ['Firmware Version', device.firmware || '—'],
    ['Therapy', therapyLabel(device.therapy_status) || '—'],
    ['Connection', device.device_online ? 'Online' : device.phone_connected ? 'Connected to app' : 'Offline'],
    ['Last Sync', syncStamp(device.sync_state?.lastSynced)],
  ];

  return (
    <div className="devices-page">
      <div className="section-grid-2">
        <GlassCard>
          <div className="section-title"><h2>Connected Device</h2></div>
          <div className="device-info-wrapper">
            <div className="device-icon-large"><DeviceIcon /></div>
            <div className="device-details-list">
              {rows.map(([label, value]) => (
                <div className="device-detail-row" key={label}>
                  <span>{label}</span>
                  <strong className={label === 'Serial Number' ? 'mono' : ''}>{value}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="device-actions-bar">
            <button className="icon-text-button" onClick={refresh} disabled={refreshing}>
              <SyncIcon className={refreshing ? 'spin-animation' : ''} />
              <span>{refreshing ? 'Refreshing…' : 'Refresh live data'}</span>
            </button>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="section-title"><h2>Device History</h2></div>
          {device.sessions?.length ? (
            <div className="timeline-list">
              {/* Sessions are oldest first; the history shows the latest ten, newest on top. */}
              {device.sessions.slice(-10).reverse().map((session, index) => (
                <div className="timeline-item" key={`${session.timestamp || session.date}-${index}`}>
                  <div className="timeline-dot" />
                  <div className="timeline-content">
                    <strong>{session.date || session.display_date || '—'}</strong>
                    <span>{session.type === 'SETTINGS_UPDATE' ? 'Settings update received' : 'Therapy session received'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--muted)' }}>No device history has been returned by the database.</p>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
