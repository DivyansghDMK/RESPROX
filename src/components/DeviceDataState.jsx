import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageSkeleton } from './Skeleton';
import { useTherapy } from '../context/TherapyContext';
import ErrorPanel from './ErrorPanel';

/**
 * What a device page shows before it has data: a shimmer while the selected
 * device loads, the real reason if that load failed, or a prompt to pick one.
 */
export default function DeviceDataState({ what = 'this page', skeleton: Shape = PageSkeleton }) {
  const { adminActiveSerial, deviceLoadError, fetchDeviceData } = useTherapy();
  const navigate = useNavigate();

  if (adminActiveSerial && !deviceLoadError) {
    return <Shape label={`Loading ${what} for ${adminActiveSerial}`} />;
  }

  if (adminActiveSerial && deviceLoadError) {
    return (
      <ErrorPanel error={deviceLoadError} action="load this device" subject={adminActiveSerial} onRetry={() => fetchDeviceData(adminActiveSerial)}>
        <button className="admin-page-btn" style={{ marginTop: 14 }} onClick={() => navigate('/devices')}>← Back to Devices</button>
      </ErrorPanel>
    );
  }

  return (
    <div className="select-device-first" role="status">
      <div className="select-device-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28"><rect x="3" y="6" width="18" height="12" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M7 10h6M7 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="17" cy="12" r="1.6" fill="currentColor" /></svg>
      </div>
      <h2>Select a device first</h2>
      <p>{what.charAt(0).toUpperCase() + what.slice(1)} {what.endsWith('s') ? 'are' : 'is'} shown for one device at a time. Pick a device from the Devices list, then come back here.</p>
      <button className="admin-page-btn primary" onClick={() => navigate('/devices')}>Choose a device</button>
    </div>
  );
}
