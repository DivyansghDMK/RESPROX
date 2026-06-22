import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTherapy } from '../context/TherapyContext';
import { useAuth } from '../context/AuthContext';
import { UserIcon, LockIcon } from '../components/Icons';

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

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const { setShowToast, setSaveState, setToastMessage } = useTherapy();
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setToastMessage('Please enter both username and password.');
      setSaveState('error');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return;
    }

    setLoading(true);
    try {
      const success = await login(email, password);
      setLoading(false);
      if (success) {
        setToastMessage('Authorization successful! Redirecting...');
        setSaveState('success');
        setShowToast(true);
        setTimeout(() => {
          setShowToast(false);
          setSaveState('idle');
          setToastMessage('');
          navigate('/devices');
        }, 1500);
      } else {
        throw new Error("Login failed");
      }
    } catch (err) {
      setLoading(false);
      setToastMessage('Invalid username or password. Please try again.');
      setSaveState('error');
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
        setSaveState('idle');
        setToastMessage('');
      }, 3000);
    }
  };

  return (
    <div className="auth-container">
      {/* Premium ambient glow background blobs */}
      <div className="auth-background-glow">
        <div className="glow-blob glow-blob-1"></div>
        <div className="glow-blob glow-blob-2"></div>
      </div>

      <div className="auth-glass-panel">
        <div className="auth-header">
          <div className="logo-brand">
            <span className="logo-respro">respro</span>
            <span className="logo-x">X</span>
          </div>
          <h2 className="auth-title">Admin Access</h2>
          <p className="auth-subtitle">Sign in to configure settings & check compliance metrics</p>
        </div>

        <form onSubmit={handleLoginSubmit} className="auth-form">
          <div className="auth-input-group">
            <label htmlFor="username">Username</label>
            <div className="input-with-icon">
              <span className="input-icon"><UserIcon /></span>
              <input
                type="text"
                id="username"
                placeholder="admin"
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

        <div className="auth-footer">
          <p>Demo Credentials: <strong>admin</strong> / <strong>admin123</strong></p>
        </div>
      </div>
    </div>
  );
}
