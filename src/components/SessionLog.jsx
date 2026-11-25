import React, { useMemo, useState } from 'react';
import { rebuildRecord, sessionSteps } from '../services/sessionLog';

/** One session's log: how it was worked out, its 43 bytes, and the server row. */
export default function SessionLog({ record }) {
  const row = record.raw && typeof record.raw === 'object' ? record.raw : null;
  const rebuilt = useMemo(() => (row ? rebuildRecord(row) : null), [row]);
  const steps = useMemo(() => sessionSteps(record), [record]);
  const [copied, setCopied] = useState('');

  const copy = (label, text) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    }).catch(() => {});
  };

  return (
    <div className="session-log">
      <h4>How this session was worked out</h4>
      <dl className="session-log-steps">
        {steps.map(([k, v]) => (
          <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>
        ))}
      </dl>

      {rebuilt && (
        <>
          <h4>
            Raw payload (43 bytes)
            <button type="button" onClick={() => copy('hex', rebuilt.hex)}>{copied === 'hex' ? 'Copied' : 'Copy hex'}</button>
            <button type="button" onClick={() => copy('dec', rebuilt.decimal)}>{copied === 'dec' ? 'Copied' : 'Copy as [..]'}</button>
          </h4>
          <code className="session-log-hex">{rebuilt.hex}</code>
          <p className="session-log-note">
            Rebuilt from the fields the server stores: it keeps the decoded values, not the bytes received.
            Bytes 33, 34, 37 and 39 are reserved and not stored (shown 00); the checksum is worked out again.
          </p>
          <details>
            <summary>Byte by byte</summary>
            <table className="session-log-bytes">
              <thead><tr><th>Byte</th><th>Hex</th><th>Field</th><th>Value</th><th>Server column</th></tr></thead>
              <tbody>
                {rebuilt.fields.map((f) => (
                  <tr key={f.byte} className={f.notStored ? 'not-stored' : undefined}>
                    <td>{f.byte}</td><td><code>{f.hex}</code></td><td>{f.name}</td><td>{f.decoded}</td><td><code>{f.column || '—'}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <details>
            <summary>Server row (as received from GET /reports)</summary>
            <pre className="session-log-json">{JSON.stringify(row, null, 2)}</pre>
          </details>
        </>
      )}
    </div>
  );
}
