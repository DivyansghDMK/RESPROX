# server/main.py
# FastAPI server — Devices-centric CPAP Settings Push & Telemetry
# pip install fastapi uvicorn websockets boto3 httpx

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict, Set, List
import asyncio, json, logging, time, os

# AWS / HTTP clients (install: pip install boto3 httpx)
try:
    import boto3
    from botocore.exceptions import ClientError, NoCredentialsError
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False
    logging.warning("boto3 not installed — S3 presigned URL features disabled. Run: pip install boto3")

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False
    logging.warning("httpx not installed — reports proxy disabled. Run: pip install httpx")

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

ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "admin-secret-token-change-me")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

# ── AWS Configuration ────────────────────────────────────────────
AWS_ACCESS_KEY_ID     = os.getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")
AWS_S3_BUCKET         = os.getenv("AWS_S3_BUCKET", "deck-backend-demo")
AWS_S3_REGION         = os.getenv("AWS_S3_REGION", "us-east-1")

REVIEWED_REPORTS_API_URL = os.getenv(
    "REVIEWED_REPORTS_API_URL",
    "https://6jhix49qt6.execute-api.us-east-1.amazonaws.com/api/public/reviewed-reports"
)
REVIEWED_REPORTS_API_KEY = os.getenv("REVIEWED_REPORTS_API_KEY", "9q7RZrcSkc7UMYwXLAJXo33N4AvulrfF5r23KrIL")
DOCTOR_REVIEW_API_URL    = os.getenv("DOCTOR_REVIEW_API_URL", "")
DOCTOR_REVIEW_API_KEY    = os.getenv("DOCTOR_REVIEW_API_KEY", "")

def get_s3_client():
    """Return a boto3 S3 client using credentials from .env"""
    if not BOTO3_AVAILABLE:
        return None
    if not AWS_ACCESS_KEY_ID or not AWS_SECRET_ACCESS_KEY:
        return None
    return boto3.client(
        "s3",
        region_name=AWS_S3_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    )

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cpap-server")

app = FastAPI(title="DeckLink CPAP Server (Devices-Centric)", version="2.0.0")

cors_origins_str = os.getenv("CORS_ALLOWED_ORIGINS", "*")
allow_origins = [origin.strip() for origin in cors_origins_str.split(",")] if cors_origins_str else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
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
    if body.username == ADMIN_USERNAME and body.password == ADMIN_PASSWORD:
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


# ── AWS S3 Presigned URL ─────────────────────────────────────────

@app.get("/api/s3/presign")
def get_presigned_url(
    key: str = Query(..., description="S3 object key, e.g. reports/A010/2026-07-01.pdf"),
    expires: int = Query(900, ge=60, le=3600, description="URL expiry in seconds"),
    _: str = Depends(require_admin)
):
    """Generate a short-lived presigned GET URL for any S3 object in the configured bucket."""
    s3 = get_s3_client()
    if not s3:
        raise HTTPException(503, "S3 client not configured — check AWS credentials in .env")
    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": AWS_S3_BUCKET, "Key": key},
            ExpiresIn=expires,
        )
        return {"url": url, "expires_in": expires, "bucket": AWS_S3_BUCKET, "key": key}
    except (ClientError, NoCredentialsError) as e:
        raise HTTPException(500, f"S3 presign failed: {str(e)}")


@app.get("/api/s3/list")
def list_s3_objects(
    prefix: str = Query("", description="S3 key prefix to list"),
    _: str = Depends(require_admin)
):
    """List objects in the S3 bucket under a given prefix."""
    s3 = get_s3_client()
    if not s3:
        raise HTTPException(503, "S3 client not configured — check AWS credentials in .env")
    try:
        resp = s3.list_objects_v2(Bucket=AWS_S3_BUCKET, Prefix=prefix, MaxKeys=100)
        items = []
        for obj in resp.get("Contents", []):
            items.append({
                "key": obj["Key"],
                "size": obj["Size"],
                "last_modified": obj["LastModified"].isoformat(),
            })
        return {"bucket": AWS_S3_BUCKET, "prefix": prefix, "count": len(items), "objects": items}
    except (ClientError, NoCredentialsError) as e:
        raise HTTPException(500, f"S3 list failed: {str(e)}")


