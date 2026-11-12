// src/pages/Dealers.jsx
//
// Admin: add dealers, edit them, and give each one their devices. A dealer then
// signs in to a limited view of just those devices and adds their own customers.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import Modal, { Field } from '../components/Modal';
import { DeviceListSkeleton } from '../components/Skeleton';
import { useAccess } from '../context/AccessContext';
import { useNotify } from '../context/NotifyContext';
import { devicesAPI } from '../services/respireeApi';
import { partnersAPI } from '../services/partnersApi';
import { validateDealer } from '../services/partners';
import { describeError } from '../services/apiError';
import { NotDeployed, PreviewNotice } from '../components/PartnerStates';

const EMPTY = { name: '', company: '', email: '', phone: '', city: '' };

function DealerForm({ initial, onCancel, onSaved }) {
  const notify = useNotify();
  const [form, setForm] = useState({ ...EMPTY, ...initial });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const editing = Boolean(initial?.id);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const found = validateDealer(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const data = { name: form.name, company: form.company, email: form.email, phone: form.phone, city: form.city };
      if (editing) await partnersAPI.updateDealer(initial.id, data);
      else await partnersAPI.createDealer(data);
      notify.success(editing ? `${form.name} updated` : `${form.name} added`, {
        message: editing ? undefined : 'Next, give them their devices with “Devices”.',
      });
      onSaved();
    } catch (err) {
      if (err.status === 409) setErrors({ email: err.message });
      else notify.fromError(err, { action: editing ? 'update this dealer' : 'add this dealer' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Edit dealer' : 'Add dealer'}
      onClose={onCancel}
      busy={saving}
      footer={(
        <>
          <button type="button" className="admin-page-btn" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" form="dealer-form" className="admin-page-btn primary" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add dealer'}
          </button>
        </>
      )}
    >
      <form id="dealer-form" className="modal-form" onSubmit={submit} noValidate>
        <Field id="dealer-name" label="Name" error={errors.name}>
          <input id="dealer-name" value={form.name} onChange={set('name')} autoComplete="name" aria-invalid={Boolean(errors.name)} />
        </Field>
        <Field id="dealer-company" label="Company (optional)">
          <input id="dealer-company" value={form.company} onChange={set('company')} autoComplete="organization" />
        </Field>
        <Field id="dealer-email" label="Email" error={errors.email} hint="They sign in with this address.">
          <input id="dealer-email" type="email" value={form.email} onChange={set('email')} autoComplete="email" aria-invalid={Boolean(errors.email)} />
        </Field>
        <div className="modal-form-row">
          <Field id="dealer-phone" label="Phone (optional)" error={errors.phone}>
            <input id="dealer-phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" aria-invalid={Boolean(errors.phone)} />
          </Field>
          <Field id="dealer-city" label="City (optional)">
            <input id="dealer-city" value={form.city} onChange={set('city')} autoComplete="address-level2" />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function DeviceAssignDialog({ dealer, dealers, onCancel, onSaved }) {
  const notify = useNotify();
  const [devices, setDevices] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [chosen, setChosen] = useState(() => new Set(dealer.device_serials));
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    devicesAPI.getDevices().then(setDevices, setLoadError);
  }, []);

  // Which other dealer has each device, so it can't be given out twice.
  const owner = useMemo(() => {
    const map = new Map();
    dealers.filter((d) => d.id !== dealer.id).forEach((d) => d.device_serials.forEach((s) => map.set(s, d.name)));
    return map;
  }, [dealers, dealer.id]);

  const shown = (devices || []).filter((d) => d.serial.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (serial) => setChosen((prev) => {
    const next = new Set(prev);
    if (next.has(serial)) next.delete(serial); else next.add(serial);
    return next;
  });

  const save = async () => {
    setSaving(true);
    try {
      await partnersAPI.setDealerDevices(dealer.id, [...chosen]);
      notify.success(`${dealer.name} now has ${chosen.size} device${chosen.size === 1 ? '' : 's'}`);
      onSaved();
    } catch (err) {
      notify.fromError(err, { action: 'save this dealer’s devices' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Devices for ${dealer.name}`}
      onClose={onCancel}
      busy={saving}
      wide
      footer={(
        <>
          <span className="modal-foot-note">{chosen.size} selected</span>
          <button type="button" className="admin-page-btn" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" className="admin-page-btn primary" onClick={save} disabled={saving || !devices}>
            {saving ? 'Saving…' : 'Save devices'}
          </button>
        </>
      )}
    >
      <p className="modal-lead">
        The dealer sees only these devices. They can change comfort settings on them and add their customers;
        pressure, mode and start/stop therapy stay with admin.
      </p>
      <input
        className="admin-search-input modal-search"
        placeholder="Search by serial number…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search devices"
      />
      {loadError ? (
        <p className="modal-field-error">{describeError(loadError, { action: 'load the devices' }).message}</p>
      ) : !devices ? (
        <p className="modal-lead">Loading devices…</p>
      ) : shown.length === 0 ? (
        <p className="modal-lead">No devices match.</p>
      ) : (
        <ul className="device-pick-list">
          {shown.map((d) => {
            const takenBy = owner.get(d.serial);
            return (
              <li key={d.serial}>
                <label className={takenBy ? 'is-taken' : ''}>
                  <input
                    type="checkbox"
                    checked={chosen.has(d.serial)}
                    disabled={Boolean(takenBy)}
                    onChange={() => toggle(d.serial)}
                  />
                  <span className="device-pick-serial">{d.serial}</span>
                  <span className="device-pick-meta">{takenBy ? `with ${takenBy}` : d.model && d.model !== d.serial ? d.model : ''}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

function ConfirmRemove({ dealer, onCancel, onDone }) {
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await partnersAPI.deleteDealer(dealer.id);
      notify.success(`${dealer.name} removed`);
      onDone();
    } catch (err) {
      notify.fromError(err, { action: 'remove this dealer' });
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Remove dealer?"
      onClose={onCancel}
      busy={busy}
      footer={(
        <>
          <button type="button" className="admin-page-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="admin-page-btn danger" onClick={remove} disabled={busy}>
            {busy ? 'Removing…' : 'Remove dealer'}
          </button>
        </>
      )}
    >
      <p className="modal-lead">
        <strong>{dealer.name}</strong> will no longer be able to sign in.
        {dealer.customer_count > 0 && <> Their {dealer.customer_count} customer{dealer.customer_count === 1 ? '' : 's'} will be removed too.</>}
        {' '}The devices themselves are not affected and become unassigned.
      </p>
    </Modal>
  );
}

export default function Dealers() {
  const access = useAccess();
  const [dealers, setDealers] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null); // { kind: 'add' | 'edit' | 'devices' | 'remove', dealer }

  const load = useCallback(async () => {
    setError(null);
    try {
      setDealers(await partnersAPI.listDealers());
    } catch (err) {
      setError(err);
      setDealers([]);
    }
  }, []);

  useEffect(() => { if (access.manageDealers) load(); }, [access.manageDealers, load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (dealers || []).filter((d) => !q || [d.name, d.company, d.email, d.city, ...d.device_serials]
      .some((v) => String(v || '').toLowerCase().includes(q)));
  }, [dealers, query]);

  if (!access.manageDealers) {
    return (
      <GlassCard>
        <div className="admin-empty partner-empty"><p>Only admins can manage dealers.</p></div>
      </GlassCard>
    );
  }

  const close = () => setDialog(null);
  const saved = () => { setDialog(null); load(); };

  return (
    <div className="partners-page">
      <GlassCard>
        <div className="section-title table-title-row">
          <div>
            <h2>Dealers</h2>
            <p className="partner-subtitle">Add a dealer, then give them their devices. They add their own customers.</p>
          </div>
          <button type="button" className="admin-page-btn primary" onClick={() => setDialog({ kind: 'add' })}>
            + Add dealer
          </button>
        </div>
        <PreviewNotice />

        <div className="admin-toolbar">
          <div className="admin-search-wrap">
            <input
              className="admin-search-input"
              placeholder="Search name, email, city or serial…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search dealers"
            />
          </div>
          <span className="admin-count-label">
            {dealers ? `${shown.length} dealer${shown.length === 1 ? '' : 's'}` : '…'}
          </span>
        </div>

        {!dealers ? (
          <DeviceListSkeleton rows={3} />
        ) : error ? (
          <NotDeployed error={error} onRetry={load} />
        ) : shown.length === 0 ? (
          <div className="admin-empty partner-empty">
            <p>{dealers.length ? 'No dealers match this search.' : 'No dealers yet. Add the first one.'}</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table partner-table">
              <thead>
                <tr>
                  <th>Dealer</th>
                  <th>Contact</th>
                  <th>City</th>
                  <th>Devices</th>
                  <th>Customers</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => (
                  <tr key={d.id}>
                    <td data-label="Dealer">
                      <strong>{d.name}</strong>
                      {d.company && <span className="partner-sub">{d.company}</span>}
                    </td>
                    <td data-label="Contact">
                      <span>{d.email}</span>
                      {d.phone && <span className="partner-sub">{d.phone}</span>}
                    </td>
                    <td data-label="City">{d.city || '—'}</td>
                    <td data-label="Devices">
                      {d.device_serials.length ? (
                        <span className="serial-chips">
                          {d.device_serials.slice(0, 3).map((s) => <Link key={s} to={`/device/${s}`} className="serial-chip">{s}</Link>)}
                          {d.device_serials.length > 3 && <span className="serial-chip more">+{d.device_serials.length - 3}</span>}
                        </span>
                      ) : <span className="partner-sub">None yet</span>}
                    </td>
                    <td data-label="Customers">
                      <Link to={`/customers?dealer=${encodeURIComponent(d.id)}`}>{d.customer_count ?? 0}</Link>
                    </td>
                    <td className="partner-actions">
                      <button type="button" className="admin-page-btn" onClick={() => setDialog({ kind: 'devices', dealer: d })}>Devices</button>
                      <button type="button" className="admin-page-btn" onClick={() => setDialog({ kind: 'edit', dealer: d })}>Edit</button>
                      <button type="button" className="admin-page-btn danger" onClick={() => setDialog({ kind: 'remove', dealer: d })}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {dialog?.kind === 'add' && <DealerForm onCancel={close} onSaved={saved} />}
      {dialog?.kind === 'edit' && <DealerForm initial={dialog.dealer} onCancel={close} onSaved={saved} />}
      {dialog?.kind === 'devices' && <DeviceAssignDialog dealer={dialog.dealer} dealers={dealers} onCancel={close} onSaved={saved} />}
      {dialog?.kind === 'remove' && <ConfirmRemove dealer={dialog.dealer} onCancel={close} onDone={saved} />}
    </div>
  );
}
