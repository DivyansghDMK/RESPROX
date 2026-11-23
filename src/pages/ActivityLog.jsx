// src/pages/ActivityLog.jsx
//
// Activity Log, at two levels:
//
//   /activity          every device the account can see: who is online, what
//                      each did in the last 7 days, and one feed of recent
//                      events across all of them, each tagged with its device
//   /activity/:serial  one device's full history: therapy sessions, settings
//                      changed on the device (before and after), full syncs,
//                      and settings sent from the website once the server
//                      lists them, with a switcher to jump to another device
//
// Counts at the top, filters by where a change came from and what kind it was.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import { devicesAPI } from '../services/respireeApi';
import { buildActivity, buildFleetActivity } from '../services/activityLog';
import { describeError } from '../services/apiError';
import { therapyLabel } from '../services/deviceStatus';
import { useAccess } from '../context/AccessContext';

const PAGE = 60;

const SOURCES = [
  { key: 'all', label: 'All' },
  { key: 'device', label: 'On the device' },
  { key: 'website', label: 'From the website' },
];

const KINDS = [
  { key: 'all', label: 'Everything' },
  { key: 'therapy', label: 'Therapy sessions' },
  { key: 'settings', label: 'Settings changes' },
  { key: 'full-sync', label: 'Full syncs' },
];

const CONNECTION = { online: 'Online', offline: 'Offline', phone: 'On phone app', unknown: 'Unknown' };

const dayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const clockLabel = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

function ago(ms) {
  if (!ms) return '—';
  const d = Date.now() - ms;
  if (d < 0) return 'device clock ahead';
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(h / 24);
  return days < 30 ? `${days} d ago` : dayLabel.format(new Date(ms));
}

// ── shared pieces ─────────────────────────────────────────────────────────────

function SourceBadge({ source }) {
  return <span className={`activity-source ${source}`}>{source === 'website' ? 'Website' : 'Device'}</span>;
}

function EventRow({ e, showDevice }) {
  const when = new Date(e.at);
  return (
    <li className={`activity-row kind-${e.kind}`}>
      <span className="activity-time">{Number.isNaN(when.getTime()) ? '—' : clockLabel.format(when)}</span>
      <span className={`activity-dot kind-${e.kind}`} aria-hidden="true" />
      <div className="activity-body">
        <div className="activity-title">
          {showDevice && <Link className="activity-device-chip" to={`/activity/${encodeURIComponent(e.serial)}`}>{e.serial}</Link>}
          <SourceBadge source={e.source} />
          <span>{e.title}</span>
          {e.status && <span className={`activity-status ${e.status.key}`}>{e.status.label}</span>}
        </div>
        {e.detail && <div className="activity-detail">{e.detail}</div>}
        {e.changes?.length > 0 && (
          <div className="activity-changes">
            {e.changes.map((c) => (
              <span key={c.key + c.label} className="activity-change">
                {c.label}: {c.from != null && <><s>{c.from}</s> → </>}<b>{c.to}</b>
              </span>
            ))}
          </div>
        )}
        {e.kind === 'full-sync' && !e.changes?.length && <div className="activity-detail">No values changed.</div>}
      </div>
    </li>
  );
}

function Filters({ source, setSource, kind, setKind }) {
  return (
    <div className="activity-filters">
      <div className="activity-chips" role="group" aria-label="Where the change came from">
        {SOURCES.map((s) => (
          <button key={s.key} type="button" className={source === s.key ? 'on' : ''} aria-pressed={source === s.key} onClick={() => setSource(s.key)}>{s.label}</button>
        ))}
      </div>
      <div className="activity-chips" role="group" aria-label="Kind of activity">
        {KINDS.map((k) => (
          <button key={k.key} type="button" className={kind === k.key ? 'on' : ''} aria-pressed={kind === k.key} onClick={() => setKind(k.key)}>{k.label}</button>
        ))}
      </div>
    </div>
  );
}

/** Events filtered, then grouped by calendar day, with "Show more". */
function Timeline({ events, source, kind, showDevice, emptyText }) {
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [source, kind, events]);

  const filtered = useMemo(() => events.filter((e) => (source === 'all' || e.source === source)
    && (kind === 'all' || e.kind === kind || (kind === 'settings' && e.kind === 'command'))), [events, source, kind]);

  const groups = useMemo(() => {
    const out = [];
    for (const e of filtered.slice(0, shown)) {
      const d = new Date(e.at);
      const key = Number.isNaN(d.getTime()) ? 'unknown' : d.toDateString();
      if (!out.length || out[out.length - 1].key !== key) out.push({ key, label: key === 'unknown' ? 'Unknown date' : dayLabel.format(d), events: [] });
      out[out.length - 1].events.push(e);
    }
    return out;
  }, [filtered, shown]);

  if (!filtered.length) return <div className="activity-empty">{emptyText}</div>;
  return (
    <>
      {groups.map((g) => (
        <section key={g.key} className="activity-day">
          <h3>{g.label}<span>{g.events.length}</span></h3>
          <ol className="activity-list">
            {g.events.map((e) => <EventRow key={e.id} e={e} showDevice={showDevice} />)}
          </ol>
        </section>
      ))}
      {filtered.length > shown && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button type="button" className="icon-text-button" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({filtered.length - shown} older)
          </button>
        </div>
      )}
    </>
  );
}

