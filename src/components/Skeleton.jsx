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

// Bar heights for chart placeholders — fixed, so the shimmer never reshuffles.
const BAR_HEIGHTS = [46, 62, 38, 74, 55, 82, 49, 66, 41, 70, 58, 77];

/** A chart area: faint bars over a baseline, the size of the real plot. */
export function ChartSkeleton({ height = 220, bars = 12, label, style }) {
  const body = (
    <div className="skel-chart" style={{ height, ...style }}>
      {BAR_HEIGHTS.slice(0, bars).map((pct, i) => (
        <Skel key={i} h={`${pct}%`} r={6} style={{ flex: 1, width: 'auto' }} />
      ))}
    </div>
  );
  return label ? <Frame label={label}>{body}</Frame> : body;
}

/** Trends: filter bar, four KPI cards, four chart cards. */
export function TrendsSkeleton({ label = 'Loading trends' }) {
  return (
    <Frame label={label}>
      <Card style={{ marginBottom: 20 }}>
        <div className="skel-row" style={{ justifyContent: 'space-between' }}>
          <Skel w={240} h={36} r={10} />
          <Skel w={120} h={36} r={10} />
        </div>
      </Card>
      <div className="kpi-grid">
        <MetricCard /><MetricCard /><MetricCard /><MetricCard />
      </div>
      <div className="charts-double-grid">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <Skel w="40%" h={14} />
            <ChartSkeleton height={180} style={{ marginTop: 16 }} />
          </Card>
        ))}
      </div>
    </Frame>
  );
}

/** Reports: filter card, statistics card, history table. */
export function ReportsSkeleton({ label = 'Loading reports', rows = 6 }) {
  return (
    <Frame label={label}>
      <Card>
        <Skel w={180} h={16} />
        <div className="reports-filters-grid" style={{ marginTop: 18 }}>
          {[0, 1, 2].map((i) => (
            <div key={i}><Skel w="45%" h={10} /><Skel h={38} r={8} style={{ marginTop: 8 }} /></div>
          ))}
        </div>
        <div className="skel-row" style={{ marginTop: 18 }}>
          <Skel w={140} h={36} r={10} />
          <Skel w={220} h={36} r={10} />
        </div>
      </Card>
      <Card style={{ marginTop: 20 }}>
        <Skel w={200} h={16} />
        <div className="skel-grid-2" style={{ marginTop: 18 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i}><Skel w="70%" h={10} /><Skel w="45%" h={20} style={{ marginTop: 8 }} /></div>
          ))}
        </div>
      </Card>
      <Card style={{ marginTop: 20, padding: 0 }}>
        <div className="skel-table-head"><Skel w={240} h={16} /></div>
        {Array.from({ length: rows }, (_, i) => (
          <div className="skel-table-row" key={i}>
            <Skel w={90} h={12} />
            <Skel w={60} h={12} />
            <Skel w={50} h={12} />
            <Skel w={50} h={12} />
            <Skel w={56} h={20} r={10} />
          </div>
        ))}
      </Card>
    </Frame>
  );
}

/** Settings: title bar, then option sections (mask, tube, comfort…). */
export function SettingsSkeleton({ label = 'Loading device settings' }) {
  return (
    <Frame label={label}>
      <div className="skel-row" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <Skel w={130} h={26} />
          <Skel w={210} h={12} style={{ marginTop: 8 }} />
        </div>
        <Skel w={120} h={30} r={15} />
      </div>
      {[3, 2, 2].map((cols, i) => (
        <Card key={i} style={{ marginBottom: 18 }}>
          <div className="skel-row">
            <Skel w={38} h={38} r={10} />
            <div style={{ flex: 1 }}>
              <Skel w={140} h={14} />
              <Skel w={220} h={10} style={{ marginTop: 8 }} />
            </div>
          </div>
          <div className="skel-options" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cols }, (_, j) => <Skel key={j} h={84} r={12} />)}
          </div>
        </Card>
      ))}
    </Frame>
  );
}

/** Patient device page: device details card and session history card. */
export function DeviceInfoSkeleton({ label = 'Loading device' }) {
  return (
    <Frame label={label}>
      <div className="section-grid-2">
        <Card>
          <Skel w="45%" h={16} />
          <div className="skel-row" style={{ marginTop: 18, alignItems: 'flex-start' }}>
            <Skel w={72} h={72} r={16} />
            <div style={{ flex: 1, minWidth: 180 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skel-row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
                  <Skel w="35%" h={10} /><Skel w="30%" h={12} />
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card>
          <Skel w="40%" h={16} />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skel-row" style={{ marginTop: 18 }}>
              <Skel w={10} h={10} r={5} />
              <div style={{ flex: 1 }}><Skel w="40%" h={12} /><Skel w="65%" h={10} style={{ marginTop: 6 }} /></div>
            </div>
          ))}
        </Card>
      </div>
    </Frame>
  );
}
