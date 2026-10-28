// src/services/deviceEvents.js
//
// What the device did on its own between two reads of its data: therapy
// started or stopped from its button, settings changed on its screen, or the
// connection dropped or came back. The website shows these so nobody is
// surprised by a value that changed without anyone touching the page.

const SETTING_LABELS = {
  therapy_mode: 'Therapy mode',
  pressure: 'Pressure',
  min_pressure: 'Min pressure',
  max_pressure: 'Max pressure',
  aflex: 'A-Flex',
  ramp: 'Ramp',
  ramp_time: 'Comfort ramp',
  humidifier: 'Humidifier',
  mask_type: 'Mask type',
  tube_type: 'Tube type',
  i_mode: 'I-Mode',
  leak_alert: 'Leak alert',
  sleep_mode: 'Sleep mode',
};

const known = (v) => v !== null && v !== undefined && v !== '';
const therapyOf = (d) => String(d?.therapy_status || '').toUpperCase();

/**
 * Events between two reads of the same device. The first read (no `prev`), a
 * different device, and values that were simply missing before are not events.
 */
export function diffDeviceEvents(prev, next) {
  if (!prev || !next || prev.serial !== next.serial) return [];
  const serial = next.serial;
  const events = [];

  const was = therapyOf(prev);
  const now = therapyOf(next);
  if (was && now && was !== now && (now === 'RUNNING' || now === 'STOPPED')) {
    events.push({
      kind: 'therapy',
      title: now === 'RUNNING' ? `Therapy started on ${serial}` : `Therapy stopped on ${serial}`,
      detail: now === 'RUNNING'
        ? 'Started from the device. Settings are locked until therapy stops.'
        : 'Stopped from the device.',
    });
  }

  const link = (d) => (d.device_online ? 'online' : d.phone_connected ? 'phone' : 'offline');
  if (typeof prev.device_online === 'boolean' && typeof next.device_online === 'boolean'
    && link(prev) !== link(next)) {
    const now = link(next);
    events.push({
      kind: 'connection',
      title: now === 'online' ? `${serial} is back online`
        : now === 'phone' ? `${serial} connected to the phone app`
        : `${serial} went offline`,
      detail: now === 'online' ? 'Commands and settings can reach the device again.'
        : now === 'phone' ? "It left Wi-Fi for Bluetooth, so website commands can't reach it until the app disconnects."
        : "Therapy and settings commands can't reach it until it reconnects.",
    });
  }

  const before = prev.settings || {};
  const after = next.settings || {};
  const changes = Object.keys(SETTING_LABELS)
    .filter((key) => known(before[key]) && known(after[key]) && before[key] !== after[key])
    .map((key) => `${SETTING_LABELS[key]} ${before[key]} → ${after[key]}`);
  if (changes.length) {
    events.push({
      kind: 'settings',
      title: `Settings changed on ${serial}`,
      detail: `${changes.join(', ')}. Changed on the device.`,
    });
  }

  return events;
}
