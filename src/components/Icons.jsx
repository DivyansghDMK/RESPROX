import React from 'react';

function SvgBox({ children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

export function HomeIcon() {
  return <SvgBox><path d="M10 18v-6h4v6h5v-8h3L12 3 2 10h3v8z" /></SvgBox>;
}

export function PulseIcon() {
  return <SvgBox><path d="M2 12h4l2-6 4 12 2-7h4" /></SvgBox>;
}

export function ChartIcon() {
  return <SvgBox><path d="M4 19V5m5 14V9m5 10V3m5 16v-8" /></SvgBox>;
}

export function FileIcon() {
  return <SvgBox><path d="M6 3h7l5 5v13H6zM13 3v6h6" /></SvgBox>;
}

export function DeviceIcon() {
  return <SvgBox><rect x="4" y="5" width="16" height="14" rx="3" /><path d="M8 9h8M8 13h8" /></SvgBox>;
}

export function MaskIcon() {
  return <SvgBox><path d="M4 13c2-6 14-6 16 0-1 4-4 7-8 7s-7-3-8-7Z" /><path d="M8 12c1-2 2-3 4-3s3 1 4 3" /></SvgBox>;
}

export function GearIcon() {
  return <SvgBox><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.5 3.5-.1 1.4 2 1.6-1.8 3.1-2.4-.7a8 8 0 0 1-1.1.7l-.4 2.5H9.3l-.4-2.5a8 8 0 0 1-1.1-.7l-2.4.7-1.8-3.1 2-1.6-.1-1.4.1-1.4-2-1.6 1.8-3.1 2.4.7a8 8 0 0 1 1.1-.7l.4-2.5h5.4l.4 2.5a8 8 0 0 1 1.1.7l2.4-.7 1.8 3.1-2 1.6.1 1.4Z" /></SvgBox>;
}

export function HelpIcon() {
  return <SvgBox><path d="M12 17h.01M9.8 9a2.2 2.2 0 1 1 3.5 1.8c-.9.6-1.3 1.1-1.3 2.2v.5" /><circle cx="12" cy="12" r="9" /></SvgBox>;
}

export function BluetoothIcon() {
  return <SvgBox><path d="m8 7 8 10-4-3v-9l4 3-8 10" /></SvgBox>;
}

export function BellIcon() {
  return <SvgBox><path d="M6 16h12c-1.5-1.3-2-2.5-2-5a4 4 0 1 0-8 0c0 2.5-.5 3.7-2 5Zm4 2a2 2 0 0 0 4 0" /><circle cx="18.5" cy="5.5" r="3" className="bell-dot" /></SvgBox>;
}

export function SmallDeviceIcon() {
  return <SvgBox><rect x="6" y="5" width="12" height="14" rx="2" /><path d="M9 9h6M9 13h6" /></SvgBox>;
}

export function AutoIcon() {
  return <SvgBox><circle cx="12" cy="12" r="9" /><path d="M9 13l3-6 3 6M10 11h4" /></SvgBox>;
}

export function MoonIcon() {
  return <SvgBox><path d="M15 12.5A7.5 7.5 0 1 1 11.5 4 5.8 5.8 0 0 0 15 12.5Z" /><path d="M18 7v2M19 8h-2M18 14v2M19 15h-2" /></SvgBox>;
}

export function DotsIcon() {
  return <SvgBox><path d="M5 5h2v2H5zM11 5h2v2h-2zM17 5h2v2h-2zM5 11h2v2H5zM11 11h2v2h-2zM17 11h2v2h-2zM5 17h2v2H5zM11 17h2v2h-2zM17 17h2v2h-2z" stroke="none" fill="currentColor" /></SvgBox>;
}

export function MinusIcon() {
  return <SvgBox><path d="M7 12h10" /></SvgBox>;
}

export function PlusIcon() {
  return <SvgBox><path d="M7 12h10M12 7v10" /></SvgBox>;
}

export function InfoIcon() {
  return <SvgBox><circle cx="12" cy="12" r="9" /><path d="M12 10v5M12 7.5h.01" /></SvgBox>;
}

export function MenuIcon() {
  return <SvgBox><path d="M4 6h16M4 12h16M4 18h16" /></SvgBox>;
}

export function CloseIcon() {
  return <SvgBox><path d="M18 6L6 18M6 6l12 12" /></SvgBox>;
}

export function DownloadIcon() {
  return <SvgBox><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3" /></SvgBox>;
}

export function ShareIcon() {
  return <SvgBox><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8m-4-6L12 2 8 6m4-4v13" /></SvgBox>;
}

export function SyncIcon() {
  return <SvgBox><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" /></SvgBox>;
}

export function CheckIcon() {
  return <SvgBox><path d="M20 6 9 17l-5-5" /></SvgBox>;
}

export function TrashIcon() {
  return <SvgBox><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></SvgBox>;
}

export function UserIcon() {
  return <SvgBox><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></SvgBox>;
}

export function LockIcon() {
  return <SvgBox><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></SvgBox>;
}
