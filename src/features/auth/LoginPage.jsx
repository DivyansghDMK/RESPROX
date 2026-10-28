import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useTherapy } from '../../context/TherapyContext';
import { useAuth } from '../../context/AuthContext';
import { UserIcon, LockIcon } from '../../components/Icons';

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
);

/** The real reason a sign-in failed, in words the user can act on. */
function loginErrorMessage(err, doctor) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return "You're offline. Check your internet connection and try again.";
  }
  switch (err?.cognitoType) {
    case 'NotAuthorizedException': return 'Incorrect email or password.';
    case 'UserNotFoundException': return 'Incorrect email or password.';
    case 'UserNotConfirmedException': return doctor
      ? 'This account has not been verified yet. Finish signup with the code we emailed you.'
      : 'This account has not been confirmed yet. Contact your administrator.';
    case 'PasswordResetRequiredException': return 'A password reset is required. Use "Forgot password?" to set a new one.';
    case 'AliasDisabled': return 'Sign-in with a username is turned off. Use your email address.';
    case 'AliasServerError': return err.message;
    case 'TooManyRequestsException':
    case 'LimitExceededException': return 'Too many attempts. Wait a few minutes and try again.';
    default: break;
  }
  if (/IdToken/.test(String(err?.message))) {
    return 'This account needs extra sign-in steps (such as a new password) that this site does not support yet. Contact your administrator.';
  }
  if (err?.name === 'TypeError') {
    return "Couldn't reach the sign-in service. Try again in a minute.";
  }
  return 'Sign-in failed. Try again, and contact support if it keeps happening.';
}

/** `variant="doctor"` is the doctors' entry point; after sign-in the app is the same. */
export default function Login({ variant = 'admin' }) {
  const doctor = variant === 'doctor';
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  
  const { setShowToast, setSaveState, setToastMessage } = useTherapy();
  const { login, isAuthenticated, teamSigningIn } = useAuth();
  const navigate = useNavigate();

  // Already signed in (including a team browser that just signed itself in): go straight in.
  useEffect(() => {
    if (isAuthenticated) navigate('/devices', { replace: true });
  }, [isAuthenticated, navigate]);
  const sessionExpired = location.state?.reason === 'expired';
  const justSignedUp = location.state?.reason === 'signed-up';

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setToastMessage('Please enter both email and password.');
      setSaveState('error');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return;
    }

    setLoading(true);
    try {
      await login(email, password, { remember: rememberMe, doctor });
      setLoading(false);
      navigate('/devices', { replace: true });
    } catch (err) {
      setLoading(false);
      setToastMessage(loginErrorMessage(err, doctor));
      setSaveState('error');
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
        setSaveState('idle');
        setToastMessage('');
      }, 5000);
    }
  };

  if (teamSigningIn || isAuthenticated) {
    return (
      <div className="auth-container">
        <div className="auth-glass-panel" role="status" aria-live="polite" style={{ textAlign: 'center' }}>
          <div className="admin-spinner" style={{ margin: '8px auto 16px' }} />
          <p className="auth-subtitle" style={{ margin: 0 }}>Opening Resprox…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      {/* Premium ambient glow background blobs */}
      <div className="auth-background-glow">
        <div className="glow-blob glow-blob-1"></div>
        <div className="glow-blob glow-blob-2"></div>
      </div>

      <div className="auth-glass-panel">
        <div className="auth-header">
          <div className="logo-brand" style={{ flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            <img src="/resprox-logo.png" alt="Resprox Logo" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span className="logo-deck">Res</span>
              <span className="logo-link">prox</span>
            </div>
          </div>
          <h2 className="auth-title">{doctor ? 'Doctor Sign In' : 'Resprox Access'}</h2>
          <p className="auth-subtitle">
            {doctor ? 'Sign in to review your patients\' therapy data' : 'Sign in with your Cognito email and password'}
          </p>
          {justSignedUp && (
            <p className="auth-notice auth-notice-success" role="status">Email verified. Sign in with your new account.</p>
          )}
          {sessionExpired && (
            <p className="auth-notice" role="status">Your session expired. Please sign in again.</p>
          )}
        </div>

        <form onSubmit={handleLoginSubmit} className="auth-form">
          <div className="auth-input-group">
            <label htmlFor="username">{doctor ? 'Email' : 'Email / Admin'}</label>
            <div className="input-with-icon">
              <span className="input-icon"><UserIcon /></span>
              <input
                type={doctor ? 'email' : 'text'}
                id="username"
                autoComplete={doctor ? 'email' : 'username'}
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="auth-input-group">
            <div className="label-row">
              <label htmlFor="password">Password</label>
            </div>
            <div className="input-with-icon">
              <span className="input-icon"><LockIcon /></span>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle-icon-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {/* Form options row with Checkbox and Forgot Link */}
          <div className="form-options-row">
            <label className="checkbox-container">
              <input 
                type="checkbox" 
                checked={rememberMe} 
                onChange={() => setRememberMe(!rememberMe)} 
              />
              <span className="checkmark"></span>
              Keep me signed in
            </label>
            <Link to="/forgot-password" className="forgot-link">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <div className="loading-spinner-container">
                <span className="spinner-dot"></span>
                <span>Authorizing...</span>
              </div>
            ) : (
              'Log In'
            )}
          </button>
        </form>

        <div className="auth-switch">
          {doctor ? (
            <>
              <p>New to Resprox? <Link to="/doctor/signup">Create a doctor account</Link></p>
              <p><Link to="/login">Admin sign in</Link></p>
            </>
          ) : (
            <p>Are you a doctor? <Link to="/doctor/login">Doctor sign in</Link></p>
          )}
        </div>
      </div>
    </div>
  );
}
