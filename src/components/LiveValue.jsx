// src/components/LiveValue.jsx
//
// A card, row or pill that glows briefly when the value it shows changes while
// the user is looking at it, so a live update is noticed without reloading the
// page. Only the element whose value changed glows.

import React, { useEffect, useRef, useState } from 'react';

const FLASH_MS = 1600;

/**
 * ' live-updated' for a moment after `value` changes. `scope` (e.g. the device
 * serial) resets it, so opening another device doesn't light everything up.
 * `value` should be a string or number: compare by value, not by object.
 */
export function useLiveFlash(value, scope) {
  const prev = useRef({ value, scope });
  const [on, setOn] = useState(false);
  useEffect(() => {
    const before = prev.current;
    prev.current = { value, scope };
    if (before.scope !== scope || before.value === value) return undefined;
    setOn(true);
    const timer = setTimeout(() => setOn(false), FLASH_MS);
    return () => clearTimeout(timer);
  }, [value, scope]);
  return on ? ' live-updated' : '';
}

/** <LiveValue watch={...} scope={serial} as="div" className="..." style={...}>…</LiveValue> */
export default function LiveValue({ watch, scope, as: Tag = 'div', className = '', children, ...rest }) {
  const flash = useLiveFlash(watch, scope);
  return <Tag className={`${className}${flash}`.trim() || undefined} {...rest}>{children}</Tag>;
}
