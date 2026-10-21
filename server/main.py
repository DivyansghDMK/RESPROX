# server/main.py
# FastAPI server — Devices-centric CPAP Settings Push & Telemetry
# pip install fastapi uvicorn websockets

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, status, Query, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict, Set, List
import asyncio, hashlib, hmac, json, logging, secrets, time, os

def load_dotenv():
    # Look for .env in the parent directory of this file
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_path = os.path.join(base_dir, ".env")
    if not os.path.exists(env_path):
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
        
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip()
                    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                        val = val[1:-1]
                    os.environ.setdefault(key, val)

load_dotenv()

def _require_env(name: str, bad_values=()) -> str:
    val = os.getenv(name, "")
    if not val or val in bad_values:
        raise RuntimeError(f"{name} must be set to a non-default value (see .env)")
    return val

ADMIN_TOKEN = _require_env("ADMIN_TOKEN", ("admin-secret-token-change-me",))
ADMIN_USERNAME = _require_env("ADMIN_USERNAME")
ADMIN_PASSWORD = _require_env("ADMIN_PASSWORD", ("admin123",))

# Devices authenticate with HMAC(DEVICE_TOKEN_SECRET, serial). Unset => a random secret,
# so no device can authenticate until one is configured.
DEVICE_TOKEN_SECRET = os.getenv("DEVICE_TOKEN_SECRET") or secrets.token_hex(32)
if not os.getenv("DEVICE_TOKEN_SECRET"):
    logging.warning("DEVICE_TOKEN_SECRET not set — device endpoints will reject all devices")

COGNITO_REGION = os.getenv("VITE_COGNITO_REGION", "us-east-1")
COGNITO_USER_POOL_ID = os.getenv("VITE_COGNITO_USER_POOL_ID", "")
COGNITO_CLIENT_ID = os.getenv("VITE_COGNITO_APP_CLIENT_ID", "")

# Simulated acknowledgements are disabled unless explicitly enabled for tests.
DEV_SIMULATE_ACK = os.getenv("DEV_SIMULATE_ACK") == "1"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cpap-server")

app = FastAPI(title="Resprox CPAP Server (Devices-Centric)", version="2.0.0")

