import os, sys, unittest
os.environ.update(ADMIN_TOKEN="t-admin", ADMIN_USERNAME="u", ADMIN_PASSWORD="p-strong", DEVICE_TOKEN_SECRET="s")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient
from server import main

# The server ships with no demo devices, so the tests bring their own.
def _device(serial):
    return {
        "serial": serial, "model": "Test CPAP", "firmware": "test",
        "patient": {"id": "T", "name": "Test", "age": 40, "gender": "M"},
        "live_data": {"ahi": 0, "mask_leak": 0, "pressure_95": 0, "usage_hours": 0, "compliance_pct": 0},
        "settings": {"therapy_mode": "AUTO CPAP", "pressure": 12.0, "min_pressure": 5.0,
                     "max_pressure": 12.0, "aflex": 2, "ramp": 12.0},
        "sessions": [],
    }
for _serial in ("CVT30-C-9281", "CVT30-C-4028"):
    main.DEVICES_DB[_serial] = _device(_serial)

c = TestClient(main.app)
A = {"Authorization": "Bearer t-admin"}
S = "CVT30-C-9281"

class Auth(unittest.TestCase):
    def test_open_routes_now_require_auth(self):
        self.assertEqual(c.patch(f"/devices/{S}/settings", json={"CPAP": {"pressure": 10}}).status_code, 401)
        self.assertEqual(c.get("/api/admin/devices").status_code, 401)
        self.assertEqual(c.get(f"/api/device/settings/{S}").status_code, 401)
    def test_wrong_token_rejected(self):
        self.assertEqual(c.get("/api/admin/devices", headers={"Authorization": "Bearer nope"}).status_code, 401)
    def test_device_token_is_per_serial(self):
        ok = {"X-Device-Token": main.device_token(S)}
        self.assertEqual(c.get(f"/api/device/settings/{S}", headers=ok).status_code, 200)
        self.assertEqual(c.get("/api/device/settings/CVT30-C-4028", headers=ok).status_code, 401)

class Patch(unittest.TestCase):
    def patch(self, body):
        return c.patch(f"/devices/{S}/settings", json=body, headers=A)
    def test_non_number_is_400_not_500(self):
        self.assertEqual(self.patch({"CPAP": {"pressure": "abc"}}).status_code, 400)
    def test_out_of_range(self):
        self.assertEqual(self.patch({"CPAP": {"pressure": 99}}).status_code, 400)
    def test_min_must_be_below_max(self):
        self.assertEqual(self.patch({"AUTO": {"minPressure": 15, "maxPressure": 10}}).status_code, 400)
    def test_unsupported_group_rejected(self):
        self.assertEqual(self.patch({"OPTIONS": {"iModeEnabled": 1}}).status_code, 400)
    def test_offline_device_command_is_pending_not_acked(self):
        r = self.patch({"CPAP": {"pressure": 9.5}})
        self.assertEqual(r.status_code, 200)
        cid = r.json()["commandId"]
        st = c.get(f"/devices/{S}/commands/{cid}/status", headers=A).json()["status"]
        self.assertEqual(st, "PENDING")
        main.COMMANDS[cid]["timestamp"] -= main.COMMAND_TIMEOUT_S + 1
        self.assertEqual(c.get(f"/devices/{S}/commands/{cid}/status", headers=A).json()["status"], "TIMEOUT")
    def test_device_ack_marks_command_acked(self):
        r = self.patch({"CPAP": {"pressure": 8.5}}).json()
        ts = main.COMMANDS[r["commandId"]]["timestamp"]
        c.post("/api/device/settings/ack", json={"serial": S, "timestamp": ts, "applied": True},
               headers={"X-Device-Token": main.device_token(S)})
        self.assertEqual(c.get(f"/devices/{S}/commands/{r['commandId']}/status", headers=A).json()["status"], "ACKED")

if __name__ == "__main__":
    unittest.main()
