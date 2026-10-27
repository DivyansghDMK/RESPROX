import React, { useState } from 'react';
import { useTherapy } from '../context/TherapyContext';
import GlassCard from '../components/GlassCard';
import DeviceDataState from '../components/DeviceDataState';
import { DeviceInfoSkeleton } from '../components/Skeleton';
import { DeviceIcon, SyncIcon } from '../components/Icons';

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
    ['Therapy Status', device.therapy_status || '—'],
    ['Connection', device.device_online ? 'Online' : 'Offline'],
    ['Last Sync', device.sync_state?.lastSynced || '—'],
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
              {device.sessions.slice(0, 10).map((session, index) => (
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
