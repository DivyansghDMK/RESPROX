// src/components/PartnerStates.jsx
//
// Shared states for the Dealers and Customers pages.

import React from 'react';
import { isPreview } from '../services/partnersApi';
import { describeError } from '../services/apiError';

export function PreviewNotice() {
  if (!isPreview()) return null;
  return (
    <div className="partner-preview" role="status">
      <strong>Preview.</strong> The server doesn’t have dealers and customers yet, so what you add here
      is saved in this browser only, for trying the pages. It isn’t sent anywhere and won’t appear on
      other computers.
    </div>
  );
}

export function NotDeployed({ error, onRetry }) {
  return (
    <div className="admin-empty partner-empty">
      <p style={{ fontWeight: 700 }}>
        {error?.code === 'NOT_DEPLOYED' ? 'Not switched on yet' : 'Couldn’t load this list'}
      </p>
      <p>{error?.code === 'NOT_DEPLOYED' ? error.message : describeError(error, { action: 'load this list' }).message}</p>
      {error?.code !== 'NOT_DEPLOYED' && (
        <button type="button" className="admin-page-btn" style={{ marginTop: 14 }} onClick={onRetry}>Try again</button>
      )}
    </div>
  );
}
