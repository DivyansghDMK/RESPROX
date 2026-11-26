import React, { useMemo, useState } from 'react';
import { rebuildPacket, packetSteps } from '../services/packetLog';

/** One settings packet's log: what it says, its bytes, and the server row. */
export default function PacketLog({ row }) {
  const packet = useMemo(() => rebuildPacket(row), [row]);
  const steps = useMemo(() => packetSteps(row), [row]);
  const [copied, setCopied] = useState('');

  const copy = (label, text) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    }).catch(() => {});
  };

  if (!packet) return null;
  const name = packet.kind === 'FULL_SYNC' ? 'FULL_SYNC' : `UPDATE (${row.mode})`;

  return (
    <div className="session-log">
      <h4>What the device sent</h4>
      <dl className="session-log-steps">
        {steps.map(([k, v]) => (
          <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>
        ))}
      </dl>

      <h4>
        Raw packet: {name}, {packet.bytes.length} bytes
        <button type="button" onClick={() => copy('hex', packet.hex)}>{copied === 'hex' ? 'Copied' : 'Copy hex'}</button>
        <button type="button" onClick={() => copy('dec', packet.decimal)}>{copied === 'dec' ? 'Copied' : 'Copy as [..]'}</button>
      </h4>
      <code className="session-log-hex">{packet.hex}</code>
      <p className="session-log-note">
        Rebuilt from the fields the server stores: it keeps the decoded values, not the bytes received.
        Every field sits at a fixed byte (BLE protocol Rev 3.1), so the bytes are the same; the checksum is worked out again.
      </p>
      <details>
        <summary>Byte by byte</summary>
        <table className="session-log-bytes">
          <thead><tr><th>Byte</th><th>Hex</th><th>Group</th><th>Field</th><th>Value</th></tr></thead>
          <tbody>
            {packet.fields.map((f) => (
              <tr key={f.byte} className={f.muted ? 'not-stored' : undefined}>
                <td>{f.byte}</td><td><code>{f.hex}</code></td><td>{f.group}</td><td>{f.name}</td><td>{f.decoded}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <details>
        <summary>Server row (as received from GET /telemetry/history)</summary>
        <pre className="session-log-json">{JSON.stringify(row, null, 2)}</pre>
      </details>
    </div>
  );
}
