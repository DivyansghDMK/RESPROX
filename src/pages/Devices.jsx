import React, { useState } from 'react';
import GlassCard from '../components/GlassCard';
import { DeviceIcon, SyncIcon, TrashIcon, InfoIcon } from '../components/Icons';

export default function Devices() {
  const [deviceName, setDeviceName] = useState('Dream Station Auto');
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      alert('Device data sync complete! Fetching telemetry...');
    }, 2000);
  };

  const handleRename = () => {
    const newName = prompt('Enter new device name:', deviceName);
    if (newName) setDeviceName(newName);
  };

  const handleRemove = () => {
    if (window.confirm('Are you sure you want to disconnect this device?')) {
      alert('Device disconnected.');
    }
  };

  const deviceHistory = [
    { id: 1, type: 'Sync', event: 'Compliance data uploaded successfully.', date: '2026-06-08 09:12 AM' },
    { id: 2, type: 'Calibration', event: 'Pressure levels calibrated by provider.', date: '2026-05-15 02:30 PM' },
    { id: 3, type: 'System Update', event: 'Firmware updated to v1.2.4.', date: '2026-04-10 11:00 AM' },
    { id: 4, type: 'Connection', event: 'Initial Bluetooth pairing completed.', date: '2026-03-01 10:15 AM' }
  ];

  return (
    <div className="devices-page">
      <div className="section-grid-2">
        {/* Connected Device Card */}
        <GlassCard>
          <div className="section-title">
            <h2>Connected Device</h2>
          </div>
          <div className="device-info-wrapper">
            <div className="device-icon-large">
              <DeviceIcon />
            </div>
            <div className="device-details-list">
              <div className="device-detail-row">
                <span>Device Name</span>
                <strong>{deviceName}</strong>
              </div>
              <div className="device-detail-row">
                <span>Serial Number</span>
                <strong className="mono">DS-9281-AX</strong>
              </div>
              <div className="device-detail-row">
                <span>Firmware Version</span>
                <strong>v1.2.4</strong>
              </div>
              <div className="device-detail-row">
                <span>Battery Status</span>
                <strong className="green-text">95%</strong>
              </div>
              <div className="device-detail-row">
                <span>Signal Strength</span>
                <strong className="green-text">Excellent (4/4)</strong>
              </div>
              <div className="device-detail-row">
                <span>Last Sync</span>
                <strong style={{ color: 'var(--muted)' }}>2 minutes ago</strong>
              </div>
            </div>
          </div>

          <div className="device-actions-bar">
            <button className="icon-text-button" onClick={handleSync} disabled={isSyncing}>
              <SyncIcon className={isSyncing ? 'spin-animation' : ''} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
            <button className="icon-text-button outline" onClick={handleRename}>
              Rename
            </button>
            <button className="icon-text-button remove" onClick={handleRemove}>
              <TrashIcon />
              <span>Remove</span>
            </button>
          </div>
        </GlassCard>

        {/* Device History timeline */}
        <GlassCard>
          <div className="section-title">
            <h2>Device History</h2>
          </div>
          <div className="device-timeline">
            {deviceHistory.map((item) => (
              <div key={item.id} className="timeline-item">
                <div className="timeline-badge">
                  <InfoIcon />
                </div>
                <div className="timeline-content">
                  <div className="timeline-meta">
                    <span className="timeline-type">{item.type}</span>
                    <span className="timeline-date">{item.date}</span>
                  </div>
                  <p className="timeline-text">{item.event}</p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
