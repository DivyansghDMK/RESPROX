import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { TherapyProvider, useTherapy } from './context/TherapyContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Toast from './components/Toast';
import BottomNavbar from './components/BottomNavbar';

// Pages
import Dashboard from './pages/Dashboard';
import Therapy from './pages/Therapy';
import Trends from './pages/Trends';
import Reports from './pages/Reports';
import Devices from './pages/Devices';
import MaskFit from './pages/MaskFit';
import Settings from './pages/Settings';
import HelpSupport from './pages/HelpSupport';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';

import AdminPatients from './pages/AdminPatients';
import AdminPatientDetail from './pages/AdminPatientDetail';
import DeviceList from './pages/DeviceList';
import DeviceDashboard from './pages/DeviceDashboard';
import { useDeviceSettings } from './hooks/useDeviceSettings';
import { AuthProvider } from './context/AuthContext';
import HCPPortal from './pages/hcp/HCPPortal';

function AppContent() {
  useDeviceSettings();
  const location = useLocation();
  const { adminActiveSerial } = useTherapy();
  const activeSerial = adminActiveSerial || localStorage.getItem('adminActiveSerial') || 'CVT30-C-9281';
  const isAuthPage = location.pathname === '/login' || location.pathname === '/forgot-password' || location.pathname === '/';

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
            {/* Patient / Admin portal — main app shell */}
            <Route path="/*" element={<AppContent />} />
          </Routes>
        </Router>
      </TherapyProvider>
    </AuthProvider>
  );
}