# Explicit origins only; auth is a bearer header, so cookies/credentials are not needed.
cors_origins_str = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5175")
allow_origins = [o.strip() for o in cors_origins_str.split(",") if o.strip() and o.strip() != "*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=False,
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

# Device records must come from the configured production data source. This
# legacy local server does not seed devices or fabricate telemetry.
DEVICES_DB: Dict[str, dict] = {
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

# No local/demo records are allowed in runtime state. Production callers must
# provide device data through the real API/database integration.
DEVICES_DB.clear()

PENDING_DB: Dict[str, dict] = {} # serial → pending settings payload

# ── Auth & Security ──────────────────────────────────────────────
bearer = HTTPBearer()

_jwk_client = None

def _verify_cognito(token: str) -> bool:
    """True if token is a valid, unexpired id token from our Cognito pool."""
    global _jwk_client
    if not COGNITO_USER_POOL_ID:
        return False
    try:
        import jwt
        issuer = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
        if _jwk_client is None:
            _jwk_client = jwt.PyJWKClient(f"{issuer}/.well-known/jwks.json", cache_keys=True)
        key = _jwk_client.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token, key, algorithms=["RS256"], issuer=issuer,
            audience=COGNITO_CLIENT_ID or None,
            options={"verify_aud": bool(COGNITO_CLIENT_ID)},
        )
        return claims.get("token_use") == "id"
    except Exception:
        return False

def require_admin(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    """Static admin token, or a valid Cognito id token."""
    tok = creds.credentials
    if hmac.compare_digest(tok, ADMIN_TOKEN) or _verify_cognito(tok):
        return
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

def device_token(serial: str) -> str:
    return hmac.new(DEVICE_TOKEN_SECRET.encode(), serial.encode(), hashlib.sha256).hexdigest()

def _device_token_ok(serial: str, token: Optional[str]) -> bool:
    return bool(token) and hmac.compare_digest(token, device_token(serial))

def require_device(serial: str, x_device_token: Optional[str] = Header(None)):
    if not _device_token_ok(serial, x_device_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid device token")

ADMIN = [Depends(require_admin)]

class LoginRequest(BaseModel):
    username: str
    password: str

class TherapySettings(BaseModel):
    therapy_mode:  Optional[str]   = Field(None, pattern="^(CPAP|AUTO CPAP|BiPAP)$")
    pressure:      Optional[float] = Field(None, ge=4, le=30)
    min_pressure:  Optional[float] = Field(None, ge=4, le=30)
    max_pressure:  Optional[float] = Field(None, ge=4, le=30)
    aflex:         Optional[int]   = Field(None, ge=0, le=3)
    ramp:          Optional[float] = Field(None, ge=0, le=45)

    S:             Optional[dict]  = None
    T:             Optional[dict]  = None
    ST:            Optional[dict]  = None
    AUTO:          Optional[dict]  = None
    CPAP:          Optional[dict]  = None
    VAPS:          Optional[dict]  = None
    CONFIG:        Optional[dict]  = None
    COMFORT:       Optional[dict]  = None
    OPTIONS:       Optional[dict]  = None

    class Config:
        extra = "allow"

class SettingsAck(BaseModel):
    serial:    str
    timestamp: float
    applied:   bool

# ── REST API Routes ──────────────────────────────────────────────

@app.post("/api/auth/login")
def login(body: LoginRequest):
    if hmac.compare_digest(body.username, ADMIN_USERNAME) and hmac.compare_digest(body.password, ADMIN_PASSWORD):
        return {
            "token": ADMIN_TOKEN,
            "username": ADMIN_USERNAME,
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


COMMANDS: Dict[str, dict] = {}   # commandId → {serial, timestamp, status}
COMMAND_TIMEOUT_S = 30
MAX_COMMANDS = 500

def _apply_ack(body: SettingsAck):
    pending = PENDING_DB.get(body.serial)
    if not pending or abs(pending["timestamp"] - body.timestamp) >= 5:
        return
    PENDING_DB.pop(body.serial, None)
    for c in COMMANDS.values():
        if c["serial"] == body.serial and c["status"] == "PENDING" and abs(c["timestamp"] - body.timestamp) < 5:
            c["status"] = "ACKED" if body.applied else "NACKED"
    logger.info(f"Settings ACK received for {body.serial} (applied={body.applied})")

@app.post("/api/device/settings/ack")
async def ack_settings(body: SettingsAck, x_device_token: Optional[str] = Header(None)):
    if not _device_token_ok(body.serial, x_device_token):
        raise HTTPException(status_code=401, detail="Invalid device token")
    _apply_ack(body)
    return {"ok": True}


@app.get("/api/device/settings/{serial}", dependencies=[Depends(require_device)])
async def device_fetch_settings(serial: str):
    if serial not in DEVICES_DB:
        raise HTTPException(status_code=404, detail="Device not found")
    # Pending stays until the device ACKs; fetching alone does not prove it was applied.
    return {"settings": DEVICES_DB[serial]["settings"]}


# ── AWS API Compatibility Mock Endpoints ────────────────────────

import uuid

def _get_mock_decoded_payload(device: dict) -> dict:
    settings = device.get("settings", {})
    return {
        "S": None,
        "T": None,
        "ST": None,
        "AUTO": {
            "ramp": int(settings.get("ramp", 20)),
            "aflex": int(settings.get("aflex", 2)),
            "maxPressure": float(settings.get("max_pressure", 20.0)),
            "minPressure": float(settings.get("min_pressure", 4.0))
        },
        "CPAP": {
            "ramp": int(settings.get("ramp", 20)),
            "pressure": float(settings.get("pressure", 10.0))
        },
        "VAPS": None,
        "CONFIG": {
            "reset": False,
            "dateDD": 25,
            "dateMM": 6,
            "dateYY": 25,
            "timeHH": 9,
            "timeMM": 30,
            "timeSS": 0,
            "datePad": 0
        },
        "COMFORT": None,
        "OPTIONS": None
    }

@app.get("/devices/{serial}/telemetry/latest", dependencies=ADMIN)
@app.get("/api/devices/{serial}/telemetry/latest", dependencies=ADMIN)
async def mock_telemetry_latest(serial: str):
    if serial not in DEVICES_DB:
        return JSONResponse(
            status_code=404,
            content={"success": False, "error": f"Device not found: {serial}"}
        )
    device = DEVICES_DB[serial]
    therapy_mode = device["settings"].get("therapy_mode", "CPAP")
    mode_code = "AUTO" if "AUTO" in therapy_mode else "CPAP"
    
    return {
        "success": True,
        "data": {
            "id": str(uuid.uuid4()),
            "message_id": str(uuid.uuid4()),
            "device_id": serial,
            "packet_type": "FULL_SYNC",
            "device_type": "CPAP",
            "mode": mode_code,
            "decoded_payload": _get_mock_decoded_payload(device),
            "device_timestamp": "2025-06-25T09:30:00.000Z",
            "server_timestamp": "2026-07-27T11:35:41.566Z"
        }
    }

@app.get("/devices/{serial}/sync-state", dependencies=ADMIN)
@app.get("/api/devices/{serial}/sync-state", dependencies=ADMIN)
async def mock_sync_state(serial: str):
    if serial not in DEVICES_DB:
        return JSONResponse(
            status_code=404,
            content={"success": False, "error": f"Device not found: {serial}"}
        )
    return {
        "success": True,
        "data": {
            "device_id": serial,
            "last_device_upload": "2025-06-25T09:30:00.000Z",
            "last_server_download": "2026-07-27T11:35:41.438Z",
            "last_acknowledgement": "2026-07-27T11:35:41.566Z",
            "last_message_id": str(uuid.uuid4()),
            "last_sync_direction": "DEVICE_TO_SERVER",
            "sync_status": "SYNCED",
            "updated_at": "2026-07-27T11:35:41.566Z"
        }
    }

@app.get("/devices/{serial}/commands/{command_id}/status", dependencies=ADMIN)
@app.get("/api/devices/{serial}/commands/{command_id}/status", dependencies=ADMIN)
async def mock_command_status(serial: str, command_id: str):
    cmd = COMMANDS.get(command_id)
    if serial not in DEVICES_DB or not cmd or cmd["serial"] != serial:
        return JSONResponse(
            status_code=404,
            content={"success": False, "error": f"Command not found: {command_id}"}
        )
    if cmd["status"] == "PENDING" and time.time() - cmd["timestamp"] > COMMAND_TIMEOUT_S:
        cmd["status"] = "TIMEOUT"
    return {"status": cmd["status"]}

def _num(group: dict, key: str, lo: float, hi: float, label: str):
    """Return the validated number at group[key], or None if absent. Raises ValueError."""
    v = group.get(key)
    if v is None:
        return None
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ValueError(f"{label}.{key}: must be a number")
    if not (lo <= v <= hi):
        raise ValueError(f"{label}.{key}: {v} is out of range ({lo}-{hi})")
    return v

SUPPORTED_GROUPS = ("CPAP", "AUTO")
UNSUPPORTED_GROUPS = ("S", "ST", "T", "VAPS", "CONFIG", "COMFORT", "OPTIONS")

@app.patch("/devices/{serial}/settings", dependencies=ADMIN)
@app.patch("/api/devices/{serial}/settings", dependencies=ADMIN)
async def mock_patch_settings(serial: str, body: dict, background_tasks: BackgroundTasks):
    if serial not in DEVICES_DB:
        return JSONResponse(
            status_code=404,
            content={"success": False, "error": f"Device not found: {serial}"}
        )

    def bad(msg):
        return JSONResponse(status_code=400, content={"success": False, "error": msg})

    for g in UNSUPPORTED_GROUPS:
        if body.get(g) is not None:
            return bad(f"{g}: not supported by this server")
    for g in SUPPORTED_GROUPS:
        if body.get(g) is not None and not isinstance(body[g], dict):
            return bad(f"{g}: must be an object")

    device = DEVICES_DB[serial]
    original_decoded = _get_mock_decoded_payload(device)
    cpap_patch = body.get("CPAP")
    auto_patch = body.get("AUTO")

    try:
        if cpap_patch is not None:
            _num(cpap_patch, "pressure", 4, 20, "CPAP")
            _num(cpap_patch, "ramp", 0, 45, "CPAP")
        if auto_patch is not None:
            min_p = _num(auto_patch, "minPressure", 4, 20, "AUTO")
            max_p = _num(auto_patch, "maxPressure", 4, 20, "AUTO")
            _num(auto_patch, "aflex", 0, 3, "AUTO")
            _num(auto_patch, "ramp", 0, 45, "AUTO")
            eff_min = min_p if min_p is not None else original_decoded["AUTO"]["minPressure"]
            eff_max = max_p if max_p is not None else original_decoded["AUTO"]["maxPressure"]
            if eff_min >= eff_max:
                raise ValueError("AUTO: minPressure must be less than maxPressure")
    except ValueError as e:
        return bad(str(e))

    # Compute changed fields
    changed_fields = {}
    updated_modes = {g: None for g in ("CPAP", "AUTO", "S", "ST", "T", "VAPS", "CONFIG", "COMFORT", "OPTIONS")}
    for mode_name in SUPPORTED_GROUPS:
        mode_patch = body.get(mode_name)
        if mode_patch is None:
            continue
        original_mode_val = original_decoded.get(mode_name) or {}
        mode_changed = {
            k: {"from": original_mode_val.get(k), "to": v}
            for k, v in mode_patch.items() if v != original_mode_val.get(k)
        }
        if mode_changed:
            changed_fields[mode_name] = mode_changed
            updated_modes[mode_name] = mode_patch

    if not changed_fields:
        return {
            "success": True,
            "commandId": None,
            "status": "NO_CHANGE",
            "deviceId": serial,
            "message": "No fields differ from the current stored values; nothing saved."
        }

    # Apply changes to local DEVICES_DB settings store
    settings = device["settings"]
    if cpap_patch is not None:
        settings["therapy_mode"] = "CPAP"
        if "pressure" in cpap_patch:
            settings["pressure"] = float(cpap_patch["pressure"])
        if "ramp" in cpap_patch:
            settings["ramp"] = float(cpap_patch["ramp"])

    if auto_patch is not None:
        settings["therapy_mode"] = "AUTO CPAP"
        if "minPressure" in auto_patch:
            settings["min_pressure"] = float(auto_patch["minPressure"])
        if "maxPressure" in auto_patch:
            settings["max_pressure"] = float(auto_patch["maxPressure"])
        if "aflex" in auto_patch:
            settings["aflex"] = int(auto_patch["aflex"])
        if "ramp" in auto_patch:
            settings["ramp"] = float(auto_patch["ramp"])

    ts = time.time()
    push_payload = {**settings, "updated_by": "admin", "timestamp": ts}
    delivered = await manager.push_settings(serial, push_payload)
    PENDING_DB[serial] = push_payload

    command_id = str(uuid.uuid4())
    COMMANDS[command_id] = {"serial": serial, "timestamp": ts, "status": "PENDING"}
    while len(COMMANDS) > MAX_COMMANDS:
        COMMANDS.pop(next(iter(COMMANDS)))

    # Real ACKs come from the device over the websocket/REST. Without one the command
    # stays PENDING and then TIMEOUT. The simulator is a local-dev convenience only.
    if DEV_SIMULATE_ACK:
        async def simulate_device_ack():
            await asyncio.sleep(1.5)
            _apply_ack(SettingsAck(serial=serial, timestamp=ts, applied=True))
        background_tasks.add_task(simulate_device_ack)

    return {
        "success": True,
        "commandId": command_id,
        "status": "SAVED",
        "deviceId": serial,
        "deviceOnline": delivered,
        "original": original_decoded,
        "updated": updated_modes,
        "changedFields": changed_fields
    }


# ── WebSocket Route ──────────────────────────────────────────────
@app.websocket("/ws/device/{serial}")
async def device_websocket(ws: WebSocket, serial: str, token: Optional[str] = Query(None)):
    # Device token, or an admin/Cognito token (the admin settings editor listens here too).
    if not token or not (_device_token_ok(serial, token) or hmac.compare_digest(token, ADMIN_TOKEN) or _verify_cognito(token)):
        await ws.close(code=1008)
        return
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
                    _apply_ack(SettingsAck(
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
    except (WebSocketDisconnect, ValueError):
        pass
    finally:
        manager.disconnect(serial, ws)

# Run: uvicorn server.main:app --reload --port 8000
# Install deps: pip install fastapi uvicorn websockets
