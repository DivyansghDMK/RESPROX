import React from 'react';

// Shimmer placeholders shaped like the real page, shown while its data loads.
// Neutral greys on purpose: a loading block must not look like a reading.

export function Skel({ w = '100%', h = 14, r = 8, style }) {
  return <div className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

function Frame({ label, children }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function Card({ children, style }) {
  return <div className="skel-card" style={style}>{children}</div>;
}

function MetricCard() {
  return (
    <Card>
      <Skel w="40%" h={10} />
      <Skel w="60%" h={30} style={{ marginTop: 14 }} />
      <Skel w="75%" h={10} style={{ marginTop: 12 }} />
    </Card>
  );
}

/** Device dashboard: header, therapy control, four metrics, settings panel. */
export function DeviceDashboardSkeleton({ serial }) {
  return (
    <Frame label={`Loading device ${serial || ''}`}>
      <div className="skel-row" style={{ marginBottom: 20 }}>
        <Skel w={72} h={36} r={10} />
        <div style={{ flex: 1 }}>
          <Skel w={110} h={10} />
          <Skel w={190} h={24} style={{ marginTop: 8 }} />
        </div>
        <Skel w={110} h={36} r={10} />
        <Skel w={110} h={36} r={18} />
      </div>
      <Card style={{ marginBottom: 18 }}>
        <div className="skel-row">
          <div style={{ flex: 1 }}>
            <Skel w={120} h={10} />
            <Skel w="45%" h={22} style={{ marginTop: 10 }} />
            <Skel w="60%" h={10} style={{ marginTop: 10 }} />
          </div>
          <Skel w={150} h={46} r={12} />
        </div>
      </Card>
      <div className="dashboard-metrics-grid">
        <MetricCard /><MetricCard /><MetricCard /><MetricCard />
      </div>
      <Card>
        <Skel w={140} h={10} />
        <Skel h={46} r={12} style={{ marginTop: 16 }} />
        <Skel w="35%" h={14} style={{ marginTop: 22 }} />
        <Skel h={10} style={{ marginTop: 16 }} />
        <Skel w="50%" h={14} style={{ marginTop: 22 }} />
      </Card>
    </Frame>
  );
}

/** Device registry table. */
export function DeviceListSkeleton({ rows = 5 }) {
  return (
    <Frame label="Loading devices">
      <Card style={{ padding: 0 }}>
        <div className="skel-table-head"><Skel w="70%" h={10} /></div>
        {Array.from({ length: rows }, (_, i) => (
          <div className="skel-table-row" key={i}>
            <Skel w={120} h={14} />
            <Skel w={70} h={12} />
            <Skel w={140} h={8} r={4} />
            <Skel w={44} h={20} r={10} />
            <Skel w={50} h={12} />
            <Skel w={80} h={22} r={11} />
          </div>
        ))}
      </Card>
    </Frame>
  );
}

/** Generic page: two summary cards and one wide card (Therapy, Trends, Mask Fit, Reports, Settings). */
export function PageSkeleton({ label = 'Loading' }) {
  return (
    <Frame label={label}>
      <div className="section-grid-2">
        <Card>
          <Skel w="45%" h={16} />
          <div className="skel-grid-2" style={{ marginTop: 18 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i}><Skel w="70%" h={10} /><Skel w="55%" h={22} style={{ marginTop: 8 }} /></div>
            ))}
          </div>
        </Card>
        <Card>
          <Skel w="45%" h={16} />
          <Skel h={12} style={{ marginTop: 18 }} />
          <Skel w="85%" h={12} style={{ marginTop: 10 }} />
          <Skel w="65%" h={12} style={{ marginTop: 10 }} />
        </Card>
      </div>
      <Card style={{ marginTop: 20 }}>
        <Skel w="30%" h={16} />
        <Skel h={200} r={12} style={{ marginTop: 18 }} />
      </Card>
    </Frame>
  );
}
