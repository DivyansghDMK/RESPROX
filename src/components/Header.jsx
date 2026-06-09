import React from 'react';
import { useTherapy } from '../context/TherapyContext';
import { MenuIcon, BluetoothIcon, BellIcon } from './Icons';

export default function Header() {
  const { setSidebarOpen } = useTherapy();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="hamburger-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open navigation menu"
        >
          <MenuIcon />
        </button>
        <div>
          <p className="eyebrow">Good Morning,</p>
          <h1>Divyansh</h1>
          <p className="last-synced">Last Synced 2 minutes ago</p>
        </div>
      </div>

      <div className="topbar-actions">
        <div className="status-pill">
          <BluetoothIcon />
          <div>
            <strong>Connected</strong>
            <span>Dream Station Auto</span>
          </div>
        </div>
        <button className="icon-button" aria-label="Notifications">
          <BellIcon />
        </button>
      </div>
    </header>
  );
}
