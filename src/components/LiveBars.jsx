// src/components/LiveBars.jsx
//
// Four small bars that bounce like a music equaliser: the sign that a therapy
// session is live. Decorative; still for reduced motion.

import React from 'react';

export default function LiveBars({ className = '' }) {
  return (
    <span className={`live-bars ${className}`.trim()} aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}
