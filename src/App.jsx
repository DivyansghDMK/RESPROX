import React, { useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { TherapyProvider, useTherapy } from './context/TherapyContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Toast from './components/Toast';
import BottomNavbar from './components/BottomNavbar';
import RouteFallback from './components/RouteFallback';
import ErrorBoundary from './components/ErrorBoundary';
import ErrorPanel from './components/ErrorPanel';
import DeviceBar from './components/DeviceBar';
import { AuthProvider, useAuth } from './context/AuthContext';
import ConnectionBanner from './components/ConnectionBanner';
import { NotifyProvider } from './context/NotifyContext';
import { AccessProvider, useAccess } from './context/AccessContext';
import AccountBlocked from './components/AccountBlocked';

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
  Trends,
  Reports,
  ActivityLog,
  Devices,
  MaskFit,
  Settings,
  AppPreferences,
  HelpSupport,
  AdminDataUpload,
  Calibration,
  ForgotPassword,
  DoctorSignup,
} from './routes';

// Authentication is always required; there is no demo/bypass mode.
const SKIP_LOGIN = false;

// Pages that show one device: they carry the device bar, and ask for a device
// when none is selected.
const DEVICE_PAGES = new Set(['/reports', '/trends', '/mask-fit', '/settings', '/calibration', '/device-info']);

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, teamSignIn, loginPath } = useAuth();
  const { accountBlocked, reloadDealer, accountError, accountLoading, isDealer } = useAccess();

  // The API layer raises this when the session can no longer be refreshed.
  useEffect(() => {
    const onExpired = async () => {
      if (await teamSignIn()) return; // team browsers renew silently
      const path = loginPath();
      logout();
      navigate(path, { replace: true, state: { reason: 'expired' } });
    };
    window.addEventListener('resprox:session-expired', onExpired);
    return () => window.removeEventListener('resprox:session-expired', onExpired);
  }, [logout, navigate, teamSignIn, loginPath]);

  const { adminActiveSerial } = useTherapy();
  const activeSerial = adminActiveSerial || '';
  const isAuthPage = !SKIP_LOGIN && (location.pathname === '/login' || location.pathname === '/forgot-password' || location.pathname === '/'
  || location.pathname === '/doctor/login' || location.pathname === '/doctor/signup');

  useEffect(() => {
    if (isAuthPage) return;
    let cancelled = false;
    let lenis;
    let frame;

    // gsap + lenis are ~90 kB that nothing needs before first paint, so they
    // load after the shell is interactive instead of blocking it.
    // Smooth scrolling is motion; skip it for people who asked for less.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;
      lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        // Without this Lenis takes every wheel event, so panels with their own
        // scrollbar (sidebar, notifications, wide tables, dialogs) never scroll.
        allowNestedScroll: true,
      });
      // The rAF loop must be cancellable, otherwise StrictMode's double-mount
      // and every HMR update leave a loop running forever against a destroyed
      // instance, permanently taxing the main thread.
      const raf = (time) => {
        lenis.raf(time);
        frame = requestAnimationFrame(raf);
      };
      frame = requestAnimationFrame(raf);
    }).catch(() => { /* plain scrolling is fine */ });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      lenis?.destroy();
    };
  }, [isAuthPage]);

  useEffect(() => {
    if (isAuthPage) return;
    let cancelled = false;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    // Clean GSAP transitions on page changes.
    import('gsap').then(({ default: gsap }) => {
      if (cancelled) return;
      gsap.fromTo('.content',
        { opacity: 0, y: 15 },
        // Clear the transform when done: a leftover one turns .content into the
        // containing block for position: fixed, trapping overlays inside it.
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', clearProps: 'transform' }
      );
    }).catch(() => { /* no transition is fine */ });
    return () => { cancelled = true; };
  }, [location.pathname, isAuthPage]);

  // Warm the routes reachable from the sidebar once the browser is idle, so a
  // click almost never has to wait on a network round-trip.
  useEffect(() => {
    if (isAuthPage) return undefined;
    return prefetchWhenIdle([
      'deviceDashboard', 'deviceList', 'trends',
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
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/doctor/login" element={<Login variant="doctor" />} />
              <Route path="/doctor/signup" element={<DoctorSignup />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
        <Toast />
      </div>
    );
  }

  if (accountBlocked) {
    return (
      <div className="auth-shell">
        <AccountBlocked reason={accountBlocked} onRetry={reloadDealer} />
      </div>
    );
  }

  // The account (GET /me) decides what this person may see. Until it has
  // answered once, show the page shape; if it failed, say so with a retry.
  if (accountLoading) {
    return (
      <div className="app-shell">
        <main className="content"><RouteFallback /></main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content">
        <Header />

        {/* The shell above renders immediately; only the route body suspends.
            A page that throws is caught here, so the shell stays usable. */}
        {DEVICE_PAGES.has(location.pathname) && <DeviceBar />}
        {accountError && (
          <ErrorPanel
            error={accountError}
            action="load your account"
            onRetry={reloadDealer}
            compact
            described={isDealer ? undefined : {
              title: 'Couldn’t load your account details',
              message: 'Your role and organisation could not be read, so some pages may be missing. Try again; if it keeps failing, send the details to the backend team.',
              retryable: true,
            }}
          />
        )}
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/dashboard" element={activeSerial ? <Navigate to={`/device/${activeSerial}`} replace /> : <Navigate to="/devices" replace />} />
              <Route path="/trends" element={<Trends />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/activity" element={<ActivityLog />} />
              <Route path="/activity/:serial" element={<ActivityLog />} />
              <Route path="/devices" element={<DeviceList />} /> {/* Admin devices page */}
              <Route path="/device/:serial" element={<DeviceDashboard />} />
              <Route path="/device-info" element={<Devices />} /> {/* Patient device page */}
              <Route path="/mask-fit" element={<MaskFit />} />
              <Route path="/settings" element={<Settings />} /> {/* Device comfort & configuration */}
              <Route path="/preferences" element={<AppPreferences />} /> {/* App-level preferences */}
              <Route path="/help" element={<HelpSupport />} />
              <Route path="/admin/upload" element={<AdminDataUpload />} /> {/* Device file upload → report (admin and dealers) */}
              <Route path="/calibration" element={<Calibration />} /> {/* Admin: pressure calibration */}
              <Route path="*" element={<Navigate to={SKIP_LOGIN ? '/devices' : '/login'} replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
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
          <AccessProvider>
          <Router>
            {/* Last line of defence: a throw in the sidebar, header or a provider
                shows a recoverable panel instead of a blank white screen. */}
            <ErrorBoundary>
              <ConnectionBanner />
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/*" element={<AppContent />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </Router>
          </AccessProvider>
        </TherapyProvider>
      </NotifyProvider>
    </AuthProvider>
  );
}
