import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTherapy } from '../context/TherapyContext';
import {
  HomeIcon,
  PulseIcon,
  ChartIcon,
  FileIcon,
  DeviceIcon,
  MaskIcon,
  GearIcon,
  HelpIcon,
  CloseIcon,
} from './Icons';

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen, adminActiveSerial } = useTherapy();
  const activeSerial = adminActiveSerial || localStorage.getItem('adminActiveSerial') || 'CVT3000001';

  const sidebarItems = [
    { label: 'Dashboard', path: `/device/${activeSerial}`, icon: HomeIcon },
    { label: 'Devices', path: '/devices', icon: DeviceIcon },
    { label: 'Therapy', path: '/therapy', icon: PulseIcon },
    { label: 'Reports', path: '/reports', icon: FileIcon },
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

        <div className="brand">
          <div className="brand-mark" style={{ background: 'none', boxShadow: 'none', borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/resprox-logo.png" alt="Resprox Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <div className="brand-name">Resprox</div>
            <div className="brand-tag">Breathe better. Live better.</div>
          </div>
        </div>

        <nav className="nav-list">
          {sidebarItems.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={label}
              to={path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
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
