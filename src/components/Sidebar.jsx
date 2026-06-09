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
  MoonIcon
} from './Icons';

const sidebarItems = [
  { label: 'Dashboard', path: '/dashboard', icon: HomeIcon },
  { label: 'Therapy', path: '/therapy', icon: PulseIcon },
  { label: 'Trends', path: '/trends', icon: ChartIcon },
  { label: 'Reports', path: '/reports', icon: FileIcon },
  { label: 'Devices', path: '/devices', icon: DeviceIcon },
  { label: 'Mask Fit', path: '/mask-fit', icon: MaskIcon },
  { label: 'Settings', path: '/settings', icon: GearIcon },
  { label: 'Help & Support', path: '/help', icon: HelpIcon },
];

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useTherapy();

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
          <div className="brand-mark">
            <span className="brand-r">R</span>
          </div>
          <div>
            <div className="brand-name">resproX</div>
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

        <div className="sleep-card">
          <div className="sleep-icon">
            <MoonIcon />
          </div>
          <h3>Better sleep every night</h3>
          <p>Consistent use leads to better sleep and better life.</p>
          <div className="dots">
            <span className="dot active" />
            <span className="dot" />
          </div>
        </div>

        <div className="version">v 1.0.0</div>
      </aside>
    </>
  );
}
