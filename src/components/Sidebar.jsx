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
  const activeSerial = adminActiveSerial || localStorage.getItem('adminActiveSerial') || 'CVT30-C-9281';

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
          <div className="brand-mark">
            <svg viewBox="0 0 64 64" style={{ width: '76px', height: '76px' }} fill="none">
              <defs>
                <linearGradient id="sidebarBlueG" x1="16" y1="18" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#ffffff"/>
                  <stop offset="100%" stop-color="#d0e3ff"/>
                </linearGradient>
                <linearGradient id="sidebarTealG" x1="22" y1="22" x2="48" y2="46" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#ffffff"/>
                  <stop offset="100%" stop-color="#a7f3d0"/>
                </linearGradient>
              </defs>
              <path d="M24 19H32C37.5 19 42 23.5 42 29C42 34.5 37.5 39 32 39H24C21.2 39 19 36.8 19 34V24C19 21.2 21.2 19 24 19Z" 
                    stroke="url(#sidebarBlueG)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M40 45H32C26.5 45 22 40.5 22 35C22 29.5 26.5 25 32 25H40C42.8 25 45 27.2 45 30V40C45 42.8 42.8 45 40 45Z" 
                    stroke="url(#sidebarTealG)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="32" cy="32" r="3.5" fill="#ffffff" />
            </svg>
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
