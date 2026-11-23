// src/components/ThemeToggle.jsx — switches the whole site between light and dark.

import React, { useEffect, useState } from 'react';
import { onThemeChange, readTheme, setTheme } from '../services/theme';

const Sun = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
const Moon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
);

export default function ThemeToggle({ className = 'icon-button', withLabel = false }) {
  const [theme, setLocal] = useState(readTheme);
  useEffect(() => onThemeChange(setLocal), []);
  const dark = theme === 'dark';
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button type="button" className={className} onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={label} title={label}>
      {dark ? <Sun /> : <Moon />}
      {withLabel && <span>{dark ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  );
}
