import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserIcon, LockIcon } from '../../components/Icons';
import { requestPasswordReset, confirmPasswordReset } from '../../services/respireeAuth';

/** Plain-language reason for a failed reset step. */
function resetErrorMessage(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return "You're offline. Check your internet connection and try again.";
  }
  switch (err?.cognitoType) {
    case 'CodeMismatchException': return 'That code is not correct. Check the email and try again.';
    case 'ExpiredCodeException': return 'That code has expired. Request a new one.';
    case 'InvalidPasswordException': return err.message || 'That password does not meet the password rules.';
    case 'LimitExceededException':
    case 'TooManyRequestsException': return 'Too many attempts. Wait a few minutes and try again.';
    case 'InvalidParameterException': return 'This account cannot reset its password by email. Contact your administrator.';
    case 'UserNotFoundException': return 'No account was found for that email.';
    case 'NotAuthorizedException': return 'Password reset is not allowed for this account. Contact your administrator.';
    default: break;
  }
  if (err?.name === 'TypeError') return "Couldn't reach the sign-in service. Try again in a minute.";
  return 'Something went wrong. Try again, and contact support if it keeps happening.';
}

export default function ForgotPassword() {
  const [step, setStep] = useState('request'); // 'request' | 'confirm' | 'done'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  const sendCode = async (e) => {
    e?.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      const res = await requestPasswordReset(email.trim());
      // Cognito says where the code went (a masked address), so we never claim more than that.
      setSentTo(res?.CodeDeliveryDetails?.Destination || '');
      setStep('confirm');
    } catch (err) {
      setError(resetErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const setNewPassword = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await confirmPasswordReset(email.trim(), code.trim(), password);
      setStep('done');
    } catch (err) {
      setError(resetErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-background-glow">
        <div className="glow-blob glow-blob-1"></div>
        <div className="glow-blob glow-blob-2"></div>
      </div>

      <div className="auth-glass-panel">
        <div className="auth-header">
          <div className="logo-brand">
            <span className="logo-deck">Res</span>
            <span className="logo-link">prox</span>
          </div>
          <h2 className="auth-title">Reset Password</h2>
          <p className="auth-subtitle">
            {step === 'request' && "Enter your account email and we'll send you a verification code."}
            {step === 'confirm' && 'Enter the code from your email and choose a new password.'}
            {step === 'done' && 'Your password has been changed.'}
          </p>
        </div>

        {error && <p className="auth-notice" role="alert">{error}</p>}

        {step === 'done' ? (
          <div className="auth-success-state">
            <div className="success-icon-badge">✓</div>
            <h4>Password changed</h4>
            <p>You can now sign in with your new password.</p>
            <Link to="/login" className="auth-back-link-btn">Back to Login</Link>
          </div>
        ) : step === 'confirm' ? (
          <form onSubmit={setNewPassword} className="auth-form">
            <p className="auth-subtitle" style={{ marginTop: 0 }}>
              {sentTo ? <>A code was sent to <strong>{sentTo}</strong>.</> : 'A code was sent to the email on your account.'}
            </p>
            <div className="auth-input-group">
              <label htmlFor="code">Verification code</label>
              <div className="input-with-icon">
                <span className="input-icon"><LockIcon /></span>
                <input id="code" inputMode="numeric" autoComplete="one-time-code" value={code}
                  onChange={(e) => setCode(e.target.value)} required />
              </div>
            </div>
            <div className="auth-input-group">
              <label htmlFor="new-password">New password</label>
              <div className="input-with-icon">
                <span className="input-icon"><LockIcon /></span>
                <input id="new-password" type="password" autoComplete="new-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} required />
              </div>
            </div>
            <div className="auth-input-group">
              <label htmlFor="confirm-password">Confirm new password</label>
              <div className="input-with-icon">
                <span className="input-icon"><LockIcon /></span>
                <input id="confirm-password" type="password" autoComplete="new-password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)} required />
              </div>
            </div>
            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? 'Saving…' : 'Set new password'}
            </button>
            <div className="auth-back-link-row">
              <button type="button" className="auth-cancel-link" onClick={sendCode} disabled={loading}
                style={{ background: 'none', border: 0, cursor: 'pointer' }}>
                Send a new code
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={sendCode} className="auth-form">
            <div className="auth-input-group">
              <label htmlFor="email">Email Address</label>
              <div className="input-with-icon">
                <span className="input-icon"><UserIcon /></span>
                <input type="email" id="email" placeholder="name@example.com" autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            </div>
            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? 'Sending code…' : 'Send verification code'}
            </button>
            <div className="auth-back-link-row">
              <Link to="/login" className="auth-cancel-link">Cancel & Return</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
