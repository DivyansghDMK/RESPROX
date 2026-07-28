import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { TherapyProvider, useTherapy } from './context/TherapyContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Toast from './components/Toast';
import BottomNavbar from './components/BottomNavbar';
import Lenis from 'lenis';
import gsap from 'gsap';

// Pages
import Dashboard from './pages/Dashboard';
import Therapy from './pages/Therapy';
import Trends from './pages/Trends';
import Reports from './pages/Reports';
import Devices from './pages/Devices';
import MaskFit from './pages/MaskFit';
import Settings from './pages/Settings';
import HelpSupport from './pages/HelpSupport';
import Login from './features/auth/LoginPage';
import ForgotPassword from './features/auth/ForgotPasswordPage';

import AdminPatients from './pages/AdminPatients';
import AdminPatientDetail from './pages/AdminPatientDetail';
import DeviceList from './pages/DeviceList';
import DeviceDashboard from './pages/DeviceDashboard';
import { useDeviceSettings } from './hooks/useDeviceSettings';
import { AuthProvider } from './context/AuthContext';
import HCPPortal from './features/hcp/HCPPortal';
import WaveformAnalysis from './pages/WaveformAnalysis';
import CreateOrg from './pages/CreateOrg';

function AppContent() {
  // useDeviceSettings();
  const location = useLocation();
  const { adminActiveSerial } = useTherapy();
  const activeSerial = adminActiveSerial || localStorage.getItem('adminActiveSerial') || 'CVT3000001';
  const isAuthPage = location.pathname === '/login' || location.pathname === '/forgot-password' || location.pathname === '/';

  useEffect(() => {
    // Initialize Lenis smooth scroll
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);

  useEffect(() => {
    if (!isAuthPage) {
      // Clean GSAP transitions on page changes
      gsap.fromTo('.content',
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
      );
    }
  }, [location.pathname, isAuthPage]);

  if (isAuthPage) {
    return (
      <div className="auth-shell">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <Toast />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content">
        <Header />
        
        <Routes>
          <Route path="/dashboard" element={<Navigate to={`/device/${activeSerial}`} replace />} /> {/* Admin: redirect to device dashboard */}
          <Route path="/therapy" element={<Therapy />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/devices" element={<DeviceList />} /> {/* Admin devices page */}
          <Route path="/device/:serial" element={<DeviceDashboard />} />
          <Route path="/device-info" element={<Devices />} /> {/* Patient device page */}
          <Route path="/mask-fit" element={<MaskFit />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/help" element={<HelpSupport />} />
          <Route path="/admin" element={<AdminPatients />} />
          <Route path="/admin/patient/:id" element={<AdminPatientDetail />} />
          <Route path="/waveform-analysis" element={<WaveformAnalysis />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </main>

      <Toast />
      <BottomNavbar />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <TherapyProvider>
        <Router>
          <Routes>
            {/* HCP Clinician Portal — fully self-contained, bypasses main app shell */}
            <Route path="/hcp/*" element={<HCPPortal />} />
            {/* Standalone Organization Onboarding */}
            <Route path="/createorg" element={<CreateOrg />} />
            {/* Patient / Admin portal — main app shell */}
            <Route path="/*" element={<AppContent />} />
          </Routes>
        </Router>
      </TherapyProvider>
    </AuthProvider>
  );
}
