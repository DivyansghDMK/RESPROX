import React from 'react';
import { Skel } from './Skeleton';

// Shown only when a route chunk is not yet warm — with hover/idle prefetching
// that is rare, so this is a shape-preserving skeleton rather than a spinner.
// Matching the real layout's block sizes keeps the page from jumping when the
// chunk lands.
export default function RouteFallback() {
  return (
    <div style={{ padding: '20px 24px' }} role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page…</span>

      <Skel h={64} r={16} style={{ marginBottom: 18 }} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 14,
        marginBottom: 18,
      }}>
        {[0, 1, 2, 3].map((i) => <Skel key={i} h={128} r={16} />)}
      </div>
      <Skel h={240} r={16} style={{ marginBottom: 16 }} />
      <Skel h={180} r={16} />
    </div>
  );
}
