import React, { useEffect, useState } from 'react';
import { useTherapy } from '../context/TherapyContext';
import { useNotifications } from '../hooks/useNotifications';
import NotificationsPanel from './NotificationsPanel';
import { MenuIcon, ServerIcon, BellIcon, UserIcon } from './Icons';
import { useOnline } from './ConnectionBanner';
import { Skel } from './Skeleton';
import { useAuth } from '../context/AuthContext';

const STALE_AFTER_MS = 10 * 60 * 1000;

// The pill reports the state of the connection to the server, so it is driven
// by whether a pull has actually succeeded — not hard-coded to "Connected".
function serverStatus(lastServerPull, deviceData, online = true) {
  if (!online) {
    return { label: 'Offline', detail: 'No internet connection', tone: '#dc2626' };
  }
  if (!lastServerPull) {
    return { label: 'Not connected', detail: 'Awaiting first sync', tone: '#94a3b8' };
  }
  if (Date.now() - new Date(lastServerPull).getTime() > STALE_AFTER_MS) {
    return {
      label: 'Data stale',
      detail: deviceData?.serial || 'Refresh to update',
      tone: '#f59e0b',
    };
  }
  return {
    label: 'Server Connected',
    detail: deviceData
      ? (deviceData.model && deviceData.model !== deviceData.serial && deviceData.model !== 'Device' ? `${deviceData.model} · ${deviceData.serial}` : deviceData.serial)
      : 'No device selected',
    tone: '#27b5c7',
  };
}

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

/** "Dr. Asha Mehta" for a doctor; the account's own name otherwise. */
function displayName({ name, isDoctor }) {
  if (!name) return 'Divyansh'; // the shared admin account carries no name
  return isDoctor && !/^dr\b/i.test(name) ? `Dr. ${name}` : name;
}

export default function Header() {
  const { setSidebarOpen, lastServerPull, deviceData, adminActiveSerial, deviceLoadError } = useTherapy();
  const deviceLoading = Boolean(adminActiveSerial) && !deviceData && !deviceLoadError;
  const [displayTime, setDisplayTime] = useState(() => formatLastPulled(lastServerPull));
  const [, setTick] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const { notifications, unreadCount, markAllRead, dismiss, clearAll } = useNotifications();

  // Refresh displayed time every 10 seconds so "Xs ago" stays accurate.
  // The same tick re-evaluates the pill, so it can go stale on its own.
  useEffect(() => {
    setDisplayTime(formatLastPulled(lastServerPull));
    const timer = setInterval(() => {
      setDisplayTime(formatLastPulled(lastServerPull));
      setTick((t) => t + 1);
    }, 10000);
    return () => clearInterval(timer);
  }, [lastServerPull]);

  const { profile } = useAuth();
  const adminLabel = displayName(profile);
  const online = useOnline();
  const status = serverStatus(lastServerPull, deviceData, online);

  const toggleNotifications = () => {
    setNotifOpen((open) => {
      if (!open) markAllRead(); // opening the panel is the read receipt
      return !open;
    });
  };

  const notificationsButton = (className) => (
    <button
      className={className}
      data-notif-toggle
      onClick={toggleNotifications}
      aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      aria-expanded={notifOpen}
    >
      <BellIcon showDot={unreadCount > 0} />
    </button>
  );

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
            <span style={{ color: status.tone, display: 'grid', placeItems: 'center' }}>
              <ServerIcon />
            </span>
            <div>
              <strong>{status.label}</strong>
              {deviceLoading
                ? <span aria-label={`Loading ${adminActiveSerial}`}><Skel w={120} h={10} style={{ marginTop: 4 }} /></span>
                : <span>{status.detail}</span>}
            </div>
          </div>
          {notificationsButton('icon-button')}
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
          {notificationsButton('mobile-bell-btn')}
        </div>
      </div>

      {/* One panel for both header variants — mounting it twice would make the
          hidden copy's outside-click handler close the visible one instantly. */}
      {notifOpen && (
        <NotificationsPanel
          notifications={notifications}
          onClose={() => setNotifOpen(false)}
          onDismiss={dismiss}
          onClearAll={clearAll}
        />
      )}
    </header>
  );
}
