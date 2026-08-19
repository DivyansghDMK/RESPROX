import React, { useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { TherapyProvider, useTherapy } from './context/TherapyContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Toast from './components/Toast';
import BottomNavbar from './components/BottomNavbar';
import RouteFallback from './components/RouteFallback';
import { AuthProvider } from './context/AuthContext';
import { NotifyProvider } from './context/NotifyContext';

// Login is the entry point for every session, so it stays in the main chunk —
// lazy-loading it would only add a round-trip before the first paint.
import Login from './features/auth/LoginPage';

// Everything else is a separate chunk, warmed on hover and when idle.
import {
  prefetch,
  prefetchWhenIdle,
  routeKeyForPath,
  DeviceDashboard,
  DeviceList,
  Therapy,
  Trends,
  Reports,
  Devices,
  MaskFit,
  Settings,
  AppPreferences,
  HelpSupport,
  AdminPatients,
  AdminPatientDetail,
  AdminDataUpload,
  WaveformAnalysis,
  HCPPortal,
  CreateOrg,
  ForgotPassword,
} from './routes';

function AppContent() {
  const location = useLocation();
  const { adminActiveSerial } = useTherapy();
  const activeSerial = adminActiveSerial || localStorage.getItem('adminActiveSerial') || 'CVT3000001';
  const isAuthPage = location.pathname === '/login' || location.pathname === '/forgot-password' || location.pathname === '/';

  useEffect(() => {
    if (isAuthPage) return;
    let cancelled = false;
    let lenis;
    let frame;

    // gsap + lenis are ~90 kB that nothing needs before first paint, so they
    // load after the shell is interactive instead of blocking it.
    import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;
      lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });
      // The rAF loop must be cancellable, otherwise StrictMode's double-mount
      // and every HMR update leave a loop running forever against a destroyed
      // instance, permanently taxing the main thread.
      const raf = (time) => {
        lenis.raf(time);
        frame = requestAnimationFrame(raf);
      };
      frame = requestAnimationFrame(raf);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      lenis?.destroy();
    };
  }, [isAuthPage]);

  useEffect(() => {
    if (isAuthPage) return;
    let cancelled = false;
    // Clean GSAP transitions on page changes.
    import('gsap').then(({ default: gsap }) => {
      if (cancelled) return;
      gsap.fromTo('.content',
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
      );
    });
    return () => { cancelled = true; };
  }, [location.pathname, isAuthPage]);

  // Warm the routes reachable from the sidebar once the browser is idle, so a
  // click almost never has to wait on a network round-trip.
  useEffect(() => {
    if (isAuthPage) return undefined;
    return prefetchWhenIdle([
      'deviceDashboard', 'deviceList', 'therapy', 'trends',
      'reports', 'maskFit', 'settings', 'help',
    ]);
  }, [isAuthPage]);

  // Warm the destination the current page will most likely lead to next.
  useEffect(() => {
    const key = routeKeyForPath(location.pathname);
    if (key) prefetch(key);
  }, [location.pathname]);

  if (isAuthPage) {
    return (
      <div className="auth-shell">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
        <Toast />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content">
        <Header />

        {/* The shell above renders immediately; only the route body suspends. */}
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/dashboard" element={<Navigate to={`/device/${activeSerial}`} replace />} /> {/* Admin: redirect to device dashboard */}
            <Route path="/therapy" element={<Therapy />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/devices" element={<DeviceList />} /> {/* Admin devices page */}
            <Route path="/device/:serial" element={<DeviceDashboard />} />
            <Route path="/device-info" element={<Devices />} /> {/* Patient device page */}
            <Route path="/mask-fit" element={<MaskFit />} />
            <Route path="/settings" element={<Settings />} /> {/* Device comfort & configuration */}
            <Route path="/preferences" element={<AppPreferences />} /> {/* App-level preferences */}
            <Route path="/help" element={<HelpSupport />} />
            <Route path="/admin" element={<AdminPatients />} />
            <Route path="/admin/upload" element={<AdminDataUpload />} /> {/* Admin: device file upload → report */}
            <Route path="/admin/patient/:id" element={<AdminPatientDetail />} />
            <Route path="/waveform-analysis" element={<WaveformAnalysis />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </main>

      <Toast />
      <BottomNavbar />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NotifyProvider>
        <TherapyProvider>
          <Router>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {/* HCP Clinician Portal — fully self-contained, bypasses main app shell */}
                <Route path="/hcp/*" element={<HCPPortal />} />
                {/* Standalone Organization Onboarding */}
                <Route path="/createorg" element={<CreateOrg />} />
                {/* Patient / Admin portal — main app shell */}
                <Route path="/*" element={<AppContent />} />
              </Routes>
            </Suspense>
          </Router>
        </TherapyProvider>
      </NotifyProvider>
    </AuthProvider>
  );
}
