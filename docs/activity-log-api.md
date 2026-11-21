# Activity Log: what the backend needs to add

The website's Activity Log (`/activity`) already shows what the device did:
therapy sessions (from `device_reports`) and every settings packet the device
sent (`decoded_telemetry`: FULL_SYNC and UPDATE). Two things need the server.

## 1. List the commands the website sent

```
GET /devices/{deviceId}/commands?page=1&limit=100
→ { success, data: { items: [...], pagination: { page, limit, total, totalPages } } }
```

Rows from `device_commands`, newest first (`ORDER BY sent_at DESC`):

| Field | From |
|---|---|
| `id` | `id` |
| `mode` | `mode` (CPAP, AUTO, COMFORT, …) |
| `requested_values` | `requested_values` |
| `original_values` | `original_values` |
| `changed_fields` | `changed_fields` |
| `status` | `status` (PENDING, ACKED, FAILED, TIMEOUT, PUBLISH_FAILED, …) |
| `sent_at`, `acked_at` | same |
| `ack_remarks`, `retry_count` | same |
| `requested_by` | when the column exists (backend plan item: who sent it) |

- Same authoriser and organisation filter as `GET /devices/{deviceId}/reports`.
- Leave out `encoded_packet`.
- Until this route exists the website gets a 404 and shows only the device's
  side, with a note saying so.

The website matches a device UPDATE that arrives within 3 minutes of a
confirmed command, with the same values, to that command, so a website
change is not also counted as a change on the device.

## 2. Therapy is never stopped from the website

Decided 2026-11-21: only the device stops therapy. The website no longer shows
a Stop button and its client refuses `stop`, but the server must refuse it too:

- `POST /devices/{deviceId}/therapy/stop` answers **403**
  `{ error: "Therapy can only be stopped on the device." }` and publishes nothing.
- `start` is unchanged (admin only).

## 3. Later: therapy commands in the log

`POST /devices/{deviceId}/therapy/start` publishes over MQTT but stores
nothing, so the log cannot show "therapy started from the website". Store
each one (who, when, ACK result) in a table the commands route also returns,
for example `device_commands` with `mode = 'THERAPY'` and
`requested_values = { "action": "START" }`. Check first that the retry
checker does not re-publish these rows.
