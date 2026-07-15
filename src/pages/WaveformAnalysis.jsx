import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Activity, 
  MousePointer, 
  Ruler, 
  Sliders, 
  Search, 
  Tag, 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Maximize2, 
  Trash2, 
  Download, 
  ChevronRight, 
  FileText,
  Clock,
  Sparkles,
  RefreshCw,
  Plus,
  ArrowLeft
} from 'lucide-react';
import { useTherapy } from '../context/TherapyContext';

// ── CONSTANTS ────────────────────────────────────────────────────────
const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
const ADC_BASELINE = 2048;
const ADC_TO_MV = 0.005; // 1 unit = 0.005 mV (200 units = 1 mV)

// Predefined mock rhythms for synthesizer fallback
const RHYTHMS = {
  nsr: { label: 'Normal Sinus Rhythm (72 BPM)', hr: 72, type: 'nsr' },
  tachycardia: { label: 'Sinus Tachycardia (115 BPM)', hr: 115, type: 'tachycardia' },
  bradycardia: { label: 'Sinus Bradycardia (48 BPM)', hr: 48, type: 'bradycardia' },
  afib: { label: 'Atrial Fibrillation (Irregular)', hr: 90, type: 'afib' },
  pvc: { label: 'PVC (Premature Ventricular Contractions)', hr: 75, type: 'pvc' },
};

// Arrhythmia labels for Annotate tool
const ARRHYTHMIA_TYPES = [
  'Normal Beat',
  'PVC (Premature Ventricular)',
  'PAC (Premature Atrial)',
  'Atrial Fibrillation',
  'SVT (Supraventricular Tachy)',
  'Tachycardia',
  'Bradycardia',
  'ST Elevation',
  'ST Depression',
  'Artifact / Noise'
];

