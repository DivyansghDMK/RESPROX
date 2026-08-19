import React from 'react';

// Shown only when a route chunk is not yet warm — with hover/idle prefetching
// that is rare, so this is a shape-preserving skeleton rather than a spinner.
// Matching the real layout's block sizes keeps the page from jumping when the
// chunk lands.
const shimmer = {
  background: 'linear-gradient(90deg, var(--panel-strong, #fff) 0%, rgba(148,163,184,0.10) 50%, var(--panel-strong, #fff) 100%)',
  backgroundSize: '200% 100%',
  animation: 'routeSkeleton 1.1s ease-in-out infinite',
  border: '1px solid var(--line, #e2e8f0)',
  borderRadius: 16,
};

export default function RouteFallback() {
  return (
    <div style={{ padding: '20px 24px' }} aria-busy="true" aria-live="polite">
      <style>{`@keyframes routeSkeleton { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
      <span style={{
        position: 'absolute', width: 1, height: 1, overflow: 'hidden',
        clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
      }}>
        Loading page…
      </span>

      <div style={{ ...shimmer, height: 64, marginBottom: 18 }} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 14,
        marginBottom: 18,
      }}>
        {[0, 1, 2, 3].map((i) => <div key={i} style={{ ...shimmer, height: 128 }} />)}
      </div>
      <div style={{ ...shimmer, height: 240, marginBottom: 16 }} />
      <div style={{ ...shimmer, height: 180 }} />
    </div>
  );
}