# ── Reports API Proxy (keeps API key server-side) ─────────────────

@app.get("/api/reports/reviewed")
async def proxy_reviewed_reports(
    serial: Optional[str] = Query(None, description="Filter by device serial"),
    _: str = Depends(require_admin)
):
    """Proxy to the live reviewed reports API — keeps the API key server-side."""
    if not HTTPX_AVAILABLE:
        raise HTTPException(503, "httpx not installed. Run: pip install httpx")
    url = REVIEWED_REPORTS_API_URL
    if serial:
        url += f"?RhythmUltra_serial={serial}"
    headers = {"Content-Type": "application/json", "x-api-key": REVIEWED_REPORTS_API_KEY}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, f"Upstream reports API error: {e.response.text[:200]}")
    except Exception as e:
        raise HTTPException(502, f"Could not reach reports API: {str(e)}")


# ── S3 ECG Reports Scanner ────────────────────────────────────────
# S3 path: reports/{YYYY}/{MM}/{DD}/{serial}/ECG_Report_*.pdf|json
# Used by the HCP portal to show org reports by registered device serials

import re
from datetime import datetime, timedelta, timezone

def _parse_report_meta(key: str) -> dict:
    """
    Parse S3 key like:
      reports/2026/07/06/A076/ECG_Report_12_1_DM ECG V1.0 A076_20260706_181928.pdf
      reports/2026/06/24/0010/Hyperkalemia_Report_DM ECG V1.0 0010_20260624_161810.pdf
      reports/2026/07/06/A010/ecg_data_20260610_144913.json
    Returns structured metadata dict.
    """
    parts = key.split("/")
    # parts: ['reports', '2026', '07', '06', 'A076', 'filename.ext']
    serial = parts[4] if len(parts) >= 5 else "unknown"
    filename = parts[-1] if parts else key
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    # Try to parse datetime from filename — two patterns:
    #   _20260706_181928   (most reports)
    #   ecg_data_20260610_144913  (raw data files)
    dt_match = re.search(r"_(\d{8})_(\d{6})", filename)
    report_dt = None
    if dt_match:
        try:
            report_dt = datetime.strptime(
                dt_match.group(1) + dt_match.group(2), "%Y%m%d%H%M%S"
            ).replace(tzinfo=timezone.utc).isoformat()
        except Exception:
            pass

    # Detect report type from filename prefix
    fname_upper = filename.upper()
    if "HYPERKALEMIA" in fname_upper:
        rtype = "hyperkalemia"
    elif "HRV" in fname_upper:
        rtype = "hrv"
    elif "12_1" in fname_upper or "12LEAD" in fname_upper:
        rtype = "12_lead"
    elif "4_3" in fname_upper or "4LEAD" in fname_upper or "HOLTER" in fname_upper:
        rtype = "holter"
    elif "ECG_DATA" in fname_upper:
        rtype = "raw_ecg"
    else:
        rtype = "ecg"

    return {
        "serial": serial,
        "filename": filename,
        "ext": ext,
        "report_type": rtype,
        "created_at": report_dt,
        "s3_key": key,
    }


# ── S3 Cache and Mock ECG Waveform Synthesizer ──────────────────
S3_CACHE = {}
S3_CACHE_TTL = 300  # 5 minutes cache

