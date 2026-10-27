import React from 'react';
import { useNavigate } from 'react-router-dom';
import GlassCard from './GlassCard';
import { PageSkeleton } from './Skeleton';
import { useTherapy } from '../context/TherapyContext';
import { describeError } from '../services/apiError';

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
    const d = describeError(deviceLoadError, { action: 'load this device', subject: adminActiveSerial });
    return (
      <div className="load-error" role="alert">
        <strong>{d.title}</strong>
        <p>{d.message}</p>
        {d.detail && <code>{d.detail}</code>}
        <div className="load-error-actions">
          {d.retryable && (
            <button className="admin-page-btn primary" onClick={() => fetchDeviceData(adminActiveSerial)}>Try again</button>
          )}
          <button className="admin-page-btn" onClick={() => navigate('/devices')}>← Back to Devices</button>
        </div>
      </div>
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
