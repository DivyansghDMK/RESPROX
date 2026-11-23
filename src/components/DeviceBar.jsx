// src/components/DeviceBar.jsx
//
// On every page that shows one device (Reports, Trends, Mask Fit, Settings,
// Calibration, Device info): which device the cards on it are for, its state,
// and a way to change it. Hidden until a device is selected; the page itself
// then says "Select a device first".

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTherapy } from '../context/TherapyContext';
import { therapyLabel } from '../services/deviceStatus';

const CONNECTION = {
  online: ['Online', 'online'],
  phone: ['On phone app', 'phone'],
  offline: ['Offline', 'offline'],
};

export default function DeviceBar() {
  const navigate = useNavigate();
  const { adminActiveSerial, deviceData, deviceLoadError } = useTherapy();
  if (!adminActiveSerial) return null;

  const loaded = deviceData?.serial === adminActiveSerial;
  const conn = !loaded ? null
    : deviceData.device_online ? CONNECTION.online : deviceData.phone_connected ? CONNECTION.phone : CONNECTION.offline;
  const therapy = loaded ? therapyLabel(deviceData.therapy_running ? 'RUNNING' : deviceData.therapy_status) : null;
  const model = loaded && deviceData.model && deviceData.model !== deviceData.serial ? deviceData.model : null;

  return (
    <div className="device-bar" role="region" aria-label="Selected device">
      <div className="device-bar-id">
        <span className="device-bar-label">Device</span>
        <b>{adminActiveSerial}</b>
        {model && <span className="device-bar-model">{model}</span>}
      </div>
      <div className="device-bar-state">
        {!loaded && !deviceLoadError && <span className="device-bar-chip">Loading…</span>}
        {!loaded && deviceLoadError && <span className="device-bar-chip bad">Couldn’t load</span>}
        {conn && <span className={`device-bar-chip ${conn[1]}`}>{conn[0]}</span>}
        {therapy && <span className="device-bar-chip">{therapy}</span>}
      </div>
      <div className="device-bar-actions">
        <button type="button" onClick={() => navigate(`/device/${encodeURIComponent(adminActiveSerial)}`)}>Open dashboard</button>
        <button type="button" onClick={() => navigate('/devices')}>Change device</button>
      </div>
    </div>
  );
}
