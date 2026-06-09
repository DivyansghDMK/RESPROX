import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { TherapyProvider } from './context/TherapyContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Toast from './components/Toast';

// Pages
import Dashboard from './pages/Dashboard';
import Therapy from './pages/Therapy';
import Trends from './pages/Trends';
import Reports from './pages/Reports';
import Devices from './pages/Devices';
import MaskFit from './pages/MaskFit';
import Settings from './pages/Settings';
import HelpSupport from './pages/HelpSupport';

function AppContent() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content">
        <Header />
        
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/therapy" element={<Therapy />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/mask-fit" element={<MaskFit />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/help" element={<HelpSupport />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>

      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <TherapyProvider>
      <Router>
        <AppContent />
      </Router>
    </TherapyProvider>
  );
}