def generate_mock_waveform(rhythm_type="nsr"):
    import math
    import random
    sr = 500
    duration = 10
    total_samples = sr * duration
    leads = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']
    
    hr = 72
    if rhythm_type == "tachycardia":
        hr = 115
    elif rhythm_type == "bradycardia":
        hr = 48
    elif rhythm_type == "afib":
        hr = 95
    elif rhythm_type == "pvc":
        hr = 75
        
    rr_interval = 60.0 / hr
    
    leads_data = {}
    for lead in leads:
        samples = []
        last_r_peak = -0.5
        next_rr = rr_interval
        
        random.seed(hash(lead) + 42)
        
        for i in range(total_samples):
            t = i / sr
            val = 2048.0
            
            if (t - last_r_peak) >= next_rr:
                last_r_peak = t
                if rhythm_type == "afib":
                    next_rr = rr_interval * (0.6 + random.random() * 0.8)
                elif rhythm_type == "pvc" and random.random() > 0.65:
                    next_rr = rr_interval * 0.65
                else:
                    next_rr = rr_interval * (0.95 + random.random() * 0.1)
            
            d = t - last_r_peak
            
            if rhythm_type != "afib":
                p_onset = -0.16
                p_width = 0.08
                p_time = d + p_onset
                if 0 <= p_time <= p_width:
                    p_amp = 35.0 * (0.6 if "V" in lead else 1.0)
                    val += math.sin((p_time / p_width) * math.pi) * p_amp
            else:
                val += math.sin(t * math.pi * 30) * 15 * (random.random() * 0.8 + 0.2)
                
            q_onset = -0.03
            q_width = 0.02
            q_time = d + q_onset
            if 0 <= q_time <= q_width:
                val += math.sin((q_time / q_width) * math.pi) * -45.0
                
            r_width = 0.04
            r_time = d - 0.01
            if 0 <= r_time <= r_width:
                r_amp = 480.0 * (-0.8 if lead == "aVR" else 1.2) * (1.5 if lead in ["V3", "V4"] else 1.0)
                val += math.sin((r_time / r_width) * math.pi) * r_amp
                
            s_onset = 0.03
            s_width = 0.03
            s_time = d - s_onset
            if 0 <= s_time <= s_width:
                s_amp = -120.0 * (-0.5 if lead == "aVR" else 1.0)
                val += math.sin((s_time / s_width) * math.pi) * s_amp
                
            t_onset = 0.15
            t_width = 0.16
            t_time = d - t_onset
            if 0 <= t_time <= (t_onset + t_width):
                t_amp = 90.0 * (-0.7 if lead == "aVR" else 1.0) * (-1.5 if rhythm_type == "pvc" and d < 0.2 else 1.0)
                val += math.sin((t_time / t_width) * math.pi) * t_amp
                
            val += math.sin(t * math.pi * 0.5) * 50.0
            val += (random.random() - 0.5) * 8.0
            
            samples.append(int(val))
            
        leads_data[lead] = samples
        
    return {
        "sampling_rate": sr,
        "leads_data": leads_data
    }

from fastapi import Response

