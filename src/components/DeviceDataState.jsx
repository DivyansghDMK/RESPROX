import React from 'react';
import { useNavigate } from 'react-router-dom';
import GlassCard from './GlassCard';
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
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <GlassCard>
        <h2 style={{ color: 'var(--accent)', fontWeight: 800 }}>No device selected</h2>
        <p style={{ color: 'var(--muted)', marginTop: 8 }}>Choose a device from the Devices list to see {what}.</p>
        <button className="icon-text-button" style={{ marginTop: 18 }} onClick={() => navigate('/devices')}>
          Go to Devices
        </button>
      </GlassCard>
    </div>
  );
}
