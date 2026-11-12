// src/services/calibrationApi.js
//
// Pressure calibration through the backend (deployed 2026-11-12). Admin only.
//
//   POST /devices/{deviceId}/calibration
//     {"action":"START"}                                       → { success, commandId, status: "PENDING", command }
//     {"action":"INCREMENT"|"DECREMENT","type":"linear"}       → { success, status: "SENT", command }
//     {"action":"INCREMENT"|"DECREMENT","type":"nonlinear","pressure":4..25}
//     {"action":"SAVE"}                                        → { success, commandId, status: "PENDING", command }
//   400 = pressure out of range or bad action/type, 404 = device not found.
//
// START and SAVE are acknowledged by the device: poll
// GET /devices/{id}/commands/{commandId}/status until ACKED (or TIMEOUT after
// the server's 3 retries). INCREMENT / DECREMENT are fire-and-forget.

import { devicesAPI, request } from './respireeApi';

// The server retries 3 times before giving up, so wait a little longer than one try.
const ACK_TIMEOUT_MS = 45_000;

/** Send one calibration request; START and SAVE also wait for the device's ACK. */
async function send(serial, body) {
  const res = await request(`/devices/${encodeURIComponent(serial)}/calibration`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const commandId = res?.commandId ?? res?.data?.commandId;
  if (!commandId) return res;

  const status = await devicesAPI.pollCommandStatus(serial, commandId, { timeoutMs: ACK_TIMEOUT_MS });
  if (status.status !== 'ACKED') {
    const err = new Error(status.status === 'NACKED'
      ? 'The device refused the calibration command.'
      : 'The device did not confirm. It shows "Command Failed" on its screen if it never got the command.');
    err.code = status.status;
    throw err;
  }
  return status;
}

export const calibrationAPI = { send };
