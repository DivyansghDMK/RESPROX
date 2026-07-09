import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { HomeIcon, PhoneIcon, PulseIcon, ClipboardIcon } from './Icons';

export default function BottomNavbar() {
  const { isAuthenticated } = useAuth();

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
