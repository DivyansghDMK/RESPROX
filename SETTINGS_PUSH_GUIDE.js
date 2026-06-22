// ════════════════════════════════════════════════════════════════
// SETTINGS PUSH — INTEGRATION GUIDE
// ════════════════════════════════════════════════════════════════

// ── FILES CREATED & MODIFIED ──────────────────────────────────────
//
//  server/main.py               → FastAPI server
//  src/components/
//    AdminSettingsEditor.jsx    → embedded in AdminPatientDetail
//  src/hooks/
//    useDeviceSettings.js       → loaded in App.jsx (connects device client to WebSocket)
//  src/styles.css               → admin settings editor visual layouts
//  .env                         → environment variables config
//
// ── .env settings ────────────────────────────────────────────────
// VITE_API_BASE_URL=http://localhost:8000/api
// VITE_WS_URL=ws://localhost:8000
// VITE_ADMIN_TOKEN=admin-secret-token-change-me

// ── How to start the backend FastAPI server ───────────────────────
// cd server
// pip install fastapi uvicorn websockets
// uvicorn main:app --reload --port 8000

// ── Integration overview ──────────────────────────────────────────
//
//  1. Device startup:
//     - useDeviceSettings() hook is initialized inside App.jsx (within TherapyProvider context).
//     - Pulls initial configuration settings via GET fallback /api/device/settings/:id
//     - Opens WebSocket connection to ws://localhost:8000/ws/device/{patient_id}
//     - Receives a "settings_sync" message framing the current settings from server.
//
//  2. Admin interface:
//     - Open patient detail page (/admin/patient/P001).
//     - AdminSettingsEditor renders live slider values and connection status indicator.
//     - Modifying any parameter (Pressure, Ramp, EPR) enables Discard & Push controls.
//
//  3. Pushing settings:
//     - Admin clicks "⚡ Push to Device"
//     - Sends PATCH payload to /api/admin/patients/:id/settings with Authorization token.
//     - Server saves update in settings database.
//     - Server broadcasts JSON frame via connected device WebSocket.
//     - Device useDeviceSettings hook intercepts, applies values, and triggers immediate updates in TherapyContext.
//     - Device replies with ACK frame.
//     - Server clears pending flags.
//
//  4. Offline caching:
//     - If the device is disconnected, the server marks settings update as pending.
//     - On reconnect, WebSocket connects, syncs latest version automatically, and clears queues.
