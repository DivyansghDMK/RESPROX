import React, { useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { HomeIcon, PhoneIcon, PulseIcon, ClipboardIcon, DotsIcon } from './Icons';
import { prefetch, routeKeyForPath } from '../routes';

function BottomNavbar() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  // On touch devices `touchstart` fires well before the tap completes, which
  // is the only prefetch window available without a hover state.
  const warm = useCallback((path) => {
    const key = routeKeyForPath(path);
    if (key) prefetch(key);
  }, []);

  const items = [
    // /dashboard redirects to the device (or Devices); lit only on a device's dashboard.
    { label: 'Dashboard', path: '/dashboard', icon: HomeIcon, activeWhen: (p) => p.startsWith('/device/') },
    {
      label: isAuthenticated ? 'Devices' : 'Device',
      path: isAuthenticated ? '/devices' : '/device-info',
      icon: PhoneIcon
    },
    { label: 'Trends', path: '/trends', icon: PulseIcon },
    { label: 'Reports', path: '/reports', icon: ClipboardIcon },
    // Phones have no sidebar: the rest of the pages and Sign out live here.
    { label: 'More', path: '/preferences', icon: DotsIcon },
  ];

  return (
    <nav className="bottom-navbar">
      {items.map(({ label, path, icon: Icon, activeWhen }) => (
        <NavLink
          key={label}
          to={path}
          className={({ isActive }) => `bottom-nav-item ${(activeWhen ? activeWhen(location.pathname) : isActive) ? 'active' : ''}`}
          onTouchStart={() => warm(path)}
          onMouseEnter={() => warm(path)}
          onFocus={() => warm(path)}
          aria-label={label}
        >
          <div className="bottom-nav-icon-container">
            <Icon />
          </div>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default React.memo(BottomNavbar);