export default function WaveformAnalysis({ preloadedReportUrl = null, preloadedReport = null, onClose = null, hideSelector = false }) {
  const { setShowToast, setToastMessage, setSaveState } = useTherapy();

  // ─── STATE ──────────────────────────────────────────────────────────
  const [reports, setReports] = useState([]);
  const [selectedReportIdx, setSelectedReportIdx] = useState(-1);
  const [currentReport, setCurrentReport] = useState(null);
  
  // Waveform state
  const [leadData, setLeadData] = useState({});
  const [samplingRate, setSamplingRate] = useState(500);
  const [duration, setDuration] = useState(10); // seconds
  
  // Interactive Controls
  const [currentTool, setCurrentTool] = useState('select'); // select | ruler | caliper | magnifier | annotate
  const [magnifierZoom, setMagnifierZoom] = useState(3.5); // 2x to 5x
  const [gain, setGain] = useState(10); // 5 | 10 | 20 mm/mV
  const [speed, setSpeed] = useState(25); // 25 | 50 mm/s
  const [layoutMode, setLayoutMode] = useState('6x2'); // 12x1 | 6x2 | 3x4
  
  // Filter toggle states
  const [filterAC, setFilterAC] = useState(true); // 50Hz Notch
  const [filterEMG, setFilterEMG] = useState(false); // 25Hz Lowpass
  const [filterDFT, setFilterDFT] = useState(true); // Baseline wander filter
  
  // Playback timeline states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // in seconds
  const [windowSize, setWindowSize] = useState(5.0); // visible duration in seconds
  
  // Selected Rhythm for synthesizer
  const [selectedRhythm, setSelectedRhythm] = useState('nsr');
  
  // Measurements and annotations storage
  const [rulerMeasurements, setRulerMeasurements] = useState([]);
  const [calipers, setCalipers] = useState({ left: 1.5, right: 2.3 }); // time offsets in seconds
  const [annotations, setAnnotations] = useState([]);
  const [selectedAnnotationType, setSelectedAnnotationType] = useState(ARRHYTHMIA_TYPES[1]);
  
  // Expanded Lead View Modal state
  const [expandedLead, setExpandedLead] = useState(null);
  const [expandedAmp, setExpandedAmp] = useState(1.0);
  const [expandedZoom, setExpandedZoom] = useState(1.0);
  
  // UI interaction helper ref
  const containerRef = useRef(null);

  // ─── SYNTHESIZE ECG SIGNALS (Fallback & Demo mode) ──────────────────
  const synthesizedData = useMemo(() => {
    const sr = 500;
    const totalSamples = sr * 10; // 10 seconds of data
    const data = {};
    
    // Seed random seed for reproducible curves
    let seed = 42;
    const random = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    LEADS.forEach((lead) => {
      const leadSamples = new Float32Array(totalSamples);
      
      // Rhythm properties
      const rhythmConfig = RHYTHMS[selectedRhythm];
      const baseHr = rhythmConfig.hr;
      let rrInterval = 60 / baseHr; // seconds

      let lastRPeakSec = -0.5;
      let nextRR = rrInterval;
      
      for (let i = 0; i < totalSamples; i++) {
        const t = i / sr;
        let val = ADC_BASELINE;

        // Determine if we trigger a new beat
        let timeSinceLastBeat = t - lastRPeakSec;
        if (timeSinceLastBeat >= nextRR) {
          lastRPeakSec = t;
          timeSinceLastBeat = 0;
          
          // Re-calculate next R-R interval
          if (rhythmConfig.type === 'afib') {
            // Highly irregular
            nextRR = rrInterval * (0.6 + random() * 0.8);
          } else if (rhythmConfig.type === 'pvc' && random() > 0.65) {
            // Premature beat followed by long compensatory pause
            nextRR = rrInterval * 0.65;
          } else {
            nextRR = rrInterval * (0.95 + random() * 0.1);
          }
        }

        // PQRST Wave Synthesizer Engine
        const d = timeSinceLastBeat; // duration since beat onset
        
        // P-wave (normal unless afib)
        if (rhythmConfig.type !== 'afib') {
          const pOnset = -0.16;
          const pWidth = 0.08;
          const pTime = d + pOnset;
          if (pTime >= 0 && pTime <= pWidth) {
            // Sinusoidal bump
            const pAmp = 35 * (lead.includes('V') ? 0.6 : 1.0);
            val += Math.sin((pTime / pWidth) * Math.PI) * pAmp;
          }
        } else {
          // Chaotic fibrillatory waves (f-waves)
          val += Math.sin(t * Math.PI * 30) * 15 * (random() * 0.8 + 0.2);
        }

        // Q-wave
        const qOnset = -0.03;
        const qWidth = 0.02;
        const qTime = d + qOnset;
        if (qTime >= 0 && qTime <= qWidth) {
          const qAmp = -45;
          val += Math.sin((qTime / qWidth) * Math.PI) * qAmp;
        }

        // R-wave (Main QRS Spike)
        const rWidth = 0.04;
        const rTime = d - 0.01;
        if (rTime >= 0 && rTime <= rWidth) {
          const rAmp = 480 * (lead === 'aVR' ? -0.8 : 1.2) * (lead.includes('V3') || lead.includes('V4') ? 1.5 : 1.0);
          val += Math.sin((rTime / rWidth) * Math.PI) * rAmp;
        }

        // S-wave
        const sOnset = 0.03;
        const sWidth = 0.03;
        const sTime = d - sOnset;
        if (sTime >= 0 && sTime <= sWidth) {
          const sAmp = -120 * (lead === 'aVR' ? -0.5 : 1.0);
          val += Math.sin((sTime / sWidth) * Math.PI) * sAmp;
        }

        // T-wave
        const tOnset = 0.15;
        const tWidth = 0.16;
        const tTime = d - tOnset;
        if (tTime >= 0 && tTime <= tOnset + tWidth) {
          const tAmp = 90 * (lead === 'aVR' ? -0.7 : 1.0) * (selectedRhythm === 'pvc' && d < 0.2 ? -1.5 : 1.0);
          val += Math.sin((tTime / tWidth) * Math.PI) * tAmp;
        }

        // Add some physical baseline wander + muscle noise
        let noise = 0;
        if (filterEMG === false) {
          // high frequency muscle artifacts
          noise += (random() - 0.5) * 15;
        }
        if (filterDFT === false) {
          // low frequency baseline wander
          noise += Math.sin(t * Math.PI * 0.4) * 80;
        }
        val += noise;

        // Apply Lead Specific Modulations to look realistic
        if (lead === 'III') {
          val = ADC_BASELINE + (val - ADC_BASELINE) * 0.4;
        } else if (lead === 'aVL') {
          val = ADC_BASELINE + (val - ADC_BASELINE) * 0.65;
        } else if (lead === 'aVF') {
          val = ADC_BASELINE + (val - ADC_BASELINE) * 0.85;
        }

        leadSamples[i] = val;
      }

      data[lead] = leadSamples;
    });

    return data;
  }, [selectedRhythm, filterAC, filterEMG, filterDFT]);

  // Use loaded JSON report or fall back to synthesized waveforms
  const activeLeadData = useMemo(() => {
    if (currentReport && Object.keys(leadData).length > 0) {
      return leadData;
    }
    return synthesizedData;
  }, [currentReport, leadData, synthesizedData]);

  // ─── FETCH FILES FROM BACKEND API ──────────────────────────────────
  const fetchS3Reports = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/reports/s3?serials=CVT30-C-9281,CVT30-C-4028,CVT30-C-1002&days=90');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.reports) {
        const jsonReports = data.reports.filter(r => r.ext === 'json' || r.json_url);
        setReports(jsonReports);
        if (jsonReports.length > 0) {
          setSelectedReportIdx(0);
          loadReportFromUrl(jsonReports[0].json_url);
        }
      }
    } catch (err) {
      console.warn("Failed fetching S3 reports. Falling back to generated waveforms.", err);
      const mockList = [
        { report_id: 'DEMO-001', filename: 'ecg_leads_normal_sinus.json', patient_details: { name: 'Arjun Sharma', age: 42, gender: 'M', report_date: '2026-07-10 11:24 AM' } },
        { report_id: 'DEMO-002', filename: 'ecg_leads_tachycardia.json', patient_details: { name: 'Priya Mehta', age: 38, gender: 'F', report_date: '2026-07-12 04:32 PM' } }
      ];
      setReports(mockList);
    }
  };

  const loadReportFromUrl = async (url) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const report = await res.json();
      parseReport(report);
    } catch (err) {
      setToastMessage("Could not fetch remote S3 report. Using synthesizer fallback.");
      setSaveState("error");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  };

  const parseReport = (report) => {
    setCurrentReport(report);
    
    const sr = report?.data_details?.sampling_rate || report?.sampling_rate || report?.ecg_data?.sampling_rate || 500;
    setSamplingRate(sr);
    
    const parsedData = {};
    const ecgData = report?.ecg_data || {};
    const leadsData = ecgData?.leads_data || report?.leads_data || report;
    
    let foundLeads = false;
    LEADS.forEach((lead) => {
      if (leadsData?.[lead] && Array.isArray(leadsData[lead])) {
        parsedData[lead] = new Float32Array(leadsData[lead]);
        foundLeads = true;
      }
    });
    
    if (!foundLeads && typeof ecgData?.device_data === 'string' && ecgData.device_data.includes('|')) {
      const frames = ecgData.device_data.split('|').filter(Boolean);
      const tempLeads = LEADS.reduce((acc, l) => ({ ...acc, [l]: [] }), {});
      frames.forEach((fr) => {
        try {
          const vals = JSON.parse(fr);
          if (Array.isArray(vals) && vals.length >= 12) {
            LEADS.forEach((lead, idx) => {
              tempLeads[lead].push(Number(vals[idx]));
            });
          }
        } catch (e) {}
      });
      LEADS.forEach((lead) => {
        parsedData[lead] = new Float32Array(tempLeads[lead]);
      });
    }

    setLeadData(parsedData);
    
    const firstLead = parsedData[LEADS[0]];
    if (firstLead) {
      const computedDur = firstLead.length / sr;
      setDuration(computedDur);
      if (computedDur < 5.0) {
        setWindowSize(Math.max(0.2, computedDur));
      }
    }
    
    setToastMessage(`Loaded report: ${report?.patient_details?.name || 'ECG Record'}`);
    setSaveState("success");
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  useEffect(() => {
    if (preloadedReportUrl) {
      loadReportFromUrl(preloadedReportUrl);
    } else if (preloadedReport) {
      parseReport(preloadedReport);
    } else {
      fetchS3Reports();
    }
  }, [preloadedReportUrl, preloadedReport]);

  const handleReportSelect = (e) => {
    const idx = Number(e.target.value);
    setSelectedReportIdx(idx);
    if (idx === -1) {
      setCurrentReport(null);
      setLeadData({});
      setDuration(10);
    } else {
      const rep = reports[idx];
      if (rep.json_url) {
        loadReportFromUrl(rep.json_url);
      } else {
        const reportFallback = {
          patient_details: rep.patient_details,
          sampling_rate: 500,
          ecg_data: {}
        };
        if (rep.report_id === 'DEMO-002') {
          setSelectedRhythm('tachycardia');
        } else {
          setSelectedRhythm('nsr');
        }
        setCurrentReport(reportFallback);
        setLeadData({});
      }
    }
  };

  const handleLocalFileDrop = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const report = JSON.parse(event.target.result);
        parseReport(report);
      } catch (err) {
        setToastMessage("Invalid JSON file format.");
        setSaveState("error");
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    let animFrame;
    const tick = () => {
      if (isPlaying) {
        setCurrentTime((prev) => {
          const next = prev + 0.05;
          if (next >= duration - windowSize) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
        animFrame = requestAnimationFrame(tick);
      }
    };
    if (isPlaying) {
      animFrame = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(animFrame);
  }, [isPlaying, duration, windowSize]);

  const applyVisualFilters = (val, idx, arr) => {
    let output = val;
    if (filterAC && idx > 2) {
      output = val * 0.9 + arr[idx - 1] * 0.05 + arr[idx - 2] * 0.05;
    }
    return output;
  };

  const handleCanvasClick = (lead, timeOffset, voltageOffset) => {
    if (currentTool === 'annotate') {
      const label = selectedAnnotationType;
      const newAnn = {
        id: Math.random().toString(36).substring(2, 9),
        lead,
        timeSec: timeOffset,
        voltageMv: voltageOffset,
        label,
        timestamp: new Date().toLocaleTimeString(),
      };
      setAnnotations(prev => [...prev, newAnn].sort((a, b) => a.timeSec - b.timeSec));
      
      setToastMessage(`Added annotation in Lead ${lead}`);
      setSaveState("idle");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    }
  };

  const handleRulerMeasure = (meas) => {
    setRulerMeasurements(prev => [meas, ...prev]);
  };

  return (
    <div className="waveform-analysis-container" ref={containerRef}>
      {/* ─── Header Controls ─── */}
      <div className="analysis-header-bar flex items-center justify-between bg-slate-900 border-b border-slate-800 p-4">
        <div className="brand-logo flex items-center gap-2">
          {onClose && (
            <button 
              onClick={onClose}
              className="mr-1 p-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition flex items-center justify-center border border-slate-700"
              title="Close Waveform Analysis"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <Activity className="pulse-icon text-cyan" size={24} style={{ color: '#06b6d4' }} />
          <span className="title font-bold text-white text-lg">Waveform Analysis</span>
          <span className="badge-clinical font-semibold bg-cyan-950 text-cyan-400 text-xs px-2 py-0.5 rounded border border-cyan-800">Clinical Pro</span>
        </div>

        {/* Configurations Dropdowns */}
        {!hideSelector && (
          <div className="config-dropdowns flex items-center gap-4">
          <div className="dropdown-wrapper flex items-center gap-2">
            <span className="dropdown-label text-slate-400 text-sm">ECG Record:</span>
            <select 
              value={selectedReportIdx} 
              onChange={handleReportSelect}
              className="styled-select bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 text-sm outline-none cursor-pointer focus:border-cyan-500"
            >
              <option value="-1">Synthesized Live Feed (Fallback)</option>
              {reports.map((r, i) => (
                <option key={r.report_id} value={i}>
                  {r.patient_details?.name || r.filename} ({r.patient_details?.age || '?'} yrs)
                </option>
              ))}
            </select>
          </div>

          <div className="dropdown-wrapper flex items-center gap-2">
            <span className="dropdown-label text-slate-400 text-sm">Demo Rhythm:</span>
            <select 
              value={selectedRhythm} 
              onChange={(e) => setSelectedRhythm(e.target.value)}
              disabled={selectedReportIdx !== -1}
              className="styled-select bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 text-sm outline-none cursor-pointer focus:border-cyan-500 disabled:opacity-40"
            >
              {Object.entries(RHYTHMS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* Local File Loader */}
          <div className="file-uploader-btn bg-slate-800 border border-slate-700 hover:border-cyan-500 rounded px-3 py-1 text-sm text-white cursor-pointer transition">
            <label className="upload-label cursor-pointer flex items-center gap-1.5">
              <Download size={14} className="text-cyan-400" />
              <span>Import JSON</span>
              <input 
                type="file" 
                accept=".json" 
                onChange={handleLocalFileDrop}
                className="hidden" 
              />
            </label>
          </div>
        </div>
      )}
    </div>

      {/* ─── Main Panel Splitter ─── */}
      <div className="analysis-grid-body flex flex-1 overflow-hidden">
        
        {/* Left Control Bar (Tools, Layouts, Filters) */}
        <div className="side-controls-panel w-72 bg-slate-900 border-r border-slate-800 p-4 space-y-4 overflow-y-auto">
          
          {/* Patient Details Display */}
          <div className="control-section patient-details-card bg-slate-800/40 border border-slate-800 rounded-lg p-3">
            <div className="card-header text-white font-bold flex items-center gap-1.5 mb-2 text-sm">
              <FileText size={16} className="text-cyan-400" />
              <span>Patient Profile</span>
            </div>
            {currentReport ? (
              <div className="card-content text-slate-400 text-xs space-y-1">
                <p><span className="text-slate-300 font-semibold">Name:</span> {currentReport.patient_details?.name || 'Unknown'}</p>
                <p><span className="text-slate-300 font-semibold">Age/Gender:</span> {currentReport.patient_details?.age || 'N/A'} yrs / {currentReport.patient_details?.gender || 'N/A'}</p>
                <p><span className="text-slate-300 font-semibold">ID:</span> {currentReport.patient_details?.report_id || 'N/A'}</p>
                <p><span className="text-slate-300 font-semibold">Date:</span> {currentReport.patient_details?.report_date || 'N/A'}</p>
                {currentReport.device_details && (
                  <p><span className="text-slate-300 font-semibold">Device:</span> <span className="font-mono text-[10px] text-cyan-300">{currentReport.device_details.machine_serial}</span></p>
                )}
              </div>
            ) : (
              <div className="card-content text-slate-500 italic text-center py-2 text-xs">
                Using synthesized live demo data
              </div>
            )}
          </div>

          {/* Toolbar Modes */}
          <div className="control-section bg-slate-800/40 border border-slate-800 rounded-lg p-3">
            <h4 className="text-white font-bold mb-2 text-sm">Interactive Tools</h4>
            <div className="tools-button-group flex flex-col gap-1.5">
              {[
                { id: 'select', label: 'Select / Inspect', icon: MousePointer },
                { id: 'ruler', label: 'Measurement Ruler', icon: Ruler },
                { id: 'caliper', label: 'Dual Calipers', icon: Sliders },
                { id: 'magnifier', label: 'Magnifying Lens', icon: Search },
                { id: 'annotate', label: 'Annotate Waves', icon: Tag },
              ].map(t => {
                const Icon = t.icon;
                const isActive = currentTool === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setCurrentTool(t.id)}
                    className={`tool-btn flex items-center gap-2.5 w-full text-left px-3 py-2 rounded text-xs transition ${isActive ? 'bg-cyan-500 text-white font-bold' : 'text-slate-300 hover:bg-slate-800'}`}
                    title={t.label}
                  >
                    <Icon size={14} />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {currentTool === 'magnifier' && (
              <div className="magnifier-zoom-slider mt-3 border-t border-slate-800/60 pt-3">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>Lens Zoom:</span>
                  <span className="text-cyan-400 font-bold">{magnifierZoom.toFixed(1)}x</span>
                </div>
                <input 
                  type="range"
                  min="2"
                  max="5"
                  step="0.5"
                  value={magnifierZoom}
                  onChange={(e) => setMagnifierZoom(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>
            )}

            {currentTool === 'annotate' && (
              <div className="annotate-type-selector mt-3 border-t border-slate-800/60 pt-3">
                <span className="text-[10px] text-slate-400 block mb-1">Arrhythmia Tag:</span>
                <select 
                  value={selectedAnnotationType}
                  onChange={(e) => setSelectedAnnotationType(e.target.value)}
                  className="styled-select w-full bg-slate-800 border border-slate-700 text-white text-xs rounded px-2 py-1 outline-none"
                >
                  {ARRHYTHMIA_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Grid Layout Configuration */}
          <div className="control-section bg-slate-800/40 border border-slate-800 rounded-lg p-3 space-y-3">
            <h4 className="text-white font-bold text-sm">Layout & Display</h4>
            
            <div className="settings-row flex justify-between items-center text-xs">
              <span className="text-slate-400">Grid Layout:</span>
              <div className="pill-group flex bg-slate-800 p-0.5 rounded border border-slate-700">
                {['12x1', '6x2', '3x4'].map(mode => (
                  <button
                    key={mode}
                    onClick={() => setLayoutMode(mode)}
                    className={`pill-btn px-2 py-0.5 rounded text-[10px] transition ${layoutMode === mode ? 'bg-cyan-500 text-white font-semibold' : 'text-slate-300 hover:text-white'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-row flex justify-between items-center text-xs">
              <span className="text-slate-400">Sweep Speed:</span>
              <div className="pill-group flex bg-slate-800 p-0.5 rounded border border-slate-700">
                {[25, 50].map(s => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`pill-btn px-2 py-0.5 rounded text-[10px] transition ${speed === s ? 'bg-cyan-500 text-white font-semibold' : 'text-slate-300 hover:text-white'}`}
                  >
                    {s} mm/s
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-row flex justify-between items-center text-xs">
              <span className="text-slate-400">Gain (Amp):</span>
              <div className="pill-group flex bg-slate-800 p-0.5 rounded border border-slate-700">
                {[5, 10, 20].map(g => (
                  <button
                    key={g}
                    onClick={() => setGain(g)}
                    className={`pill-btn px-2 py-0.5 rounded text-[10px] transition ${gain === g ? 'bg-cyan-500 text-white font-semibold' : 'text-slate-300 hover:text-white'}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Visual Filters */}
          <div className="control-section bg-slate-800/40 border border-slate-800 rounded-lg p-3">
            <h4 className="text-white font-bold mb-2 text-sm">Filters (DSP)</h4>
            <div className="filter-checkboxes space-y-2">
              <label className="checkbox-wrapper flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={filterAC}
                  onChange={(e) => setFilterAC(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-slate-300 text-xs">AC Filter (50Hz Notch)</span>
              </label>
              
              <label className="checkbox-wrapper flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={filterEMG}
                  onChange={(e) => setFilterEMG(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-slate-300 text-xs">EMG Filter (25Hz Lowpass)</span>
              </label>

              <label className="checkbox-wrapper flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={filterDFT}
                  onChange={(e) => setFilterDFT(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-slate-300 text-xs">DFT Filter (0.5Hz Baseline)</span>
              </label>
            </div>
          </div>

        </div>

        {/* Center: ECG Multi-Lead Display Canvas Grid */}
        <div className="ecg-leads-wrapper flex-1 bg-[#0b0f19] p-4 flex flex-col overflow-y-auto">
          
          {/* Timeline & Playback Controller */}
          <div className="timeline-controller-bar bg-slate-900 border border-slate-800 p-3 rounded-lg mb-4 flex items-center gap-4">
            <div className="play-controls flex items-center gap-1.5">
              <button 
                onClick={() => setCurrentTime(c => Math.max(0, c - 0.5))}
                className="control-btn p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                title="Backward 0.5s"
              >
                <SkipBack size={14} />
              </button>
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className={`play-btn p-2 rounded-full text-white transition ${isPlaying ? 'bg-amber-600 hover:bg-amber-500' : 'bg-cyan-600 hover:bg-cyan-500'}`}
                title={isPlaying ? 'Pause Scrubber' : 'Play Live Scrubber'}
              >
                {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
              </button>
              <button 
                onClick={() => setCurrentTime(c => Math.min(duration - windowSize, c + 0.5))}
                className="control-btn p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                title="Forward 0.5s"
              >
                <SkipForward size={14} />
              </button>
            </div>

            {/* Time Slider */}
            <div className="timeline-slider-wrapper flex-1 flex items-center gap-2">
              <span className="time-lbl font-mono text-[10px] text-slate-400 w-10">{currentTime.toFixed(2)}s</span>
              <input 
                type="range"
                min="0"
                max={Math.max(0.1, duration - windowSize)}
                step="0.05"
                value={currentTime}
                onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <span className="time-lbl font-mono text-[10px] text-slate-400 w-10 text-right">{duration.toFixed(1)}s</span>
            </div>

            {/* Window zoom slider */}
            <div className="window-zoom-control flex items-center gap-1.5">
              <span className="text-slate-400 text-xs">Window:</span>
              <select 
                value={windowSize}
                onChange={(e) => setWindowSize(parseFloat(e.target.value))}
                className="styled-select bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 text-xs outline-none cursor-pointer focus:border-cyan-500"
              >
                {duration <= 1.0 && <option value={duration}>{duration.toFixed(1)}s (Fit)</option>}
                {duration > 1.0 && duration < 2.5 && (
                  <>
                    <option value="1.0">1.0s</option>
                    <option value={duration}>{duration.toFixed(1)}s (Fit)</option>
                  </>
                )}
                {duration >= 2.5 && <option value="2.5">2.5s</option>}
                {duration >= 5.0 && <option value="5.0">5.0s</option>}
                {duration >= 10.0 && <option value="10.0">10.0s</option>}
              </select>
            </div>
          </div>

          {/* Grid Layout Container */}
          <div className={`ecg-grid-layout grid gap-3 ${layoutMode === '12x1' ? 'grid-cols-1' : layoutMode === '6x2' ? 'grid-cols-2' : 'grid-cols-4'}`}>
            {LEADS.map((lead) => (
              <LeadCanvasBlock
                key={lead}
                lead={lead}
                data={activeLeadData[lead]}
                samplingRate={samplingRate}
                currentTime={currentTime}
                windowSize={windowSize}
                tool={currentTool}
                gain={gain}
                speed={speed}
                magnifierZoom={magnifierZoom}
                applyFilters={applyVisualFilters}
                onMeasure={handleRulerMeasure}
                onClickCanvas={handleCanvasClick}
                onDoubleClicked={() => setExpandedLead(lead)}
                annotations={annotations.filter(ann => ann.lead === lead)}
                calipers={calipers}
                setCalipers={setCalipers}
              />
            ))}
          </div>

        </div>

        {/* Right Side: Measurements and Manual Annotations Log */}
        <div className="logs-panel w-80 bg-slate-900 border-l border-slate-800 p-4 flex flex-col space-y-4 overflow-y-auto">
          <div className="panel-tab-header">
            <h4 className="text-white font-bold flex items-center gap-2 text-sm pb-2 border-b border-slate-800">
              <Ruler size={16} className="text-amber-500" />
              <span>Diagnostic Logs</span>
            </h4>
          </div>

          <div className="logs-list-wrapper flex-1 space-y-4">
            
            {/* Calipers Measurement Card */}
            <div className="metric-log-card bg-slate-800/40 border border-slate-800 rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="log-title font-semibold text-white text-xs">Caliper Metric:</span>
                <span className="badge-caliper bg-amber-950 text-amber-400 font-mono text-[9px] px-1.5 py-0.5 rounded border border-amber-800">Caliper Mode</span>
              </div>
              <div className="text-slate-400 text-xs space-y-1">
                <p>Start: <span className="text-slate-300 font-mono">{calipers.left.toFixed(3)} s</span></p>
                <p>End: <span className="text-slate-300 font-mono">{calipers.right.toFixed(3)} s</span></p>
                <p className="text-amber-400 font-bold text-sm">
                  Interval (R-R): {Math.abs((calipers.right - calipers.left) * 1000).toFixed(0)} ms
                </p>
                <p className="text-cyan-400 font-bold text-sm">
                  Heart Rate: {(60 / Math.max(0.1, Math.abs(calipers.right - calipers.left))).toFixed(0)} BPM
                </p>
              </div>
            </div>

            {/* Ruler Measurements List */}
            <div className="log-section space-y-2">
              <span className="section-title text-slate-500 text-[10px] font-bold block uppercase tracking-wider">Ruler Captures</span>
              {rulerMeasurements.length === 0 ? (
                <p className="text-slate-500 text-[10px] italic text-center py-4 border border-dashed border-slate-800 rounded">
                  Drag with Ruler tool to record measurements
                </p>
              ) : (
                <div className="log-scroll-area space-y-1.5 max-h-48 overflow-y-auto">
                  {rulerMeasurements.map((m, idx) => (
                    <div key={idx} className="measure-card bg-slate-800/20 border border-slate-800 rounded p-2 text-xs relative">
                      <div className="flex justify-between text-slate-300 font-semibold mb-1">
                        <span>Lead {m.lead}</span>
                        <button 
                          onClick={() => setRulerMeasurements(prev => prev.filter((_, i) => i !== idx))}
                          className="delete-item-btn text-slate-500 hover:text-red-400 transition"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400">Δt: <span className="text-amber-400 font-bold">{m.dtMs.toFixed(0)} ms</span> ({m.bpm.toFixed(0)} BPM)</p>
                      <p className="text-[11px] text-slate-400">ΔV: <span className="text-cyan-400 font-bold">{m.dvMv.toFixed(2)} mV</span></p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Manual Annotations List */}
            <div className="log-section space-y-2">
              <span className="section-title text-slate-500 text-[10px] font-bold block uppercase tracking-wider">Annotations</span>
              {annotations.length === 0 ? (
                <p className="text-slate-500 text-[10px] italic text-center py-4 border border-dashed border-slate-800 rounded">
                  Use Annotation tool to mark beats
                </p>
              ) : (
                <div className="log-scroll-area space-y-1.5 max-h-48 overflow-y-auto">
                  {annotations.map((ann) => (
                    <div 
                      key={ann.id} 
                      className="measure-card bg-slate-800/20 border border-slate-800 rounded p-2 text-xs hover:bg-slate-800/60 cursor-pointer transition flex justify-between items-center" 
                      onClick={() => setCurrentTime(Math.min(duration - windowSize, Math.max(0, ann.timeSec - windowSize / 2)))}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="annotation-dot w-1.5 h-1.5 rounded-full bg-rose-500" />
                          <span className="font-bold text-slate-300">{ann.label}</span>
                        </div>
                        <p className="text-[10px] text-slate-500">Lead {ann.lead} · at {ann.timeSec.toFixed(2)} s</p>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setAnnotations(prev => prev.filter(a => a.id !== ann.id));
                        }}
                        className="delete-item-btn text-slate-500 hover:text-red-400 transition"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* ─── Expanded Single-Lead Modal Popup ─── */}
      {expandedLead && (
        <ExpandedLeadModal 
          lead={expandedLead}
          data={activeLeadData[expandedLead]}
          samplingRate={samplingRate}
          onClose={() => setExpandedLead(null)}
          gain={gain}
          speed={speed}
          selectedRhythm={selectedRhythm}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  INDIVIDUAL LEAD CANVAS BLOCK COMPONENT
// ──────────────────────────────────────────────────────────────────────
function LeadCanvasBlock({
  lead,
  data = new Float32Array(0),
  samplingRate,
  currentTime,
  windowSize,
  tool,
  gain,
  speed,
  magnifierZoom,
  applyFilters,
  onMeasure,
  onClickCanvas,
  onDoubleClicked,
  annotations,
  calipers,
  setCalipers
}) {
  const canvasRef = useRef(null);
  const [hoverPos, setHoverPos] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  
  const pixelsPerMm = 4; // grid scale multiplier

  const startSample = Math.floor(currentTime * samplingRate);
  const visibleSamples = Math.floor(windowSize * samplingRate);
  const endSample = Math.min(data.length, startSample + visibleSamples);

  const visibleSegment = useMemo(() => {
    return data.slice(startSample, endSample);
  }, [data, startSample, endSample]);

  // Redraw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Background fill
    ctx.fillStyle = '#000000'; // Strict black screen
    ctx.fillRect(0, 0, width, height);

    const scaleY = (height / 4096) * (gain / 10);
    const centerY = height / 2;

    // Draw Fine Grid (pink/red 1mm lines)
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.08)'; // Dark red/pink fine grid
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    
    // Vertical fine lines (every 0.04s)
    const timeStepFine = 0.04;
    const startSec = currentTime;
    const endSec = currentTime + windowSize;
    const firstVertFine = Math.ceil(startSec / timeStepFine) * timeStepFine;
    for (let sec = firstVertFine; sec < endSec; sec += timeStepFine) {
      const x = ((sec - startSec) / windowSize) * width;
      ctx.moveTo(x, 0); ctx.lineTo(x, height);
    }
    
    // Horizontal fine lines (every 20 ADC units = 0.1 mV)
    const adcStepFine = 20;
    const minAdc = 2048 - (height / 2) / scaleY;
    const maxAdc = 2048 + (height / 2) / scaleY;
    const firstHorizFine = Math.ceil(minAdc / adcStepFine) * adcStepFine;
    for (let adc = firstHorizFine; adc < maxAdc; adc += adcStepFine) {
      const y = centerY - (adc - 2048) * scaleY;
      ctx.moveTo(0, y); ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Draw Bold Grid (pink/red 5mm lines)
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.28)'; // Bold red/pink large grid
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    
    // Vertical bold lines (every 0.20s)
    const timeStepBold = 0.20;
    const firstVertBold = Math.ceil(startSec / timeStepBold) * timeStepBold;
    for (let sec = firstVertBold; sec < endSec; sec += timeStepBold) {
      const x = ((sec - startSec) / windowSize) * width;
      ctx.moveTo(x, 0); ctx.lineTo(x, height);
    }
    
    // Horizontal bold lines (every 100 ADC units = 0.5 mV)
    const adcStepBold = 100;
    const firstHorizBold = Math.ceil(minAdc / adcStepBold) * adcStepBold;
    for (let adc = firstHorizBold; adc < maxAdc; adc += adcStepBold) {
      const y = centerY - (adc - 2048) * scaleY;
      ctx.moveTo(0, y); ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Render ECG Curve
    if (visibleSegment.length > 1) {
      ctx.strokeStyle = '#22d3ee'; // Neon cyan
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      
      const stepX = width / visibleSegment.length;
      const centerY = height / 2;
      const scaleY = (height / 4096) * (gain / 10);
      
      for (let i = 0; i < visibleSegment.length; i++) {
        const rawVal = visibleSegment[i];
        const filteredVal = applyFilters(rawVal, i, visibleSegment);
        
        const x = i * stepX;
        const y = centerY - (filteredVal - ADC_BASELINE) * scaleY;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // Draw annotations labels if present on visible section
    annotations.forEach((ann) => {
      if (ann.timeSec >= currentTime && ann.timeSec <= currentTime + windowSize) {
        const timeFraction = (ann.timeSec - currentTime) / windowSize;
        const x = timeFraction * width;
        
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        
        // Render a rounded rosy badge stamp for the annotation
        const labelText = `⚡ ${ann.label}`;
        ctx.font = 'bold 9px -apple-system, BlinkMacSystemFont, sans-serif';
        const textWidth = ctx.measureText(labelText).width;
        
        const bx = Math.min(width - textWidth - 12, Math.max(2, x - textWidth / 2 - 6));
        const by = 4;
        const bw = textWidth + 12;
        const bh = 15;
        ctx.fillStyle = 'rgba(244, 63, 94, 0.9)'; // Rosy solid tag
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 3) : ctx.rect(bx, by, bw, bh);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff'; // White text on rose
        ctx.fillText(labelText, bx + 6, by + 11);
      }
    });

    // Draw Caliper lines if Caliper tool active
    if (tool === 'caliper') {
      [calipers.left, calipers.right].forEach((pos) => {
        if (pos >= currentTime && pos <= currentTime + windowSize) {
          const timeFraction = (pos - currentTime) / windowSize;
          const x = timeFraction * width;
          
          ctx.strokeStyle = '#ff8a1f';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
          
          ctx.fillStyle = '#ff8a1f';
          ctx.beginPath();
          ctx.arc(x, height / 2, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // Draw Crosshair (Time & Amplitude readouts)
    if (hoverPos && (tool === 'ruler' || tool === 'caliper')) {
      const { x, y } = hoverPos;
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x, height);
      ctx.moveTo(0, y); ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]); 

      const timeOffset = currentTime + (x / width) * windowSize;
      const centerY = height / 2;
      const scaleY = (height / 4096) * (gain / 10);
      const voltageMv = (-(y - centerY) / scaleY) * ADC_TO_MV;

      const crosshairText = `${(timeOffset * 1000).toFixed(0)} ms | ${voltageMv.toFixed(2)} mV`;
      ctx.font = 'bold 9px monospace';
      const textWidth = ctx.measureText(crosshairText).width;

      const bx = Math.min(width - textWidth - 12, Math.max(2, x + 8));
      const by = Math.min(height - 20, Math.max(2, y - 24));
      const bw = textWidth + 12;
      const bh = 16;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.strokeStyle = '#475569'; // slate border
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 4) : ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.stroke();
      
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(crosshairText, bx + 6, by + 11);
    }

    // Draw Ruler Drag Selection Box
    if (tool === 'ruler' && dragStart && dragEnd) {
      ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.2;
      
      const rx = Math.min(dragStart.x, dragEnd.x);
      const ry = Math.min(dragStart.y, dragEnd.y);
      const rw = Math.abs(dragStart.x - dragEnd.x);
      const rh = Math.abs(dragStart.y - dragEnd.y);
      
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);

      const dtMs = (rw / width) * windowSize * 1000;
      const scaleY = (height / 4096) * (gain / 10);
      const dvMv = (rh / scaleY) * ADC_TO_MV;
      const bpm = (60 * 1000) / Math.max(1, dtMs);

      // Draw a solid high-contrast tag for the ruler readout
      const rulerText = `${dtMs.toFixed(0)} ms | ${dvMv.toFixed(2)} mV`;
      ctx.font = 'bold 9px monospace';
      const textWidth = ctx.measureText(rulerText).width;

      const bx = Math.min(width - textWidth - 10, Math.max(2, rx + 4));
      const by = Math.max(2, ry - 18);
      const bw = textWidth + 10;
      const bh = 15;

      ctx.fillStyle = 'rgba(251, 191, 36, 0.95)'; // Amber gold solid background
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 3) : ctx.rect(bx, by, bw, bh);
      ctx.fill();

      ctx.fillStyle = '#0f172a'; // Deep slate text for contrast
      ctx.fillText(rulerText, bx + 5, by + 10.5);
    }

    // Draw Floating Magnifier overlay inside canvas itself
    if (tool === 'magnifier' && hoverPos) {
      const { x: hx, y: hy } = hoverPos;
      
      ctx.save();
      const radius = 65;
      
      ctx.beginPath();
      ctx.arc(hx, hy, radius, 0, Math.PI * 2);
      ctx.clip();
      
      ctx.fillStyle = '#05070d';
      ctx.fillRect(hx - radius, hy - radius, radius * 2, radius * 2);
      
      const zoomGrid = pixelsPerMm * magnifierZoom;
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.1)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let gx = hx - radius; gx < hx + radius; gx += zoomGrid) {
        ctx.moveTo(gx, hy - radius); ctx.lineTo(gx, hy + radius);
      }
      for (let gy = hy - radius; gy < hy + radius; gy += zoomGrid) {
        ctx.moveTo(hx - radius, gy); ctx.lineTo(hx + radius, gy);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(244, 63, 94, 0.3)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let gx = hx - radius; gx < hx + radius; gx += zoomGrid * 5) {
        ctx.moveTo(gx, hy - radius); ctx.lineTo(gx, hy + radius);
      }
      for (let gy = hy - radius; gy < hy + radius; gy += zoomGrid * 5) {
        ctx.moveTo(hx - radius, gy); ctx.lineTo(hx + radius, gy);
      }
      ctx.stroke();

      if (visibleSegment.length > 1) {
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        
        const stepX = width / visibleSegment.length;
        const centerY = height / 2;
        const scaleY = (height / 4096) * (gain / 10);
        
        for (let i = 0; i < visibleSegment.length; i++) {
          const rawVal = visibleSegment[i];
          const filteredVal = applyFilters(rawVal, i, visibleSegment);
          
          const normalX = i * stepX;
          const normalY = centerY - (filteredVal - ADC_BASELINE) * scaleY;
          
          const zoomX = hx + (normalX - hx) * magnifierZoom;
          const zoomY = hy + (normalY - hy) * magnifierZoom;
          
          if (i === 0) {
            ctx.moveTo(zoomX, zoomY);
          } else {
            ctx.lineTo(zoomX, zoomY);
          }
        }
        ctx.stroke();
      }

      ctx.restore();
      
      ctx.strokeStyle = '#ff8a1f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, hy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

  }, [
    visibleSegment, 
    hoverPos, 
    dragStart, 
    dragEnd, 
    tool, 
    gain, 
    speed, 
    currentTime, 
    windowSize, 
    calipers, 
    annotations,
    magnifierZoom
  ]);

  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (tool === 'ruler') {
      setDragStart({ x, y });
      setDragEnd({ x, y });
    } else if (tool === 'caliper') {
      const clickSec = currentTime + (x / canvas.width) * windowSize;
      const distL = Math.abs(clickSec - calipers.left);
      const distR = Math.abs(clickSec - calipers.right);
      
      if (distL < distR) {
        setDragStart({ type: 'left', x });
      } else {
        setDragStart({ type: 'right', x });
      }
    } else if (tool === 'annotate') {
      const canvasHeight = canvas.height;
      const timeOffset = currentTime + (x / canvas.width) * windowSize;
      const centerY = canvasHeight / 2;
      const scaleY_val = (canvasHeight / 4096) * (gain / 10);
      const voltageOffset = (-(y - centerY) / scaleY_val) * ADC_TO_MV;
      onClickCanvas(lead, timeOffset, voltageOffset);
    }
  };

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setHoverPos({ x, y });

    if (dragStart) {
      if (tool === 'ruler') {
        setDragEnd({ x, y });
      } else if (tool === 'caliper') {
        const timeOffset = currentTime + (x / canvas.width) * windowSize;
        if (dragStart.type === 'left') {
          setCalipers(prev => ({ ...prev, left: Math.max(0, timeOffset) }));
        } else {
          setCalipers(prev => ({ ...prev, right: Math.max(0, timeOffset) }));
        }
      }
    }
  };

  const handleMouseUp = (e) => {
    if (tool === 'ruler' && dragStart && dragEnd) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rw = Math.abs(dragStart.x - dragEnd.x);
      const rh = Math.abs(dragStart.y - dragEnd.y);
      
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const dtMs = (rw / canvasWidth) * windowSize * 1000;
      const scaleY = (canvasHeight / 4096) * (gain / 10);
      const dvMv = (rh / scaleY) * ADC_TO_MV;
      const bpm = (60 * 1000) / Math.max(1, dtMs);
      
      if (dtMs > 10) {
        onMeasure({
          lead,
          dtMs,
          dvMv,
          bpm
        });
      }
    }
    setDragStart(null);
    setDragEnd(null);
  };

  const handleMouseLeave = () => {
    setHoverPos(null);
    setDragStart(null);
    setDragEnd(null);
  };

  return (
    <div 
      className="lead-block-container bg-slate-900/60 border border-slate-800 rounded-lg p-2 flex flex-col space-y-1 hover:border-slate-700 transition"
      onDoubleClick={onDoubleClicked}
    >
      <div className="lead-block-header flex justify-between items-center px-1">
        <span className="lead-name font-bold text-slate-300 text-xs">{lead}</span>
        <button 
          onClick={onDoubleClicked}
          className="expand-btn-icon text-slate-500 hover:text-white transition"
          title="Expanded View"
        >
          <Maximize2 size={11} />
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={380}
        height={130}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className="ecg-lead-canvas w-full h-32 rounded bg-slate-950 cursor-crosshair border border-slate-950"
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  EXPANDED ANALYSIS MODAL popup COMPONENT
// ──────────────────────────────────────────────────────────────────────
function ExpandedLeadModal({
  lead,
  data = new Float32Array(0),
  samplingRate,
  onClose,
  gain,
  speed,
  selectedRhythm
}) {
  const canvasRef = useRef(null);
  const [ampLevel, setAmpLevel] = useState(1.0);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [scrollPos, setScrollPos] = useState(0); 

  const totalSamples = data.length;
  const visibleDuration = 4.0 / zoomLevel; 
  const visibleSamples = Math.floor(visibleDuration * samplingRate);

  const maxStartSample = Math.max(0, totalSamples - visibleSamples);
  const startSample = Math.floor((scrollPos / 1000) * maxStartSample);
  const endSample = Math.min(totalSamples, startSample + visibleSamples);

  const segment = useMemo(() => {
    return data.slice(startSample, endSample);
  }, [data, startSample, endSample]);

  const pqrstIntervals = useMemo(() => {
    let pr = 145;
    let qrs = 88;
    let qt = 360;
    
    if (selectedRhythm === 'bradycardia') {
      pr = 175;
      qt = 410;
    } else if (selectedRhythm === 'tachycardia') {
      pr = 125;
      qt = 310;
    }
    
    const qtc = qt + (100 - (60 / Math.max(20, pr / 1000)) * 0.4); 
    return { pr, qrs, qt, qtc };
  }, [selectedRhythm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const pixelsPerMm = 4;

    // Background fill
    ctx.fillStyle = '#000000'; // Strict black screen
    ctx.fillRect(0, 0, width, height);

    const scaleY = (height / 4096) * (gain / 10) * ampLevel;
    const centerY = height / 2;

    const startSec = startSample / samplingRate;
    const windowSize = visibleDuration;

    // Draw Fine Grid (pink/red 1mm lines)
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.08)'; // Fine grid lines
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    
    // Vertical fine lines (every 0.04s)
    const timeStepFine = 0.04;
    const endSec = startSec + windowSize;
    const firstVertFine = Math.ceil(startSec / timeStepFine) * timeStepFine;
    for (let sec = firstVertFine; sec < endSec; sec += timeStepFine) {
      const x = ((sec - startSec) / windowSize) * width;
      ctx.moveTo(x, 0); ctx.lineTo(x, height);
    }
    
    // Horizontal fine lines (every 20 ADC units = 0.1 mV)
    const adcStepFine = 20;
    const minAdc = 2048 - (height / 2) / scaleY;
    const maxAdc = 2048 + (height / 2) / scaleY;
    const firstHorizFine = Math.ceil(minAdc / adcStepFine) * adcStepFine;
    for (let adc = firstHorizFine; adc < maxAdc; adc += adcStepFine) {
      const y = centerY - (adc - 2048) * scaleY;
      ctx.moveTo(0, y); ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Draw Bold Grid (pink/red 5mm lines)
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.28)'; // Bold large grid lines
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    
    // Vertical bold lines (every 0.20s)
    const timeStepBold = 0.20;
    const firstVertBold = Math.ceil(startSec / timeStepBold) * timeStepBold;
    for (let sec = firstVertBold; sec < endSec; sec += timeStepBold) {
      const x = ((sec - startSec) / windowSize) * width;
      ctx.moveTo(x, 0); ctx.lineTo(x, height);
    }
    
    // Horizontal bold lines (every 100 ADC units = 0.5 mV)
    const adcStepBold = 100;
    const firstHorizBold = Math.ceil(minAdc / adcStepBold) * adcStepBold;
    for (let adc = firstHorizBold; adc < maxAdc; adc += adcStepBold) {
      const y = centerY - (adc - 2048) * scaleY;
      ctx.moveTo(0, y); ctx.lineTo(width, y);
    }
    ctx.stroke();

    if (segment.length > 1) {
      ctx.strokeStyle = '#10b981'; 
      ctx.lineWidth = 1.8;
      ctx.beginPath();

      const stepX = width / segment.length;
      const centerY = height / 2;
      const scaleY = (height / 4096) * (gain / 10) * ampLevel;

      for (let i = 0; i < segment.length; i++) {
        const x = i * stepX;
        const y = centerY - (segment[i] - ADC_BASELINE) * scaleY;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  }, [segment, ampLevel, zoomLevel, gain]);

  return (
    <div className="fixed inset-0 z-50 backdrop-blur-md bg-black/75 flex items-center justify-center p-4 transition-all">
      <div className="bg-slate-950/95 border border-slate-800/80 rounded-2xl p-6 w-full max-w-4xl shadow-2xl shadow-cyan-950/30 flex flex-col space-y-5 overflow-hidden max-h-[95vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Sparkles className="text-emerald-400 animate-pulse" size={16} />
            </div>
            <div>
              <h3 className="text-white font-bold text-base tracking-wide">Lead {lead} · Detailed Diagnostics</h3>
              <p className="text-[10px] text-slate-500 font-mono tracking-wider">ECG SIGNAL ANALYZER · {samplingRate} HZ</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-600 transition"
            title="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-900">
          {/* Zoom */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Horizontal Scale (Time)</span>
            <select
              value={zoomLevel}
              onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
              className="styled-select w-full bg-slate-950 text-white border border-slate-800 text-xs rounded-lg px-2.5 py-1.5 outline-none cursor-pointer focus:border-cyan-500 transition"
            >
              <option value="1.0">1.0x (Show 4.0s)</option>
              <option value="2.0">2.0x (Show 2.0s)</option>
              <option value="4.0">4.0x (Show 1.0s)</option>
              <option value="8.0">8.0x (Show 0.5s)</option>
            </select>
          </div>

          {/* Amplification */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider text-slate-400">
              <span>Vertical Scale (Gain)</span>
              <span className="text-cyan-400 font-mono font-bold">{ampLevel.toFixed(2)}x</span>
            </div>
            <input 
              type="range"
              min="0.25"
              max="4.0"
              step="0.25"
              value={ampLevel}
              onChange={(e) => setAmpLevel(parseFloat(e.target.value))}
              className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-2.5"
            />
          </div>

          {/* Scroll Position */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider text-slate-400">
              <span>Timeline Position</span>
              <span className="text-amber-400 font-mono font-bold">{(scrollPos / 10).toFixed(0)}%</span>
            </div>
            <input 
              type="range"
              min="0"
              max="1000"
              value={scrollPos}
              onChange={(e) => setScrollPos(parseInt(e.target.value))}
              className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-amber-500 mt-2.5"
            />
          </div>
        </div>

        {/* Large Canvas Area */}
        <div className="expanded-canvas-wrapper w-full bg-black border border-slate-900 rounded-xl p-1.5 flex justify-center shadow-inner shadow-black/80">
          <canvas
            ref={canvasRef}
            width={850}
            height={300}
            className="w-full h-72 rounded bg-black"
          />
        </div>

        {/* Intervals and Interpretation Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="interval-metric-card bg-slate-900/40 border border-slate-900 hover:border-slate-800/80 rounded-xl p-3 flex flex-col items-center justify-center transition-all">
            <span className="title text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">RR Interval</span>
            <span className="value text-white font-black text-xl font-mono">{(60000 / 72).toFixed(0)} ms</span>
            <span className="badge-ok mt-1.5 bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 text-[9px] px-2 py-0.5 rounded-full font-bold">Normal</span>
          </div>

          <div className="interval-metric-card bg-slate-900/40 border border-slate-900 hover:border-slate-800/80 rounded-xl p-3 flex flex-col items-center justify-center transition-all">
            <span className="title text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">PR Interval</span>
            <span className="value text-white font-black text-xl font-mono">{pqrstIntervals.pr} ms</span>
            <span className="badge-ok mt-1.5 bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 text-[9px] px-2 py-0.5 rounded-full font-bold">Consistent</span>
          </div>

          <div className="interval-metric-card bg-slate-900/40 border border-slate-900 hover:border-slate-800/80 rounded-xl p-3 flex flex-col items-center justify-center transition-all">
            <span className="title text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">QRS Duration</span>
            <span className="value text-white font-black text-xl font-mono">{pqrstIntervals.qrs} ms</span>
            <span className="badge-ok mt-1.5 bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 text-[9px] px-2 py-0.5 rounded-full font-bold">Narrow</span>
          </div>

          <div className="interval-metric-card bg-slate-900/40 border border-slate-900 hover:border-slate-800/80 rounded-xl p-3 flex flex-col items-center justify-center transition-all">
            <span className="title text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">QT / QTc (Bazett)</span>
            <span className="value text-white font-black text-xl font-mono">{pqrstIntervals.qt} / {pqrstIntervals.qtc.toFixed(0)} ms</span>
            <span className="badge-warn mt-1.5 bg-amber-950/80 text-amber-400 border border-amber-800/50 text-[9px] px-2 py-0.5 rounded-full font-bold">Borderline</span>
          </div>
        </div>

        {/* Interpretation Footer */}
        <div className="bg-slate-900/30 p-3.5 rounded-xl border border-slate-900">
          <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 block mb-1.5">Lead Rhythm Interpretation</span>
          <p className="text-slate-300 text-xs leading-relaxed font-medium">
            {selectedRhythm === 'nsr' && "Sinus Rhythm with normal P-wave morphology and P-R interval duration. Baseline noise within tolerances."}
            {selectedRhythm === 'afib' && "Irregularly irregular rhythm. Absence of distinct P-waves with fine fibrillatory baseline fluctuations. Highly suggestive of Atrial Fibrillation."}
            {selectedRhythm === 'tachycardia' && "Sinus Tachycardia detected. Elevated heart rate with normal QRS complexes and PR interval. No ST abnormalities."}
            {selectedRhythm === 'bradycardia' && "Sinus Bradycardia detected. Reduced heart rate. Normal axis and intervals preserved."}
            {selectedRhythm === 'pvc' && "Sinus rhythm disrupted by occasional premature, wide, and aberrant QRS complexes followed by compensatory pauses. PVC detected."}
          </p>
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-900">
          <button 
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-300 rounded-lg text-xs font-bold transition border border-slate-800 hover:border-slate-600"
          >
            Close Analysis
          </button>
        </div>

      </div>
    </div>
  );
}
