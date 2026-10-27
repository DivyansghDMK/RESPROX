import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserIcon, LockIcon } from '../../components/Icons';
import { signUpDoctor, confirmSignUp, resendSignUpCode } from '../../services/respireeAuth';

/** Plain-language reason a signup step failed. */
function signupErrorMessage(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return "You're offline. Check your internet connection and try again.";
  }
  const message = String(err?.message || '');
  switch (err?.cognitoType) {
    case 'NotAuthorizedException':
      return /SignUp is not permitted/i.test(message)
        ? 'Doctor signup is not open yet. Contact your Resprox administrator to get an account.'
        : 'This account cannot be verified. Contact your administrator.';
    case 'UsernameExistsException': return 'An account with this email already exists. Sign in instead.';
    case 'InvalidPasswordException': return message || 'That password does not meet the password rules.';
    case 'CodeMismatchException': return 'That code is not correct. Check the email and try again.';
    case 'ExpiredCodeException': return 'That code has expired. Request a new one.';
    case 'LimitExceededException':
    case 'TooManyRequestsException': return 'Too many attempts. Wait a few minutes and try again.';
    case 'InvalidParameterException':
      // The pool is missing custom:clinic / custom:license_no.
      if (/attribute/i.test(message)) return 'Doctor signup is not set up yet. Contact your Resprox administrator.';
      return message || 'Some details are not valid. Check the form and try again.';
    default: break;
  }
  if (err?.name === 'TypeError') return "Couldn't reach the sign-in service. Try again in a minute.";
  return 'Something went wrong. Try again, and contact support if it keeps happening.';
}

/** Cognito's default policy; checked here so the doctor learns before submitting. */
function passwordProblem(pw) {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) return 'Use both upper- and lower-case letters.';
  if (!/\d/.test(pw)) return 'Include a number.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Include a symbol, such as ! or #.';
  return '';
}

function Field({ id, label, icon, ...input }) {
  return (
    <div className="auth-input-group">
      <label htmlFor={id}>{label}</label>
      <div className="input-with-icon">
        <span className="input-icon">{icon}</span>
        <input id={id} {...input} />
      </div>
    </div>
  );
}

export default function DoctorSignup() {
  const navigate = useNavigate();
  const [step, setStep] = useState('details'); // 'details' | 'verify'
  const [form, setForm] = useState({ name: '', email: '', clinic: '', licenseNo: '', password: '', confirm: '' });
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const email = form.email.trim();

  const submitDetails = async (e) => {
    e.preventDefault();
    const problem = passwordProblem(form.password);
    if (problem) { setError(problem); return; }
    if (form.password !== form.confirm) { setError('The two passwords do not match.'); return; }

    setLoading(true);
    setError('');
    try {
      const res = await signUpDoctor({
        name: form.name.trim(),
        email,
        password: form.password,
        clinic: form.clinic.trim(),
        licenseNo: form.licenseNo.trim(),
      });
      if (res?.UserConfirmed) {
        navigate('/doctor/login', { replace: true, state: { reason: 'signed-up', email } });
        return;
      }
      setSentTo(res?.CodeDeliveryDetails?.Destination || '');
      setStep('verify');
    } catch (err) {
      setError(signupErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await confirmSignUp(email, code.trim());
      navigate('/doctor/login', { replace: true, state: { reason: 'signed-up', email } });
    } catch (err) {
      setError(signupErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await resendSignUpCode(email);
      setSentTo(res?.CodeDeliveryDetails?.Destination || sentTo);
      setNotice('A new code is on its way.');
    } catch (err) {
      setError(signupErrorMessage(err));
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
          <h2 className="auth-title">{step === 'details' ? 'Create Doctor Account' : 'Verify Your Email'}</h2>
          <p className="auth-subtitle">
            {step === 'details'
              ? 'Register to review your patients\' therapy data'
              : sentTo ? <>Enter the code we sent to <strong>{sentTo}</strong>.</> : 'Enter the code we emailed you.'}
          </p>
        </div>

        {error && <p className="auth-notice" role="alert">{error}</p>}
        {notice && !error && <p className="auth-notice auth-notice-success" role="status">{notice}</p>}

        {step === 'details' ? (
          <form onSubmit={submitDetails} className="auth-form">
            <Field id="name" label="Full name" icon={<UserIcon />} placeholder="Dr. Asha Mehta"
              autoComplete="name" value={form.name} onChange={set('name')} required />
            <Field id="email" label="Work email" icon={<UserIcon />} type="email" placeholder="name@clinic.com"
              autoComplete="email" value={form.email} onChange={set('email')} required />
            <Field id="clinic" label="Hospital / clinic" icon={<UserIcon />} placeholder="City Sleep Clinic"
              autoComplete="organization" value={form.clinic} onChange={set('clinic')} required />
            <Field id="license" label="Medical registration no." icon={<LockIcon />} placeholder="e.g. MCI-123456"
              value={form.licenseNo} onChange={set('licenseNo')} required />
            <Field id="password" label="Password" icon={<LockIcon />} type="password" placeholder="••••••••"
              autoComplete="new-password" value={form.password} onChange={set('password')} required />
            <p className="auth-hint">At least 8 characters, with upper- and lower-case letters, a number and a symbol.</p>
            <Field id="confirm" label="Confirm password" icon={<LockIcon />} type="password" placeholder="••••••••"
              autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required />

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? (
                <div className="loading-spinner-container">
                  <span className="spinner-dot"></span>
                  <span>Creating account…</span>
                </div>
              ) : 'Create account'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="auth-form">
            <Field id="code" label="Verification code" icon={<LockIcon />} inputMode="numeric"
              autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? 'Verifying…' : 'Verify email'}
            </button>
            <div className="auth-back-link-row">
              <button type="button" className="auth-cancel-link" onClick={resend} disabled={loading}
                style={{ background: 'none', border: 0, cursor: 'pointer' }}>
                Send a new code
              </button>
            </div>
          </form>
        )}

        <div className="auth-switch">
          <p>Already have an account? <Link to="/doctor/login">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
