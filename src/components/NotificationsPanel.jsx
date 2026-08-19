import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloseIcon } from './Icons';

const SEVERITY = {
  critical: { label: 'Critical', color: '#b91c1c', bg: '#fee2e2' },
  warning: { label: 'Warning', color: '#b45309', bg: '#fef3c7' },
  info: { label: 'Info', color: '#1d4ed8', bg: '#dbeafe' },
  success: { label: 'All clear', color: '#15803d', bg: '#dcfce7' },
};

export default function NotificationsPanel({ notifications, onClose, onDismiss, onClearAll }) {
  const navigate = useNavigate();
  const panelRef = useRef(null);

  // Close on outside click or Escape — a dropdown that can only be closed by
  // the button that opened it is a trap on touch devices.
  useEffect(() => {
    const onPointerDown = (e) => {
      // The bell must be left to its own toggle handler. Without this, mousedown
      // would close the panel and the following click would immediately reopen it,
      // so clicking the bell while open could never dismiss it.
      if (e.target.closest?.('[data-notif-toggle]')) return;
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const go = (to) => {
    if (to) navigate(to);
    onClose();
  };

  return (
    <div className="notif-panel" ref={panelRef} role="dialog" aria-label="Notifications">
      <div className="notif-head">
        <strong>Notifications</strong>
        <button type="button" className="notif-clear" onClick={onClearAll}>Clear all</button>
      </div>

      <div className="notif-list">
        {notifications.length === 0 && (
          <div className="notif-empty">You&rsquo;re all caught up.</div>
        )}

        {notifications.map((n) => {
          const tone = SEVERITY[n.severity] || SEVERITY.info;
          return (
            <div key={n.id} className={`notif-item ${n.read ? 'is-read' : ''}`}>
              <button type="button" className="notif-main" onClick={() => go(n.to)}>
                <span className="notif-tag" style={{ background: tone.bg, color: tone.color }}>
                  {tone.label}
                </span>
                <span className="notif-title">{n.title}</span>
                <span className="notif-detail">{n.detail}</span>
              </button>
              <button
                type="button"
                className="notif-dismiss"
                onClick={() => onDismiss(n.id)}
                aria-label={`Dismiss: ${n.title}`}
              >
                <CloseIcon />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
