# server/main.py
# FastAPI server — Devices-centric CPAP Settings Push & Telemetry
# pip install fastapi uvicorn websockets

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import Optional, Dict, Set, List
import asyncio, json, logging, time

ADMIN_TOKEN = "admin-secret-token-change-me"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cpap-server")

app = FastAPI(title="resproX CPAP Server (Devices-Centric)", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── WebSocket connection manager (serial-centric) ────────────────
class ConnectionManager:
    def __init__(self):
        # serial → set of active WebSocket connections
        self.active: Dict[str, Set[WebSocket]] = {}

    async def connect(self, serial: str, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(serial, set()).add(ws)
        logger.info(f"Device connected: {serial} (total={len(self.active[serial])})")

    def disconnect(self, serial: str, ws: WebSocket):
        if serial in self.active:
            self.active[serial].discard(ws)
            if not self.active[serial]:
                del self.active[serial]
        logger.info(f"Device disconnected: {serial}")

    async def push_settings(self, serial: str, payload: dict) -> bool:
        """Push settings to device WebSocket. Returns True if successfully sent."""
        connections = self.active.get(serial, set())
        if not connections:
            logger.info(f"No active device connection for {serial} — settings queued as pending")
            return False
        dead = set()
        for ws in connections:
            try:
                await ws.send_text(json.dumps({"type": "settings_update", "data": payload}))
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.disconnect(serial, ws)
        return len(connections) > len(dead)

    def is_online(self, serial: str) -> bool:
        return bool(self.active.get(serial))

manager = ConnectionManager()

# ── DB Store (in-memory mock) ───────────────────────────────────
# Serial format: CVT30-C-XXXX
# CVT30 = product line, C = CPAP series, XXXX = unit serial number
DEVICES_DB = {
    "CVT30-C-9281": {
        "serial": "CVT30-C-9281",
        "product_line": "CVT30",
        "series": "C",
        "model": "CVT30 CPAP C-Series",
        "firmware": "v1.2.4",
        "patient": {
            "id": "P001",
            "name": "Arjun Sharma",
            "age": 42,
            "gender": "M"
        },
        "live_data": {
            "ahi": 2.1,
            "mask_leak": 24.0,
            "pressure_95": 11.8,
            "usage_hours": 7.5,
            "compliance_pct": 94
        },
        "settings": {
            "therapy_mode": "AUTO CPAP",
            "pressure": 12.0,
            "min_pressure": 5.0,
            "max_pressure": 12.0,
            "aflex": 2,
            "ramp": 12.0
        },
        "sessions": [
            {"date": "16 Jun", "ahi": 1.4, "usage_hours": 7.8, "mask_leak": 18.2, "pressure_95": 11.2},
            {"date": "17 Jun", "ahi": 2.5, "usage_hours": 6.5, "mask_leak": 22.1, "pressure_95": 12.0},
            {"date": "18 Jun", "ahi": 3.1, "usage_hours": 4.2, "mask_leak": 26.5, "pressure_95": 11.5},
            {"date": "19 Jun", "ahi": 1.8, "usage_hours": 8.0, "mask_leak": 19.4, "pressure_95": 10.8},
            {"date": "20 Jun", "ahi": 2.0, "usage_hours": 7.2, "mask_leak": 24.0, "pressure_95": 11.0},
            {"date": "21 Jun", "ahi": 2.1, "usage_hours": 7.5, "mask_leak": 24.0, "pressure_95": 11.8}
        ]
    },
    "CVT30-C-4028": {
        "serial": "CVT30-C-4028",
        "product_line": "CVT30",
        "series": "C",
        "model": "CVT30 CPAP C-Series",
        "firmware": "v1.1.2",
        "patient": {
            "id": "P002",
            "name": "Priya Mehta",
            "age": 38,
            "gender": "F"
        },
        "live_data": {
            "ahi": 4.5,
            "mask_leak": 12.4,
            "pressure_95": 10.0,
            "usage_hours": 6.8,
            "compliance_pct": 82
        },
        "settings": {
            "therapy_mode": "CPAP",
            "pressure": 10.0,
            "min_pressure": 6.0,
            "max_pressure": 14.0,
            "aflex": 1,
            "ramp": 20
        },
        "sessions": [
            {"date": "16 Jun", "ahi": 3.2, "usage_hours": 6.0, "mask_leak": 14.2, "pressure_95": 10.0},
            {"date": "17 Jun", "ahi": 4.0, "usage_hours": 6.5, "mask_leak": 12.8, "pressure_95": 10.0},
            {"date": "18 Jun", "ahi": 4.5, "usage_hours": 6.8, "mask_leak": 12.4, "pressure_95": 10.0}
        ]
    },
    "CVT30-C-1002": {
        "serial": "CVT30-C-1002",
        "product_line": "CVT30",
        "series": "C",
        "model": "CVT30 CPAP C-Series",
        "firmware": "v1.2.4",
        "patient": {
            "id": "P003",
            "name": "Ravi Kumar",
            "age": 55,
            "gender": "M"
        },
        "live_data": {
            "ahi": 9.8,
            "mask_leak": 35.2,
            "pressure_95": 14.2,
            "usage_hours": 4.2,
            "compliance_pct": 58
        },
        "settings": {
            "therapy_mode": "AUTO CPAP",
            "pressure": 14.0,
            "min_pressure": 10.0,
            "max_pressure": 20.0,
            "aflex": 3,
            "ramp": 10
        },
        "sessions": [
            {"date": "16 Jun", "ahi": 7.4, "usage_hours": 5.2, "mask_leak": 32.1, "pressure_95": 13.5},
            {"date": "17 Jun", "ahi": 8.5, "usage_hours": 4.8, "mask_leak": 34.0, "pressure_95": 14.0},
            {"date": "18 Jun", "ahi": 9.8, "usage_hours": 4.2, "mask_leak": 35.2, "pressure_95": 14.2}
        ]
    }
}

PENDING_DB: Dict[str, dict] = {} # serial → pending settings payload

# ── Auth & Security ──────────────────────────────────────────────
bearer = HTTPBearer()

def require_admin(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    if creds.credentials != ADMIN_TOKEN:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token")

class LoginRequest(BaseModel):
    username: str
    password: str

class TherapySettings(BaseModel):
    therapy_mode:  Optional[str]   = Field(None, pattern="^(CPAP|AUTO CPAP)$")
    pressure:      Optional[float] = Field(None, ge=4, le=30)
    min_pressure:  Optional[float] = Field(None, ge=4, le=30)
    max_pressure:  Optional[float] = Field(None, ge=4, le=30)
    aflex:         Optional[int]   = Field(None, ge=0, le=3)
    ramp:          Optional[float] = Field(None, ge=4, le=30)

class SettingsAck(BaseModel):
    serial:    str
    timestamp: float
    applied:   bool

# ── REST API Routes ──────────────────────────────────────────────

@app.post("/api/auth/login")
def login(body: LoginRequest):
    if body.username == "admin" and body.password == "admin123":
        return {
            "token": ADMIN_TOKEN,
            "username": "admin",
            "success": True
        }
    raise HTTPException(status_code=400, detail="Invalid credentials")


@app.get("/api/admin/devices", dependencies=[Depends(require_admin)])
def get_devices(search: Optional[str] = ""):
    results = []
    for d in DEVICES_DB.values():
        is_match = not search or search.lower() in d["serial"].lower() or search.lower() in d["patient"]["name"].lower()
        if is_match:
            results.append({
                "serial": d["serial"],
                "model": d["model"],
                "firmware": d["firmware"],
                "patient_name": d["patient"]["name"],
                "status": "online" if manager.is_online(d["serial"]) else "offline",
                "compliance_pct": d["live_data"]["compliance_pct"],
                "ahi": d["live_data"]["ahi"],
                "usage_hours": d["live_data"]["usage_hours"]
            })
    return results


@app.get("/api/admin/devices/{serial}", dependencies=[Depends(require_admin)])
def get_device_detail(serial: str):
    if serial not in DEVICES_DB:
        raise HTTPException(status_code=404, detail="Device not found")
    device = DEVICES_DB[serial]
    pending = PENDING_DB.get(serial)
    return {
        "serial": device["serial"],
        "product_line": device.get("product_line", "CVT30"),
        "series": device.get("series", "C"),
        "model": device["model"],
        "firmware": device["firmware"],
        "patient": device["patient"],
        "live_data": device["live_data"],
        "settings": device["settings"],
        "sessions": device["sessions"],
        "pending": pending,
        "device_online": manager.is_online(serial)
    }


@app.get("/api/admin/patients/{serial}/settings", dependencies=[Depends(require_admin)])
def read_settings(serial: str):
    """Admin settings endpoint requested by AdminSettingsEditor."""
    if serial not in DEVICES_DB:
        raise HTTPException(status_code=404, detail="Device not found")
    device = DEVICES_DB[serial]
    pending = PENDING_DB.get(serial)
    return {
        "patient_id": serial,
        "settings": device["settings"],
        "pending": pending,
        "device_online": manager.is_online(serial)
    }


@app.patch("/api/admin/patients/{serial}/settings", dependencies=[Depends(require_admin)])
async def update_settings(serial: str, body: TherapySettings):
    """Admin patching configuration sliders."""
    if serial not in DEVICES_DB:
        raise HTTPException(status_code=404, detail="Device not found")
    
    device = DEVICES_DB[serial]
    current = device["settings"]
    patch = body.model_dump(exclude_none=True)

    if not patch:
        raise HTTPException(400, "No fields provided")

    merged = {**current, **patch}
    if merged.get("therapy_mode") == "AUTO CPAP":
        if merged.get("min_pressure", 0) >= merged.get("max_pressure", 30):
            raise HTTPException(400, "Min pressure must be less than Max pressure")

    device["settings"] = merged
    
    push_payload = {
        **merged,
        "updated_by": "admin",
        "timestamp": time.time(),
    }

    delivered = await manager.push_settings(serial, push_payload)
    PENDING_DB[serial] = push_payload # store pending

    return {
        "success": True,
        "settings": merged,
        "device_online": delivered,
        "message": "Settings pushed to device" if delivered else "Device offline — settings queued"
    }


@app.post("/api/device/settings/ack")
async def ack_settings(body: SettingsAck):
    pending = PENDING_DB.get(body.serial)
    if pending and abs(pending["timestamp"] - body.timestamp) < 5:
        PENDING_DB.pop(body.serial, None)
        logger.info(f"Settings ACK received for {body.serial} (applied={body.applied})")
    return {"ok": True}


@app.get("/api/device/settings/{serial}")
async def device_fetch_settings(serial: str):
    if serial not in DEVICES_DB:
        raise HTTPException(status_code=404, detail="Device not found")
    PENDING_DB.pop(serial, None)
    return {"settings": DEVICES_DB[serial]["settings"]}


# ── WebSocket Route ──────────────────────────────────────────────
@app.websocket("/ws/device/{serial}")
async def device_websocket(ws: WebSocket, serial: str):
    await manager.connect(serial, ws)
    try:
        # Push initial settings immediately on connect
        if serial in DEVICES_DB:
            current = DEVICES_DB[serial]["settings"]
            await ws.send_text(json.dumps({
                "type": "settings_sync",
                "data": {**current, "timestamp": time.time()}
            }))
        
        while True:
            try:
                msg = await asyncio.wait_for(ws.receive_text(), timeout=30)
                data = json.loads(msg)

                if data.get("type") == "ack":
                    ack_data = data.get("data", {})
                    # Map patient_id back to serial if needed
                    await ack_settings(SettingsAck(
                        serial=serial,
                        timestamp=ack_data.get("timestamp", 0),
                        applied=ack_data.get("applied", False)
                    ))
                elif data.get("type") == "ping":
                    await ws.send_text(json.dumps({"type": "pong"}))

            except asyncio.TimeoutError:
                try:
                    await ws.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(serial, ws)

# Run: /Users/deckmount/Library/Python/3.9/bin/uvicorn server.main:app --reload --port 8000
