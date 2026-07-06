import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import toast from 'react-hot-toast';
import api from '../lib/api';

const Login = () => {
  const [email, setEmail] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [pendingToken, setPendingToken] = useState(null);
  const [pendingKeyB, setPendingKeyB] = useState(null);
  const [totpCode, setTotpCode] = useState(['', '', '', '', '', '']);
  const totpRefs = useRef([]);

  const { login, validate2FA, signup } = useAuthContext();
  const navigate = useNavigate();


  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(email, masterPassword);

      if (result.requires2FA) {
        setNeeds2FA(true);
        setPendingToken(result.pendingToken);
        setPendingKeyB(result.keyB);
        setTimeout(() => totpRefs.current[0]?.focus(), 100);
      } else {
        toast.success('Welcome back!');
        navigate('/');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleTotpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...totpCode];
    newCode[index] = value.slice(-1);
    setTotpCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      totpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (newCode.every((d) => d !== '') && newCode.join('').length === 6) {
      handle2FASubmit(newCode.join(''));
    }
  };

  const handleTotpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !totpCode[index] && index > 0) {
      totpRefs.current[index - 1]?.focus();
    }
  };

  const handleTotpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newCode = [...totpCode];
    for (let i = 0; i < 6; i++) {
      newCode[i] = pasted[i] || '';
    }
    setTotpCode(newCode);
    if (pasted.length === 6) {
      handle2FASubmit(pasted);
    } else {
      totpRefs.current[pasted.length]?.focus();
    }
  };

  const handle2FASubmit = async (code) => {
    setLoading(true);
    try {
      await validate2FA(pendingToken, code, email, pendingKeyB);
      toast.success('Welcome back!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid 2FA code');
      setTotpCode(['', '', '', '', '', '']);
      totpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  if (needs2FA) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo">Weave</div>
            <p className="auth-subtitle">Two-factor authentication</p>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
              Enter the 6-digit code from your authenticator app
            </p>
          </div>

          <div className="twofa-code-input" onPaste={handleTotpPaste}>
            {totpCode.map((digit, i) => (
              <input
                key={i}
                ref={(el) => (totpRefs.current[i] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleTotpChange(i, e.target.value)}
                onKeyDown={(e) => handleTotpKeyDown(i, e)}
                autoFocus={i === 0}
              />
            ))}
          </div>

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-4)' }}>
              <div className="spinner spinner-lg" />
            </div>
          )}

          <div className="auth-footer" style={{ marginTop: 'var(--space-8)' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setNeeds2FA(false);
                setTotpCode(['', '', '', '', '', '']);
              }}
            >
              ← Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">Weave</div>
          <p className="auth-subtitle">Unlock your vault</p>
        </div>

        <form className="auth-form" onSubmit={handleLogin}>
          <div className="form-field">
            <label className="form-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="login-password">Master Password</label>
            <div className="form-input-wrapper">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="Enter your master password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{ paddingRight: '48px' }}
              />
              <button
                type="button"
                className="form-input-icon"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={loading || !email || !masterPassword}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ borderTopColor: 'white' }} />
                Unlocking...
              </>
            ) : (
              'Unlock Vault'
            )}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '20px 0' }}>
          <hr style={{ flex: 1, borderColor: 'var(--border-default)', opacity: 0.3 }} />
          <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>security note</span>
          <hr style={{ flex: 1, borderColor: 'var(--border-default)', opacity: 0.3 }} />
        </div>

        <div style={{ padding: '12px 14px', background: 'rgba(139,124,247,0.05)', border: '1px solid rgba(139,124,247,0.15)', borderRadius: 'var(--radius-md)', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          🔐 <strong>Weave uses your own email + master password</strong> — not Google or GitHub OAuth. Enter any email address above regardless of which service you use it for. Your vault is protected by end-to-end encryption, not a third-party login provider.
        </div>

        <div className="auth-reassurance">
          🔒 Your master password never leaves this device
        </div>

        <div className="auth-footer">
          <div style={{ marginBottom: 'var(--space-2)' }}>
            Don't have a vault?{' '}
            <Link to="/signup" className="auth-link">Create one</Link>
          </div>
          <Link to="/recover" className="auth-link" style={{ fontSize: 'var(--text-xs)' }}>
            Forgot master password?
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
