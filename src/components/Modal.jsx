// src/components/Modal.jsx
//
// A dialog over the whole app: portaled to <body> so no page transform can trap
// it, closes on Escape or a backdrop click, and moves focus into itself.

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ title, onClose, children, footer, wide = false, busy = false }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    // Focus the first field, or the dialog itself when it has none.
    const first = panelRef.current?.querySelector('input, select, textarea, button:not(.modal-close)');
    (first || panelRef.current)?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  return createPortal(
    <div className="therapy-dialog-backdrop" role="presentation" onClick={() => { if (!busy) onClose(); }}>
      <div
        ref={panelRef}
        className={`therapy-dialog modal-panel${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        data-lenis-prevent
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Label, input and the field's error, wired for screen readers. */
export function Field({ id, label, error, hint, children }) {
  return (
    <div className={`modal-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <span className="modal-field-error" id={`${id}-error`} role="alert">{error}</span>
        : hint ? <span className="modal-field-hint">{hint}</span> : null}
    </div>
  );
}
