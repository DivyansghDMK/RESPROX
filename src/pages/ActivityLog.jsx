// src/pages/ActivityLog.jsx
//
// Everything the selected device did, newest first: therapy sessions, settings
// changed on the device, settings sent from the website (and whether the
// device confirmed them), and full settings syncs. Counts at the top, filters
// by where a change came from and what kind it was.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import GlassCard from '../components/GlassCard';
import DeviceDataState from '../components/DeviceDataState';
import { useTherapy } from '../context/TherapyContext';
import { devicesAPI } from '../services/respireeApi';
import { buildActivity } from '../services/activityLog';
import { describeError } from '../services/apiError';

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

const dayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const clockLabel = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

function SourceBadge({ source }) {
  return (
    <span className={`activity-source ${source}`}>
      {source === 'website' ? 'Website' : 'Device'}
    </span>
  );
}

function EventRow({ e }) {
  const when = new Date(e.at);
  return (
    <li className={`activity-row kind-${e.kind}`}>
      <span className="activity-time">{Number.isNaN(when.getTime()) ? '—' : clockLabel.format(when)}</span>
      <span className={`activity-dot kind-${e.kind}`} aria-hidden="true" />
      <div className="activity-body">
        <div className="activity-title">
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

export default function ActivityLog() {
  const { deviceData } = useTherapy();
  const serial = deviceData?.serial || '';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState('all');
  const [kind, setKind] = useState('all');
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(async () => {
    if (!serial) return;
    setLoading(true);
    setError(null);
    try {
      setData(buildActivity(await devicesAPI.getDeviceActivity(serial)));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [serial]);

  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => setShown(PAGE), [source, kind, serial]);

  const filtered = useMemo(() => (data?.events || []).filter((e) => (source === 'all' || e.source === source)
    && (kind === 'all' || e.kind === kind || (kind === 'settings' && e.kind === 'command'))), [data, source, kind]);

  // Group the visible events by calendar day.
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

  if (!deviceData) return <DeviceDataState what="the activity log" />;

  const c = data?.counts;
  const err = error && describeError(error, { action: 'load the activity log', subject: serial });

  return (
    <div className="activity-page">
      <GlassCard>
        <div className="section-title table-title-row">
          <div>
            <h2>Activity Log</h2>
            <p className="activity-sub">Everything {serial} did, and whether it was done on the device or sent from the website.</p>
          </div>
          <button type="button" className="icon-text-button" onClick={load} disabled={loading}>
            <span aria-hidden="true">⟳</span><span>{loading ? 'Loading…' : 'Refresh'}</span>
          </button>
        </div>

        <div className="activity-stats">
          <div className="activity-stat therapy"><b>{c ? c.therapy : '–'}</b><span>Therapy sessions</span><small>Started and stopped on the device</small></div>
          <div className="activity-stat device"><b>{c ? c.deviceChanges : '–'}</b><span>Changed on the device</span><small>Settings changed on its screen</small></div>
          <div className="activity-stat website">
            <b>{c ? (data.hasCommands ? c.websiteChanges : '–') : '–'}</b>
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
      </GlassCard>

      <GlassCard style={{ marginTop: 20 }}>
        {err ? (
          <div className="load-error" role="alert">
            <strong>{err.title}</strong>
            <p>{err.message}</p>
            {err.retryable && <button className="admin-page-btn primary" onClick={load}>Try again</button>}
          </div>
        ) : !data ? (
          <div className="activity-empty">Loading the activity for {serial}…</div>
        ) : !filtered.length ? (
          <div className="activity-empty">Nothing here for these filters.</div>
        ) : (
          <>
            {groups.map((g) => (
              <section key={g.key} className="activity-day">
                <h3>{g.label}<span>{g.events.length}</span></h3>
                <ol className="activity-list">
                  {g.events.map((e) => <EventRow key={e.id} e={e} />)}
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
        )}
      </GlassCard>
    </div>
  );
}
