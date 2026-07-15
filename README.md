# DeckLink & ResproX - Clinical ECG & CPAP Portal

This repository contains the integrated CPAP patient compliance dashboard and the **DeckLink Clinical ECG Waveform Analysis (Clinical Pro)** suite.

---

## 🚀 Getting Started

The platform utilizes a **Vite + React** frontend and a **FastAPI** backend server.

### 1. Prerequisites (Backend Dependencies)
Ensure python dependencies are installed:
```bash
pip install fastapi uvicorn websockets boto3 httpx
```

### 2. Running the Services

* **Start the Backend API Server** (from the root directory):
  ```bash
  uvicorn server.main:app --reload --port 8000
  ```
  *The backend will boot on `http://localhost:8000`.*

* **Start the Frontend Client**:
  ```bash
  npm run dev
  ```
  *The React developer server will run on `http://localhost:5173`.*

---

## 🩺 End-to-End Clinical Use Case: ECG Waveform Analysis

The **Waveform Analysis** module is designed for doctors, clinicians, and medical reviewers to visually inspect raw multi-lead ECG signals, perform precision measurements, and record diagnostic annotations.

Here is the step-by-step workflow:

### Step 1: Practitioner Sign-In
1. Navigate to the **DeckLink Clinician Portal** at `http://localhost:5173/hcp`.
2. Authenticate using one of the pre-seeded clinical user mobile numbers (OTP verification):
   * **Rahul Mehta** (HCP Head): `9810000002`
   * **Dr. Aditi Sharma** (Jr Doc): `9810000001`
   * **Priya Nair** (Receptionist): `9810000003`
3. Enter any 4-digit code (e.g. `1234`) to pass verification and enter the dashboard.

### Step 2: Accessing ECG Reports
1. In the top navigation bar of the Clinician Portal, click **ECG Reports**.
2. This displays a table listing all patient records synchronized from the cloud (populated from the S3 API `/api/reports/s3`).
3. For any record containing raw sensor signals, the **Actions** column displays a cyan **Waveform** button next to the standard *PDF* and *JSON* links.

### Step 3: Triggering Waveform Review
1. Click the **Waveform** button on a report row.
2. This immediately loads the raw data block (supporting compact pipe-separated frames or array payloads) and opens the **Waveform Analysis Canvas** as a modal overlay preloaded with that patient's actual 10-second multi-lead ECG signal.
3. The dashboard locks background interaction so you can inspect the 12 standard leads (`I`, `II`, `III`, `aVR`, `aVL`, `aVF`, `V1`-`V6`) rendered over standard red clinical graph paper grid boxes (1mm fine grid / 5mm bold grid).

### Step 4: Visual Measurement & Troubleshooting
1. **Interactive Tools**: Select a tool mode from the left-side control panel:
   * **Measurement Ruler**: Click and drag across a QRS complex to draw a shaded box. The overlay will dynamically output the width ($\Delta t$ in milliseconds, HR in BPM) and the height amplitude ($\Delta V$ in mV) of the wave section.
   * **Dual Calipers**: Grab the calipers handles on successive R-peaks. The calculator will output the exact R-R interval duration and the patient's instantaneous Heart Rate (BPM).
   * **Magnifier Lens**: Select the magnifier glass and hover over a lead to draw a $3.5\times$ zoom lens box directly over the cursor, revealing high-definition details of the waveform.
   * **Arrhythmia Annotations**: Tap the *Annotate* tool, pick a tag (like *PVC* or *Atrial Fibrillation*), and click directly on the wave to overlay custom markers.
2. **Scrubber Timeline**: Press **Play** on the timeline scrubber at the bottom to animate/move the visible window (2.5s, 5.0s, or 10.0s window size) smoothly across the full recording.
3. **Hardware Filtering**: Check the DSP filters (AC Notch 50Hz, EMG 25Hz low-pass, and DFT baseline stabilizer) in the sidebar to clean up high-frequency muscle noise or baseline drift from the rendering context.

### Step 5: Single-Lead Detailed Interpretation
1. While in *Select* mode, double-click on any of the 12 leads.
2. This opens the **Lead Expanded Analysis** window, allowing you to:
   * Slide the **Amplification** slider from $0.25\times$ to $4.0\times$ to scale weak signals.
   * Toggle **Time Zoom** up to $8.0\times$.
   * Read automated average interval parameters (estimated R-R, P-R, Q-S intervals, and Bazett QTc calculation).
   * View the rhythm interpretation readout.

### Step 6: Completing Review
1. All ruler captures and annotations appear in the **Diagnostic Logs** list in the right-side panel.
2. Click the back arrow `←` in the header bar of the Waveform panel to close the overlay, returning to the reports list table where you can approve or export the file.

---

## 🛠 Alternate / Standalone Page Access
For administrative configure roles:
1. Log in at `http://localhost:5173/login` using username `admin` and password `admin123`.
2. Navigate to **Waveform Analysis** from the sidebar navigation link.
3. Here, you can toggle the *Demo Rhythm* selector dropdown in the header to run the full simulation tools across standard cardiac profiles (**Normal Sinus**, **Tachycardia**, **Bradycardia**, **Atrial Fibrillation**, or **PVC** beats) or import local files.