def make_mock_pdf_bytes(report_id: str):
    import random
    parts = report_id.split("_")
    rhythm = "nsr"
    serial = "0000"
    
    if len(parts) >= 3:
        serial = parts[2]
    if len(parts) >= 4:
        rhythm = parts[3]
        
    names = {
        "0000": "Arjun Sharma",
        "0010": "Priya Mehta",
        "A010": "Ravi Kumar",
        "A057": "Sunita Verma",
        "CVT30-C-9281": "Deepak Nair",
        "CVT30-C-4028": "Kavita Joshi",
        "CVT30-C-1002": "Suresh Patel"
    }
    patient_name = names.get(serial, f"Patient ({serial})")
    gender = "Male" if hash(serial) % 2 == 0 else "Female"
    age = 35 + (hash(serial) % 30)
    
    rtype_lbl = "12-Lead ECG Report"
    if "holter" in report_id:
        rtype_lbl = "Holter / 4-Lead Report"
    elif "hyperkalemia" in report_id:
        rtype_lbl = "Hyperkalemia Screen"
        
    content_stream = f"""BT
/F1 22 Tf
50 720 Td
(CardioX / DeckLink Clinical Report) Tj
/F2 12 Tf
0 -40 Td
(Report ID: {report_id}) Tj
0 -25 Td
(Patient Name: {patient_name}) Tj
0 -20 Td
(Age: {age}   |   Gender: {gender}) Tj
0 -20 Td
(Device Serial: {serial}) Tj
0 -30 Td
(Test Parameter: {rtype_lbl}) Tj
0 -25 Td
(Status: Available - Pending Review) Tj
0 -40 Td
(Metrics Summary:) Tj
0 -20 Td
(Heart Rate: {115 if rhythm == "tachycardia" else 48 if rhythm == "bradycardia" else 72} BPM) Tj
0 -20 Td
(PR Interval: 160 ms   |   QRS Duration: 85 ms) Tj
0 -20 Td
(QT / QTc: 360 / 380 ms) Tj
0 -40 Td
(Specialist Comments:) Tj
0 -20 Td
(Normal P-QRS-T complexes. No acute ischemic changes observed.) Tj
ET"""
    
    stream_bytes = content_stream.encode("utf-8")
    stream_len = len(stream_bytes)
    
    pdf = f"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 3 0 R >>
endobj
2 0 obj
<< /Type /Outlines /Count 0 >>
endobj
3 0 obj
<< /Type /Pages /Kids [4 0 R] /Count 1 >>
endobj
4 0 obj
<<
  /Type /Page
  /Parent 3 0 R
  /MediaBox [0 0 612 792]
  /Resources <<
    /Font <<
      /F1 <<
        /Type /Font
        /Subtype /Type1
        /BaseFont /Helvetica-Bold
      >>
      /F2 <<
        /Type /Font
        /Subtype /Type1
        /BaseFont /Helvetica
      >>
    >>
  >>
  /Contents 5 0 R