function LoadError({ error, what, onRetry }) {
  const err = describeError(error, { action: what });
  return (
    <div className="load-error" role="alert">
      <strong>{err.title}</strong>
      <p>{err.message}</p>
      {err.retryable && <button className="admin-page-btn primary" onClick={onRetry}>Try again</button>}
    </div>
  );
}

/** Loads with `loader`, keeps the last good result while refreshing. */
function useLoad(loader, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      setData(await loader(force));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, setData, error, loading, load };
}

// ── all devices ──────────────────────────────────────────────────────────────

function FleetActivity() {
  const navigate = useNavigate();
  const [source, setSource] = useState('all');
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const { data, error, loading, load } = useLoad(
    async (force) => buildFleetActivity(await devicesAPI.getFleetActivity({ force })), [],
  );
  useEffect(() => { load(); }, [load]);

  const t = data?.totals;
  const q = query.trim().toUpperCase();
  const devices = (data?.devices || []).filter((d) => !q || d.serial.toUpperCase().includes(q) || String(d.model || '').toUpperCase().includes(q));
  const feed = useMemo(() => (q ? (data?.feed || []).filter((e) => e.serial.toUpperCase().includes(q)) : (data?.feed || [])), [data, q]);

  return (
    <div className="activity-page">
      <GlassCard>
        <div className="section-title table-title-row">
          <div>
            <h2>Activity Log · All devices</h2>
            <p className="activity-sub">
              What every device did in the last 7 days{t ? ` (${t.devices} device${t.devices === 1 ? '' : 's'})` : ''}. Open a device for its full history.
            </p>
          </div>
          <button type="button" className="icon-text-button" onClick={() => load(true)} disabled={loading}>
            <span aria-hidden="true">⟳</span><span>{loading ? 'Loading…' : 'Refresh'}</span>
          </button>
        </div>

        <div className="activity-stats">
          <div className="activity-stat device"><b>{t ? `${t.online}/${t.devices}` : '–'}</b><span>Online now</span><small>{t ? `${t.activeThisWeek} active this week` : 'Devices the server sees on Wi-Fi'}</small></div>
          <div className="activity-stat therapy"><b>{t ? t.therapy : '–'}</b><span>Therapy sessions</span><small>Last 7 days, all devices</small></div>
          <div className="activity-stat website"><b>{t ? t.deviceChanges : '–'}</b><span>Changed on devices</span><small>Settings changed on a device's screen</small></div>
          <div className="activity-stat sync"><b>{t ? t.fullSyncs : '–'}</b><span>Full syncs</span><small>A device sent all its settings</small></div>
        </div>

        <div className="activity-search">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a device by serial or model" aria-label="Find a device" />
        </div>
      </GlassCard>

      <GlassCard style={{ marginTop: 20 }}>
        <div className="section-title"><h2>Devices</h2></div>
        {error && !data ? (
          <LoadError error={error} what="load the activity log" onRetry={() => load(true)} />
        ) : !data ? (
          <div className="activity-empty">Loading every device’s recent activity…</div>
        ) : !devices.length ? (
          <div className="activity-empty">{q ? 'No device matches that search.' : 'No devices on this account.'}</div>
        ) : (
          <div className="table-responsive">
            <table className="activity-table">
              <thead>
                <tr>
                  <th>Device</th><th>Connection</th><th>Last activity</th>
                  <th className="num">Sessions (7 d)</th><th className="num">Changed on device (7 d)</th><th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.serial} onClick={() => navigate(`/activity/${encodeURIComponent(d.serial)}`)} tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/activity/${encodeURIComponent(d.serial)}`); }}>
                    <td><b className="mono">{d.serial}</b>{d.model && <small>{d.model}</small>}</td>
                    <td>
                      <span className={`activity-conn ${d.status}`}>{CONNECTION[d.status] || d.status}</span>
                      {therapyLabel(d.therapyStatus) && <small>{therapyLabel(d.therapyStatus)}</small>}
                    </td>
                    <td>
                      {d.failed ? <span className="muted">Couldn’t load</span> : d.latest ? (
                        <><span>{d.latest.title}</span><small>{ago(d.latest.at)}</small></>
                      ) : <span className="muted">Nothing recorded</span>}
                    </td>
                    <td className="num">{d.week.therapy}</td>
                    <td className="num">{d.week.deviceChanges}</td>
                    <td className="go"><span aria-hidden="true">›</span><span className="sr-only">Open log</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <GlassCard style={{ marginTop: 20 }}>
        <div className="section-title"><h2>Recent activity, all devices</h2></div>
        <p className="activity-sub" style={{ marginTop: -6 }}>Each device’s latest settings packets and sessions. Open a device for everything.</p>
        <Filters source={source} setSource={setSource} kind={kind} setKind={setKind} />
        <div style={{ marginTop: 14 }}>
          {data ? <Timeline events={feed} source={source} kind={kind} showDevice emptyText="Nothing here for these filters." />
            : !error && <div className="activity-empty">Loading…</div>}
        </div>
      </GlassCard>
    </div>
  );
}

// ── one device ───────────────────────────────────────────────────────────────

function DeviceActivity({ serial }) {
  const navigate = useNavigate();
  const [source, setSource] = useState('all');
  const [kind, setKind] = useState('all');
  const [devices, setDevices] = useState([]);
  const { data, setData, error, loading, load } = useLoad(
    async () => buildActivity(await devicesAPI.getDeviceActivity(serial)), [serial],
  );
  useEffect(() => { setData(null); load(); }, [load, setData]);
  useEffect(() => { devicesAPI.getDevices().then(setDevices).catch(() => {}); }, []);

  const c = data?.counts;
  return (
    <div className="activity-page">
      <GlassCard>
        <div className="activity-crumbs">
          <Link to="/activity">← All devices</Link>
          {devices.length > 1 && (
            <label>
              <span>Device</span>
              <select value={serial} onChange={(e) => navigate(`/activity/${encodeURIComponent(e.target.value)}`)}>
                {!devices.some((d) => d.serial === serial) && <option value={serial}>{serial}</option>}
                {devices.map((d) => <option key={d.serial} value={d.serial}>{d.serial}{d.model ? ` · ${d.model}` : ''}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="section-title table-title-row">
          <div>
            <h2>Activity Log · <span className="mono">{serial}</span></h2>
            <p className="activity-sub">Everything this device did, and whether it was done on the device or sent from the website.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="icon-text-button" to={`/device/${encodeURIComponent(serial)}`}>Open dashboard</Link>
            <button type="button" className="icon-text-button" onClick={() => load()} disabled={loading}>
              <span aria-hidden="true">⟳</span><span>{loading ? 'Loading…' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        <div className="activity-stats">
          <div className="activity-stat therapy"><b>{c ? c.therapy : '–'}</b><span>Therapy sessions</span><small>Started and stopped on the device</small></div>
          <div className="activity-stat device"><b>{c ? c.deviceChanges : '–'}</b><span>Changed on the device</span><small>Settings changed on its screen</small></div>
          <div className="activity-stat website">
            <b>{c && data.hasCommands ? c.websiteChanges : '–'}</b>
            <span>Sent from the website</span>
            <small>{data?.hasCommands ? `${c.websiteConfirmed} confirmed by the device` : 'Not available from the server yet'}</small>
          </div>
          <div className="activity-stat sync"><b>{c ? c.fullSyncs : '–'}</b><span>Full syncs</span><small>Device sent all its settings</small></div>
        </div>

        {data && !data.hasCommands && (
          <div className="activity-note" role="note">
            The server does not list the settings the website sends yet. Until it does, a change sent from the website shows here
            when the device reports it, marked as a device change.
          </div>
        )}

        <Filters source={source} setSource={setSource} kind={kind} setKind={setKind} />
      </GlassCard>

      <GlassCard style={{ marginTop: 20 }}>
        {error && !data ? (
          <LoadError error={error} what="load the activity log" onRetry={() => load()} />
        ) : !data ? (
          <div className="activity-empty">Loading the activity for {serial}…</div>
        ) : (
          <Timeline events={data.events} source={source} kind={kind} emptyText="Nothing here for these filters." />
        )}
      </GlassCard>
    </div>
  );
}

export default function ActivityLog() {
  const { serial } = useParams();
  const access = useAccess();
  if (!serial) return <FleetActivity />;
  if (access.dealerLoading) return <div className="activity-empty">Loading…</div>;
  // A dealer opening a device that isn't theirs (old link, typed serial).
  if (!access.canSeeDevice(serial)) {
    return (
      <div className="admin-empty partner-empty" style={{ background: 'var(--panel-strong)', borderRadius: 16, border: '1px solid var(--line)' }}>
        <p style={{ fontWeight: 700 }}>{serial} isn’t one of your devices</p>
        <Link className="admin-page-btn" to="/activity">← All devices</Link>
      </div>
    );
  }
  return <DeviceActivity key={serial} serial={serial} />;
}
