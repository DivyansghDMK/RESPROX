import React, { useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { useTherapy } from '../context/TherapyContext';
import { prefetch, routeKeyForPath } from '../routes';
import {
  HomeIcon,
  PulseIcon,
  ChartIcon,
  FileIcon,
  DeviceIcon,
  ClipboardIcon,
  MaskIcon,
  GearIcon,
  HelpIcon,
  CloseIcon,
} from './Icons';

function Sidebar() {
  const { sidebarOpen, setSidebarOpen, adminActiveSerial } = useTherapy();
  const activeSerial = adminActiveSerial || localStorage.getItem('adminActiveSerial') || 'CVT3000001';

  // Start fetching a route's chunk as soon as the pointer lands on its link.
  // The ~200 ms between hover and click is normally enough to have it parsed
  // and ready, so navigation never shows the loading fallback.
  const warm = useCallback((path) => {
    const key = routeKeyForPath(path);
    if (key) prefetch(key);
  }, []);

  const sidebarItems = [
    { label: 'Dashboard', path: `/device/${activeSerial}`, icon: HomeIcon },
    { label: 'Devices', path: '/devices', icon: DeviceIcon },
    { label: 'Therapy', path: '/therapy', icon: PulseIcon },
    { label: 'Reports', path: '/reports', icon: FileIcon },
    { label: 'Upload Data', path: '/admin/upload', icon: ClipboardIcon },
    { label: 'Trends', path: '/trends', icon: ChartIcon },
    { label: 'Mask Fit', path: '/mask-fit', icon: MaskIcon },
    { label: 'Settings', path: '/settings', icon: GearIcon },
    { label: 'Help & Support', path: '/help', icon: HelpIcon },
  ];


  return (
    <>
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
        <button
          className="sidebar-close-btn"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        >
          <CloseIcon />
        </button>

        <div className="brand" style={{ marginBottom: '16px' }}>
          <div className="brand-mark">
            <img src="/resprox-logo.png" alt="Resprox Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        </div>

        <nav className="nav-list">
          {sidebarItems.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={label}
              to={path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
              onMouseEnter={() => warm(path)}
              onFocus={() => warm(path)}
              onTouchStart={() => warm(path)}
              aria-label={label}
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}

// Always mounted, so it re-rendered on every TherapyContext change (device
// data, toasts, last-pull clock) even though it only reads three values.
export default React.memo(Sidebar);
