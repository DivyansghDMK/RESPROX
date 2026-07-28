# RESPROX & DeckLink — Clinical CPAP & ECG Telemetry Portal

An end-to-end clinical monitoring and therapy management platform for **RESPROX CPAP devices** and **DeckLink Clinical ECG Waveform Analysis**. Built with a **Vite + React** Single Page Application (SPA), **AWS Cognito Authentication**, **AWS IoT Core / REST API Gateway integration**, and a **FastAPI** backend service.

---

## 📋 Table of Contents
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Key Features](#-key-features)
- [Getting Started](#-getting-started)
- [AWS Cognito & REST API Specification](#-aws-cognito--rest-api-specification)
- [70-Byte CPAP Telemetry Binary Protocol](#-70-byte-cpap-telemetry-binary-protocol)
- [Backend Settings Push Contract (`PATCH /devices/{serial}/settings`)](#-backend-settings-push-contract-patch-devicesserialsettings)
- [Terminal Utilities & Diagnostics](#-terminal-utilities--diagnostics)
- [ECG Waveform Analysis Guide](#-ecg-waveform-analysis-guide)

---

## 🏗 Architecture & Tech Stack

```
                     ┌─────────────────────────────────────────┐
                     │          Vite + React Frontend          │
                     │  (TherapyContext, RespireeAPI, GSAP)   │
                     └────────────────────┬────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
     ┌──────────────────────────┐                    ┌──────────────────────────┐
     │  AWS Cognito User Pool   │                    │    AWS API Gateway       │
     │  (JWT Token Auth)        │                    │  (REST Staging Endpoint) │
     └──────────────────────────┘                    └────────────┬─────────────┘
                                                                  │
                                                     ┌────────────┴─────────────┐
                                                     ▼                          ▼
                                        ┌──────────────────────────┐  ┌───────────────────┐
                                        │  RDS Database (Telemetry)│  │ AWS IoT Core (MQTT│
                                        └──────────────────────────┘  └───────────────────┘
```

* **Frontend:** React 18, Vite, React Router DOM, GSAP, Lenis Smooth Scroll, MUI Icons.
* **Authentication:** AWS Cognito User Pool (`USER_PASSWORD_AUTH` flow) with automatic token refresh.
* **API Layer:** Axios / Fetch proxy handling AWS Execute-API endpoints and Cognito JWT headers.
* **Backend Service (Local / Staging):** Python FastAPI (`server/main.py`), WebSockets, AWS IoT Core proxy.

---

## ✨ Key Features

1. **Real-time CPAP Telemetry Dashboard:**
   * Live metrics rendering: **Usage Hours**, **AHI Index**, **Mask Leak**, **95th Percentile Pressure**, and **Compliance Status** ($\ge 4\text{ hours/night}$).
   * 7-Day interactive trend charts (AHI, Usage, Mask Leak).

2. **70-Byte Binary Telemetry Packet Decoding Engine:**
   * On-the-fly parsing of raw uint8 byte arrays received from CPAP hardware uploads over AWS IoT.
   * Automated date extraction and server timestamp fallback for uninitialized hardware clocks.

3. **Interactive Session Log Inspector:**
   * Expandable table rows on the Admin Device Dashboard.
   * Click any historical session row to inspect its unique **Packet ID**, **Server Ingestion Time**, and **Raw Payload Bytes**.

4. **Admin Therapy Settings Sliders (CPAP & Auto-CPAP):**
   * Configurable Pressure (4 – 30 cmH₂O), Min/Max Auto Pressure, Aflex (EPR 0–3), and Ramp Time (0–45 mins).
   * Synchronized `PATCH` API calls to push target settings directly back to the database.

5. **Real-Time DB Sync Polling:**
   * Non-blocking, recursive `setTimeout` polling (every 30 seconds) that detects database updates without UI flicker or network request piling.

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure Node.js ($\ge 18$) and Python ($\ge 3.9$) are installed on your machine.

### 2. Frontend Development Server
Install dependencies and launch the Vite dev server:
```bash
npm install
npm run dev
```
The React frontend will boot at `http://localhost:5173/`.

### 3. Optional Local Backend Server
To run the local FastAPI mock server (supporting local WebSocket pushes):
```bash
pip install fastapi uvicorn websockets boto3 httpx
uvicorn server.main:app --reload --port 8000
```
*The local backend runs at `http://localhost:8000`.*

---

## 🔐 AWS Cognito & REST API Specification

### Authentication
* **Cognito Endpoint:** `https://cognito-idp.us-east-1.amazonaws.com/`
* **Client ID:** `4t8fgoocp4b8j8q62japdacnhu`
* **Default Admin Account:** `kanishka.sharma@deckmount.in` / `KanishkaDeck@20` *(Dev alias: `admin` / `2026`)*

### Primary API Routes (`https://52ct9sbsu3.execute-api.us-east-1.amazonaws.com`)
* `GET /devices` — List all registered CPAP machines.
* `GET /devices/{serial}/telemetry/latest` — Fetch latest raw telemetry packet.
* `GET /devices/{serial}/telemetry/history?page=1&limit=20` — Fetch historical telemetry logs.
* `GET /devices/{serial}/sync-state` — Check sync state & last server download time.
* `PATCH /devices/{serial}/settings` — Push updated therapy configuration to the DB.

---

## 📦 70-Byte CPAP Telemetry Binary Protocol

The device uploads raw telemetry frames formatted as 70-byte arrays (`decoded_payload.raw`):

| Byte Index | Field Description | Unit / Scaling Factor |
| :--- | :--- | :--- |
| `raw[0]` | Start Frame Header | `232` (`0xE8`) |
| `raw[4]` | Usage Hours | Value $\div 10.0$ (e.g. `100` = `10.0 hrs`) |
| `raw[5]` | AHI Score (Events/Hour) | Value $\div 10.0$ (e.g. `50` = `5.0 events/hr`) |
| `raw[6]` | Mask Leak Rate | Value $\div 10.0$ (e.g. `200` = `20.0 L/min`) |
| `raw[7]` | 95th Percentile Pressure | cmH₂O (e.g. `10` = `10 cmH₂O`) |
| `raw[8]` | Therapy Mode | `3` = CPAP, `2` = AUTO CPAP |
| `raw[60]` | Session Day | Day of month (e.g. `25`) |
| `raw[61]` | Session Month | Month index (e.g. `6` = June) |
| `raw[62]` | Session Year | Year offset (e.g. `25` = 2025) |
| `raw[69]` | End Frame Marker | `142` (`0x8E`) |

---

## 🛠 Backend Settings Push Contract (`PATCH /devices/{serial}/settings`)

To update therapy settings from the UI back to the database, send an HTTP `PATCH` request:

### Request Header
```http
PATCH /devices/CVT3000001/settings HTTP/1.1
Authorization: Bearer <Cognito_Id_Token>
Content-Type: application/json
```

### Request Body (JSON)
```json
{
  "therapy_mode": "AUTO CPAP",
  "pressure": 12.0,
  "min_pressure": 8.0,
  "max_pressure": 18.0,
  "aflex": 2,
  "ramp": 15.0
}
```

### Server Response (200 OK)
```json
{
  "success": true,
  "device_id": "CVT3000001",
  "device_online": true,
  "settings": {
    "therapy_mode": "AUTO CPAP",
    "pressure": 12.0,
    "min_pressure": 8.0,
    "max_pressure": 18.0,
    "aflex": 2,
    "ramp": 15.0
  },
  "message": "Settings pushed to device successfully"
}
```

---

## 💻 Terminal Utilities & Diagnostics

You can dump and inspect all live Cognito RDS records directly in your terminal at any time:

```bash
python3 /Users/deckmount/.gemini/antigravity-ide/brain/c773c69a-1580-4c23-91f3-3b75e1389ed0/scratch/fetch_all_data.py
```

This utility authenticates against Cognito, fetches all registered devices, decodes the latest raw 70-byte packets, and outputs record-wise telemetry metrics directly to the command line.

---

## 🩺 ECG Waveform Analysis Guide

The platform includes the **DeckLink Clinical ECG Waveform Analysis (Clinical Pro)** suite for inspecting 12-lead ECG signals:

1. Navigate to **Clinician Portal** at `http://localhost:5173/hcp`.
2. Login with pre-seeded OTP clinical numbers (`9810000001`, `9810000002`, `9810000003`) and code `1234`.
3. Open **ECG Reports** and click **Waveform** to view interactive 12-lead graphs.
4. Tools available: **Measurement Ruler** ($\Delta t$, $\Delta V$), **Dual Calipers** (R-R interval, HR BPM), **Magnifier Lens** ($3.5\times$), and **Arrhythmia Annotations**.
