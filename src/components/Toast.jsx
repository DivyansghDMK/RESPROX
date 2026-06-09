import React from 'react';
import { useTherapy } from '../context/TherapyContext';

export default function Toast() {
  const { showToast, saveState } = useTherapy();

  if (!showToast) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      <div className={`toast ${showToast ? 'show' : ''}`}>
        <span className={`toast-icon ${saveState === 'success' ? 'success' : 'error'}`}>
          {saveState === 'success' ? '✓' : '✗'}
        </span>
        <span>
          {saveState === 'success' ? 'Settings saved successfully' : 'Error saving settings'}
        </span>
      </div>
    </div>
  );
}
