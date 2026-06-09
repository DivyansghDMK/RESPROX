import React from 'react';
import { useTherapy } from '../context/TherapyContext';

export default function SaveButton() {
  const { saveState, handleSave } = useTherapy();
  
  const getButtonText = () => {
    switch (saveState) {
      case 'saving':
        return 'Saving...';
      case 'success':
        return 'Saved!';
      case 'error':
        return 'Error!';
      default:
        return 'Save Settings';
    }
  };

  return (
    <button
      className="save-button"
      onClick={handleSave}
      disabled={saveState === 'saving'}
      aria-label={saveState === 'saving' ? "Saving settings" : "Save settings"}
    >
      {getButtonText()}
    </button>
  );
}
