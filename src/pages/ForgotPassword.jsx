import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTherapy } from '../context/TherapyContext';
import { UserIcon } from '../components/Icons';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const { setShowToast, setSaveState } = useTherapy();

  const handleForgotSubmit = (e) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    // Simulate recovery link delivery call
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setSaveState('success');
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
        setSaveState('idle');
      }, 3000);
    }, 1500);
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
            <span className="logo-deck">Deck</span>
            <span className="logo-link">Link</span>
          </div>
          <h2 className="auth-title">Reset Password</h2>
          <p className="auth-subtitle">We will email you instructions to restore your settings dashboard login</p>
        </div>

        {success ? (
          <div className="auth-success-state">
            <div className="success-icon-badge">✓</div>
            <h4>Recovery Link Sent</h4>
            <p>
              An email has been dispatched to <strong>{email}</strong>. 
              Please click the link inside that message to choose a new password.
            </p>
            <Link to="/login" className="auth-back-link-btn">
              Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleForgotSubmit} className="auth-form">
            <div className="auth-input-group">
              <label htmlFor="email">Email Address</label>
              <div className="input-with-icon">
                <span className="input-icon"><UserIcon /></span>
                <input
                  type="email"
                  id="email"
                  placeholder="admin@decklink.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <div className="loading-spinner-container">
                  <span className="spinner-dot"></span>
                  <span>Sending Instructions...</span>
                </div>
              ) : (
                'Send Recovery Link'
              )}
            </button>

            <div className="auth-back-link-row">
              <Link to="/login" className="auth-cancel-link">
                Cancel & Return
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
