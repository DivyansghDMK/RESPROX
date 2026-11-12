// src/pages/Customers.jsx
//
// A dealer's customers, and which of the dealer's devices each one uses.
// Dealers see and add only their own; admin sees everyone's and can filter by
// dealer (?dealer=<id>, linked from the Dealers page).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import Modal, { Field } from '../components/Modal';
import { DeviceListSkeleton } from '../components/Skeleton';
import { useAccess } from '../context/AccessContext';
import { useNotify } from '../context/NotifyContext';
import { partnersAPI } from '../services/partnersApi';
import { validateCustomer } from '../services/partners';
import { NotDeployed, PreviewNotice } from '../components/PartnerStates';

const EMPTY = { name: '', phone: '', email: '', device_serial: '', notes: '', dealer_id: '' };

function CustomerForm({ initial, dealers, customers, fixedDealer, onCancel, onSaved }) {
  const notify = useNotify();
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState({
    ...EMPTY,
    ...initial,
    device_serial: initial?.device_serial || '',
    dealer_id: initial?.dealer_id || fixedDealer?.id || '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({
    ...f,
    [key]: e.target.value,
    // A device belongs to a dealer, so changing the dealer clears it.
    ...(key === 'dealer_id' ? { device_serial: '' } : {}),
  }));

  const dealer = fixedDealer || dealers.find((d) => d.id === form.dealer_id) || null;
  // The dealer's devices that no other customer uses yet.
  const freeDevices = useMemo(() => {
    const used = new Set(customers.filter((c) => c.id !== initial?.id && c.device_serial).map((c) => c.device_serial));
    return (dealer?.device_serials || []).filter((s) => !used.has(s));
  }, [dealer, customers, initial]);

  const submit = async (e) => {
    e.preventDefault();
    const found = validateCustomer(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const data = {
        name: form.name, phone: form.phone, email: form.email,
        device_serial: form.device_serial || null, notes: form.notes,
      };
      if (editing) await partnersAPI.updateCustomer(initial.id, data);
      else await partnersAPI.createCustomer({ ...data, dealer_id: form.dealer_id });
      notify.success(editing ? `${form.name} updated` : `${form.name} added`);
      onSaved();
    } catch (err) {
      if (err.status === 409) setErrors({ device_serial: err.message });
      else notify.fromError(err, { action: editing ? 'update this customer' : 'add this customer' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Edit customer' : 'Add customer'}
      onClose={onCancel}
      busy={saving}
      footer={(
        <>
          <button type="button" className="admin-page-btn" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" form="customer-form" className="admin-page-btn primary" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add customer'}
          </button>
        </>
      )}
    >
      <form id="customer-form" className="modal-form" onSubmit={submit} noValidate>
        {!fixedDealer && !editing && (
          <Field id="customer-dealer" label="Dealer" error={errors.dealer_id}>
            <select id="customer-dealer" value={form.dealer_id} onChange={set('dealer_id')} aria-invalid={Boolean(errors.dealer_id)}>
              <option value="">Choose a dealer…</option>
              {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}{d.company ? ` · ${d.company}` : ''}</option>)}
            </select>
          </Field>
        )}
        <Field id="customer-name" label="Name" error={errors.name}>
          <input id="customer-name" value={form.name} onChange={set('name')} autoComplete="off" aria-invalid={Boolean(errors.name)} />
        </Field>
        <div className="modal-form-row">
          <Field id="customer-phone" label="Phone (optional)" error={errors.phone}>
            <input id="customer-phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="off" aria-invalid={Boolean(errors.phone)} />
          </Field>
          <Field id="customer-email" label="Email (optional)" error={errors.email}>
            <input id="customer-email" type="email" value={form.email} onChange={set('email')} autoComplete="off" aria-invalid={Boolean(errors.email)} />
          </Field>
        </div>
        <Field
          id="customer-device"
          label="Device (optional)"
          error={errors.device_serial}
          hint={dealer && !dealer.device_serials.length
            ? 'This dealer has no devices yet. Admin gives devices to dealers.'
            : 'Each device can belong to one customer.'}
        >
          <select id="customer-device" value={form.device_serial} onChange={set('device_serial')} disabled={!dealer}>
            <option value="">No device yet</option>
            {freeDevices.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field id="customer-notes" label="Notes (optional)">
          <textarea id="customer-notes" rows={3} value={form.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}

function ConfirmRemove({ customer, onCancel, onDone }) {
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await partnersAPI.deleteCustomer(customer.id);
      notify.success(`${customer.name} removed`);
      onDone();
    } catch (err) {
      notify.fromError(err, { action: 'remove this customer' });
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Remove customer?"
      onClose={onCancel}
      busy={busy}
      footer={(
        <>
          <button type="button" className="admin-page-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="admin-page-btn danger" onClick={remove} disabled={busy}>
            {busy ? 'Removing…' : 'Remove customer'}
          </button>
        </>
      )}
    >
      <p className="modal-lead">
        <strong>{customer.name}</strong> will be removed from the list.
        {customer.device_serial && <> Their device {customer.device_serial} stays with the dealer and can be given to another customer.</>}
      </p>
    </Modal>
  );
}

export default function Customers() {
  const access = useAccess();
  const [params, setParams] = useSearchParams();
  const [customers, setCustomers] = useState(null);
  const [dealers, setDealers] = useState([]);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null); // { kind: 'add' | 'edit' | 'remove', customer }

  const dealerFilter = access.isAdmin ? params.get('dealer') || '' : '';
  const ownDealer = access.isDealer ? access.dealer : null;

  const load = useCallback(async () => {
    setError(null);
    try {
      // Admin needs the dealer list for names and the form; a dealer has only themselves.
      const [list, dealerList] = await Promise.all([
        partnersAPI.listCustomers(access.isDealer ? { dealerId: ownDealer?.id } : {}),
        access.isAdmin ? partnersAPI.listDealers() : Promise.resolve(ownDealer ? [ownDealer] : []),
      ]);
      setCustomers(list);
      setDealers(dealerList);
    } catch (err) {
      setError(err);
      setCustomers([]);
    }
  }, [access.isAdmin, access.isDealer, ownDealer]);

  useEffect(() => {
    if (access.manageCustomers && !access.dealerLoading) load();
  }, [access.manageCustomers, access.dealerLoading, load]);

  const dealerName = useMemo(() => new Map(dealers.map((d) => [d.id, d.name])), [dealers]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (customers || [])
      .filter((c) => !dealerFilter || c.dealer_id === dealerFilter)
      .filter((c) => !q || [c.name, c.phone, c.email, c.device_serial, c.notes]
        .some((v) => String(v || '').toLowerCase().includes(q)));
  }, [customers, query, dealerFilter]);

  if (!access.manageCustomers) {
    return (
      <GlassCard>
        <div className="admin-empty partner-empty"><p>Customers are managed by admins and dealers.</p></div>
      </GlassCard>
    );
  }

  if (access.isDealer && !access.dealerLoading && !ownDealer) {
    return (
      <GlassCard>
        <div className="admin-empty partner-empty">
          <p style={{ fontWeight: 700 }}>Your dealer account isn’t set up yet</p>
          <p>Ask a Resprox admin to add you as a dealer and give you your devices.</p>
        </div>
      </GlassCard>
    );
  }

  const close = () => setDialog(null);
  const saved = () => { setDialog(null); load(); };
  const canAdd = access.isDealer || dealers.length > 0;

  return (
    <div className="partners-page">
      <GlassCard>
        <div className="section-title table-title-row">
          <div>
            <h2>{access.isDealer ? 'My Customers' : 'Customers'}</h2>
            <p className="partner-subtitle">
              {access.isDealer
                ? 'Add your customers and choose which of your devices each one uses.'
                : 'Every dealer’s customers. Dealers add their own.'}
            </p>
          </div>
          <button
            type="button"
            className="admin-page-btn primary"
            onClick={() => setDialog({ kind: 'add' })}
            disabled={!customers || !canAdd}
            title={canAdd ? undefined : 'Add a dealer first'}
          >
            + Add customer
          </button>
        </div>
        <PreviewNotice />

        <div className="admin-toolbar">
          <div className="admin-search-wrap">
            <input
              className="admin-search-input"
              placeholder="Search name, phone, email or serial…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search customers"
            />
          </div>
          {access.isAdmin && (
            <select
              className="partner-filter"
              value={dealerFilter}
              onChange={(e) => setParams(e.target.value ? { dealer: e.target.value } : {})}
              aria-label="Filter by dealer"
            >
              <option value="">All dealers</option>
              {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <span className="admin-count-label">
            {customers ? `${shown.length} customer${shown.length === 1 ? '' : 's'}` : '…'}
          </span>
        </div>

        {!customers ? (
          <DeviceListSkeleton rows={3} />
        ) : error ? (
          <NotDeployed error={error} onRetry={load} />
        ) : shown.length === 0 ? (
          <div className="admin-empty partner-empty">
            <p>{customers.length ? 'No customers match.' : 'No customers yet.'}</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table partner-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Device</th>
                  {access.isAdmin && <th>Dealer</th>}
                  <th>Notes</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Customer"><strong>{c.name}</strong></td>
                    <td data-label="Contact">
                      <span>{c.phone || '—'}</span>
                      {c.email && <span className="partner-sub">{c.email}</span>}
                    </td>
                    <td data-label="Device">
                      {c.device_serial
                        ? <Link to={`/device/${c.device_serial}`} className="serial-chip">{c.device_serial}</Link>
                        : <span className="partner-sub">None</span>}
                    </td>
                    {access.isAdmin && <td data-label="Dealer">{dealerName.get(c.dealer_id) || '—'}</td>}
                    <td data-label="Notes" className="partner-notes">{c.notes || '—'}</td>
                    <td className="partner-actions">
                      <button type="button" className="admin-page-btn" onClick={() => setDialog({ kind: 'edit', customer: c })}>Edit</button>
                      <button type="button" className="admin-page-btn danger" onClick={() => setDialog({ kind: 'remove', customer: c })}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {(dialog?.kind === 'add' || dialog?.kind === 'edit') && (
        <CustomerForm
          initial={dialog.customer}
          dealers={dealers}
          customers={customers}
          fixedDealer={ownDealer || (dialog.customer ? dealers.find((d) => d.id === dialog.customer.dealer_id) : null)
            || (dealerFilter ? dealers.find((d) => d.id === dealerFilter) : null)}
          onCancel={close}
          onSaved={saved}
        />
      )}
      {dialog?.kind === 'remove' && <ConfirmRemove customer={dialog.customer} onCancel={close} onDone={saved} />}
    </div>
  );
}