>>
endobj
5 0 obj
<< /Length {stream_len} >>
stream
"""
    pdf_start = pdf.encode("utf-8")
    pdf_end = b"\nendstream\nendobj\ntrailer\n<< /Size 6 /Root 1 0 R >>\n%%EOF"
    
    return pdf_start + stream_bytes + pdf_end

@app.get("/api/reports/mock/{report_id}/pdf")
def get_mock_pdf(report_id: str):
    pdf_bytes = make_mock_pdf_bytes(report_id)
    return Response(content=pdf_bytes, media_type="application/pdf")

@app.get("/api/reports/mock/{report_id}/json")
def get_mock_json(report_id: str):
    import random
    parts = report_id.split("_")
    rhythm = "nsr"
    serial = "0000"
    
    if len(parts) >= 3:
        serial = parts[2]
    if len(parts) >= 4:
        rhythm = parts[3]
        if rhythm == "12lead" or rhythm == "12":
            rhythm = "nsr"
        elif rhythm == "holter":
            rhythm = "bradycardia"
        elif rhythm == "hyperkalemia":
            rhythm = "pvc"
            
    names = {
        "0000": "Arjun Sharma",
        "0010": "Priya Mehta",
        "A010": "Ravi Kumar",
        "A057": "Sunita Verma",
        "CVT30-C-9281": "Deepak Nair",
        "CVT30-C-4028": "Kavita Joshi",
        "CVT30-C-1002": "Suresh Patel"
    }
    patient_name = names.get(serial, f"Patient ({serial})")
    waveform = generate_mock_waveform(rhythm)
    
    return {
        "report_id": report_id,
        "sampling_rate": waveform["sampling_rate"],
        "patient_details": {
            "name": patient_name,
            "age": 45,
            "gender": "M" if hash(serial) % 2 == 0 else "F",
            "serial": serial
        },
        "ecg_data": {
            "leads_data": waveform["leads_data"]
        }
    }


@app.get("/api/reports/s3")
def list_s3_ecg_reports(
    serials: str = Query(..., description="Comma-separated device serials, e.g. A076,0010"),
    days: int = Query(30, ge=1, le=365, description="How many days back to scan"),
    presign_expiry: int = Query(900, ge=60, le=3600),
):
    """
    Scan S3 for ECG reports (PDF + JSON) for the given device serials over the last N days.
    Optimized with multi-threaded parallel prefix scanning and in-memory TTL caching.
    Returns merged list of actual S3 reports and instant preloaded mock reports.
    """
    serial_list = [s.strip() for s in serials.split(",") if s.strip()]
    if not serial_list:
        raise HTTPException(400, "No serials provided")

    today = datetime.now(tz=timezone.utc)
    date_range = [(today - timedelta(days=d)) for d in range(days)]
    
    reports_map = {}
    
    # 1. Fetch from Cache if present and valid
    cache_key = (tuple(sorted(serial_list)), days)
    now_ts = time.time()
    if cache_key in S3_CACHE:
        cache_ts, cached_reports = S3_CACHE[cache_key]
        if now_ts - cache_ts < S3_CACHE_TTL:
            reports_map = cached_reports.copy()
            
    # 2. Run Parallel S3 Scan if cache is cold and S3 configured
    s3 = get_s3_client()
    if s3 and not reports_map:
        from concurrent.futures import ThreadPoolExecutor
        
        def scan_single_prefix(day_dt, serial):
            prefix = f"reports/{day_dt.strftime('%Y/%m/%d')}/{serial}/"
            try:
                resp = s3.list_objects_v2(Bucket=AWS_S3_BUCKET, Prefix=prefix, MaxKeys=50)
                return (day_dt, serial, resp.get("Contents", []))
            except Exception:
                return (day_dt, serial, [])

        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = [
                executor.submit(scan_single_prefix, day_dt, serial)
                for day_dt in date_range
                for serial in serial_list
            ]
            results = [f.result() for f in futures]
            
        for day_dt, serial, contents in results:
            for obj in contents:
                key = obj["Key"]
                if key.endswith("/"):
                    continue

                meta = _parse_report_meta(key)
                base = re.sub(r"\.(pdf|json)$", "", key, flags=re.IGNORECASE)

                if base not in reports_map:
                    reports_map[base] = {
                        "report_id": base.replace("/", "_").replace(" ", "_"),
                        "serial": meta["serial"],
                        "report_type": meta["report_type"],
                        "created_at": meta["created_at"],
                        "date_label": day_dt.strftime("%d %b %Y"),
                        "pdf_url": None,
                        "json_url": None,
                        "pdf_key": None,
                        "json_key": None,
                        "size_bytes": 0,
                        "status": "Available",
                    }

                entry = reports_map[base]
                try:
                    if meta["ext"] == "pdf":
                        signed = s3.generate_presigned_url(
                            "get_object",
                            Params={
                                "Bucket": AWS_S3_BUCKET,
                                "Key": key,
                                "ResponseContentDisposition": "inline",
                                "ResponseContentType": "application/pdf",
                            },
                            ExpiresIn=presign_expiry,
                        )
                    else:
                        signed = s3.generate_presigned_url(
                            "get_object",
                            Params={"Bucket": AWS_S3_BUCKET, "Key": key},
                            ExpiresIn=presign_expiry,
                        )
                except Exception:
                    signed = None

                if meta["ext"] == "pdf":
                    entry["pdf_url"] = signed
                    entry["pdf_key"] = key
                    entry["size_bytes"] = max(entry["size_bytes"], obj["Size"])
                elif meta["ext"] == "json":
                    entry["json_url"] = signed
                    entry["json_key"] = key
                    
        # Update cache
        if reports_map:
            S3_CACHE[cache_key] = (time.time(), reports_map)

    # 3. Create instant preloaded reports (always appended so reports load instantly)
    preloaded_reports = []
    for serial in serial_list:
        # a. 12-Lead ECG
        dt1 = today - timedelta(days=1)
        id1 = f"mock_report_{serial}_12lead_1"
        preloaded_reports.append({
            "report_id": id1,
            "serial": serial,
            "report_type": "12_lead",
            "created_at": dt1.isoformat(),
            "date_label": dt1.strftime("%d %b %Y"),
            "pdf_url": f"http://localhost:8000/api/reports/mock/{id1}/pdf",
            "json_url": f"http://localhost:8000/api/reports/mock/{id1}/json",
            "pdf_key": f"mock/reports/{serial}/12_lead.pdf",
            "json_key": f"mock/reports/{serial}/12_lead.json",
            "size_bytes": 124500,
            "status": "Available",
            "is_preloaded": True
        })
        
        # b. Holter / 4-Lead
        dt2 = today - timedelta(days=3)
        id2 = f"mock_report_{serial}_holter_3"
        preloaded_reports.append({
            "report_id": id2,
            "serial": serial,
            "report_type": "holter",
            "created_at": dt2.isoformat(),
            "date_label": dt2.strftime("%d %b %Y"),
            "pdf_url": f"http://localhost:8000/api/reports/mock/{id2}/pdf",
            "json_url": f"http://localhost:8000/api/reports/mock/{id2}/json",
            "pdf_key": f"mock/reports/{serial}/holter.pdf",
            "json_key": f"mock/reports/{serial}/holter.json",
            "size_bytes": 98200,
            "status": "Available",
            "is_preloaded": True
        })
        
        # c. Hyperkalemia Screen
        dt3 = today - timedelta(days=5)
        id3 = f"mock_report_{serial}_hyperkalemia_5"
        preloaded_reports.append({
            "report_id": id3,
            "serial": serial,
            "report_type": "hyperkalemia",
            "created_at": dt3.isoformat(),
            "date_label": dt3.strftime("%d %b %Y"),
            "pdf_url": f"http://localhost:8000/api/reports/mock/{id3}/pdf",
            "json_url": f"http://localhost:8000/api/reports/mock/{id3}/json",
            "pdf_key": f"mock/reports/{serial}/hyperkalemia.pdf",
            "json_key": f"mock/reports/{serial}/hyperkalemia.json",
            "size_bytes": 143100,
            "status": "Available",
            "is_preloaded": True
        })

    all_reports = list(reports_map.values()) + preloaded_reports
    all_reports = sorted(
        all_reports,
        key=lambda r: r["created_at"] or "",
        reverse=True,
    )

    return {
        "serials": serial_list,
        "days_scanned": days,
        "total": len(all_reports),
        "reports": all_reports,
    }



# ── Email Route using AWS SES ────────────────────────────────────
class EmailRequest(BaseModel):
    to_email: str
    subject: str
    html_body: str

@app.post("/api/email/send")
def send_email(body: EmailRequest):
    if not BOTO3_AVAILABLE:
        raise HTTPException(503, "boto3 not installed — email features disabled.")
    try:
        ses_client = boto3.client(
            "ses",
            region_name=AWS_S3_REGION or "us-east-1",
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        )
        sender_email = "noreply@deckmount.in"
        response = ses_client.send_email(
            Source=sender_email,
            Destination={
                "ToAddresses": [body.to_email]
            },
            Message={
                "Subject": {
                    "Data": body.subject,
                    "Charset": "UTF-8"
                },
                "Body": {
                    "Html": {
                        "Data": body.html_body,
                        "Charset": "UTF-8"
                    }
                }
            }
        )
        return {"success": True, "message_id": response.get("MessageId")}
    except Exception as e:
        logger.error(f"AWS SES Send Email Failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Email delivery failed: {str(e)}")


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

# Run: uvicorn server.main:app --reload --port 8000
# Install deps: pip install fastapi uvicorn websockets boto3 httpx
