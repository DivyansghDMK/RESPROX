import React, { useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { HomeIcon, PhoneIcon, PulseIcon, ClipboardIcon } from './Icons';
import { prefetch, routeKeyForPath } from '../routes';

function BottomNavbar() {
  const { isAuthenticated } = useAuth();

  // On touch devices `touchstart` fires well before the tap completes, which
  // is the only prefetch window available without a hover state.
  const warm = useCallback((path) => {
    const key = routeKeyForPath(path);
    if (key) prefetch(key);
  }, []);

  const items = [
    { label: 'Dashboard', path: '/dashboard', icon: HomeIcon },
    {
      label: isAuthenticated ? 'Devices' : 'Device',
      path: isAuthenticated ? '/devices' : '/device-info',
      icon: PhoneIcon
    },
    { label: 'Therapy', path: '/therapy', icon: PulseIcon },
    { label: 'Reports', path: '/reports', icon: ClipboardIcon },
  ];

  return (
    <nav className="bottom-navbar">
      {items.map(({ label, path, icon: Icon }) => (
        <NavLink
          key={label}
          to={path}
          className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
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
