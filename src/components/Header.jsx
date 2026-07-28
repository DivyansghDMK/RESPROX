import React, { useEffect, useState } from 'react';
import { useTherapy } from '../context/TherapyContext';
import { useAuth } from '../context/AuthContext';
import { MenuIcon, BluetoothIcon, BellIcon, UserIcon } from './Icons';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatLastPulled(date) {
  if (!date) return 'Never synced';
  const now = new Date();
  const diff = Math.floor((now - date) / 1000); // seconds
  if (diff < 10) return 'Just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatAdminLabel(username) {
  return 'Admin';
}

export default function Header() {
  const { setSidebarOpen, lastServerPull } = useTherapy();
  const { username } = useAuth();
  const [displayTime, setDisplayTime] = useState(() => formatLastPulled(lastServerPull));

  // Refresh displayed time every 10 seconds so "Xs ago" stays accurate
  useEffect(() => {
    setDisplayTime(formatLastPulled(lastServerPull));
    const timer = setInterval(() => setDisplayTime(formatLastPulled(lastServerPull)), 10000);
    return () => clearInterval(timer);
  }, [lastServerPull]);

  const adminLabel = formatAdminLabel(username);

  return (
    <header className="topbar-wrapper">
      {/* Desktop Header */}
      <div className="topbar desktop-only-header">
        <div className="topbar-left">
          <button
            className="hamburger-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
          >
            <MenuIcon />
          </button>
          <div>
            <p className="eyebrow">{getGreeting()},</p>
            <h1>Hello, {adminLabel}</h1>
            <p className="last-synced">
              Last pulled from server: <strong>{displayTime}</strong>
            </p>
          </div>
        </div>

        <div className="topbar-actions">
          <div className="status-pill">
            <BluetoothIcon />
            <div>
              <strong>Connected</strong>
              <span>CVT30 C-Series</span>
            </div>
          </div>
          <button className="icon-button" aria-label="Notifications">
            <BellIcon />
          </button>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="mobile-only-header">
        <div className="mobile-header-left">
          <div className="mobile-avatar-circle">
            <div className="avatar-inner">
              <UserIcon />
            </div>
          </div>
        </div>
        <div className="mobile-header-center">
          <span className="logo-deck">Res</span>
          <span className="logo-link">prox</span>
        </div>
        <div className="mobile-header-right">
          <button className="mobile-bell-btn" aria-label="Notifications">
            <BellIcon />
          </button>
        </div>
      </div>
    </header>
  );
}
