// src/pages/HelpSupport.jsx
//
// Help for DeckMount's service team, not patients: what to check when a
// device misbehaves, a quick check that the server answers, the last
// failures this browser saw (to copy to the backend team), and who to ask.

import React, { useEffect, useState } from 'react';
import GlassCard from '../components/GlassCard';
import { devicesAPI } from '../services/respireeApi';
import { describeError } from '../services/apiError';
import {
  BUILD, BUILT_AT, clearFailures, copyText, onFailuresChange, recentFailures,
} from '../services/diagnostics';

const TROUBLESHOOTING = [
  {
    q: 'A device shows Offline',
    a: 'The server has not heard from it. Check it is switched on and on Wi-Fi; Devices shows when it was last seen. Commands are not sent to an offline device, so nothing is lost.',
  },
  {
    q: 'A device shows "Connected to app"',
    a: 'The phone app holds it over Bluetooth, so it has left Wi-Fi on purpose. Settings and commands from the website cannot reach it until the app disconnects; the device then rejoins Wi-Fi by itself.',
  },
  {
    q: 'A settings change says "the device didn’t confirm"',
    a: 'The server sent it but no acknowledgement came back. Refresh in a minute: the device may still have applied it. If every change times out, the device-to-server path may be down: ask the backend team to check the IoT rule respiree_pub is enabled.',
  },
  {
    q: 'Therapy has to be stopped',
    a: 'Only on the device itself. The website can start therapy but never stops it.',
  },
  {
    q: 'Sessions show odd dates (e.g. a year ago)',
    a: 'Session dates come from the device’s own clock, stored as the device sent them. A wrong date means the device clock was wrong at the time, for example after a reset. Pick the report dates by hand until it is set.',
  },
  {
    q: 'Report sync or the dashboard is slow',
    a: 'A device with a long history has over a thousand sessions; the first open of it loads them all, later opens only the new ones. If every request is slow, use "Check server" below and send the result to the backend team.',
  },
  {
    q: 'The Activity Log shows no changes "from the website"',
    a: 'The server does not list the commands the website sends yet. Until it does, a change sent from the website appears when the device reports it, marked as a device change.',
  },
];

function when(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function failureLine(f) {
  const result = f.status ? `HTTP ${f.status}` : f.code || 'error';
  return `${f.at}  ${f.method} ${f.path}  ${result}  ${f.message}  (page ${f.page})`;
}

function ServerCheck() {
  const [state, setState] = useState({ phase: 'idle' });
  const run = async () => {
    setState({ phase: 'running' });
    const started = performance.now();
    try {
      const devices = await devicesAPI.getDevices({ force: true });
      setState({ phase: 'ok', ms: Math.round(performance.now() - started), count: devices.length });
    } catch (e) {
      setState({ phase: 'failed', ms: Math.round(performance.now() - started), d: describeError(e, { action: 'reach the server' }) });
    }
  };
  return (
    <div className="help-check">
      <button type="button" className="icon-text-button" onClick={run} disabled={state.phase === 'running'}>
        {state.phase === 'running' ? 'Checking…' : 'Check server'}
      </button>
      <span role="status" aria-live="polite">
        {state.phase === 'ok' && <><b className={state.ms > 2000 ? 'slow' : 'good'}>Answered in {state.ms} ms</b> · {state.count} device{state.count === 1 ? '' : 's'} visible{state.ms > 2000 ? ' · slow, tell the backend team' : ''}</>}
        {state.phase === 'failed' && <b className="bad">{state.d.title} after {state.ms} ms</b>}
        {state.phase === 'idle' && 'Times a request to the Resprox server.'}
      </span>
    </div>
  );
}

export default function HelpSupport() {
  const [openFaq, setOpenFaq] = useState(null);
  const [failures, setFailures] = useState(recentFailures());
  const [copied, setCopied] = useState(null);
  useEffect(() => onFailuresChange((list) => setFailures([...list])), []);

  const copyAll = async () => {
    const text = ['Resprox recent failures', `App build: ${BUILD}${BUILT_AT ? ` (${BUILT_AT})` : ''}`, `Browser: ${navigator.userAgent}`, '', ...failures.map(failureLine)].join('\n');
    setCopied((await copyText(text)) ? 'Copied' : 'Couldn’t copy');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="helpsupport-page">
      <div className="section-grid-2">
        <GlassCard>
          <div className="section-title"><h2>Troubleshooting</h2></div>
          <div className="faq-list">
            {TROUBLESHOOTING.map((faq, idx) => (
              <div key={faq.q} className="faq-item">
                <button
                  className={`faq-question-btn ${openFaq === idx ? 'expanded' : ''}`}
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  aria-expanded={openFaq === idx}
                >
                  <span>{faq.q}</span>
                  <span className="faq-toggle" aria-hidden="true">+</span>
                </button>
                {openFaq === idx && <div className="faq-answer-panel"><p>{faq.a}</p></div>}
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="section-title"><h2>System check</h2></div>
          <dl className="help-facts">
            <dt>App build</dt><dd>{BUILD}{BUILT_AT ? ` · ${BUILT_AT}` : ''}</dd>
            <dt>Browser online</dt><dd>{typeof navigator !== 'undefined' && navigator.onLine ? 'Yes' : 'No'}</dd>
          </dl>
          <ServerCheck />

          <div className="section-title" style={{ marginTop: 24 }}><h2>Who to ask</h2></div>
          <ul className="help-contacts">
            <li><b>Server, data or a request failing</b> (errors with an HTTP status, slow server): the backend team. Send the error report.</li>
            <li><b>A page broken or showing wrong values</b>: the web team. Send the error report and the device serial.</li>
            <li><b>A device fault</b> (won’t connect, wrong clock, odd readings): firmware team, with the serial.</li>
            <li>Helpdesk: <a href="mailto:support@deckmount.in">support@deckmount.in</a></li>
          </ul>
        </GlassCard>
      </div>

      <GlassCard style={{ marginTop: 20 }}>
        <div className="section-title table-title-row">
          <div>
            <h2>Recent errors in this browser</h2>
            <p className="activity-sub">The last {failures.length || ''} failed requests this tab saw. Copy them for the backend team.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="icon-text-button" onClick={copyAll} disabled={!failures.length}>{copied || 'Copy all'}</button>
            <button type="button" className="icon-text-button" onClick={clearFailures} disabled={!failures.length}>Clear</button>
          </div>
        </div>
        {!failures.length ? (
          <div className="activity-empty">No failed requests in this tab. Good.</div>
        ) : (
          <div className="table-responsive">
            <table className="activity-table help-failures">
              <thead><tr><th>When</th><th>Request</th><th>Result</th><th>Message</th><th>Page</th></tr></thead>
              <tbody>
                {failures.map((f, i) => (
                  <tr key={`${f.at}-${i}`}>
                    <td style={{ whiteSpace: 'nowrap' }}>{when(f.at)}</td>
                    <td className="mono">{f.method} {f.path}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><span className={`activity-status ${f.status && f.status < 500 ? 'pending' : 'failed'}`}>{f.status ? `HTTP ${f.status}` : f.code || 'error'}</span></td>
                    <td>{f.message}</td>
                    <td className="mono">{f.page}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
