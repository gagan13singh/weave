import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { analyzePassword, generateMasterPassphrase } from '../lib/validators';
import toast from 'react-hot-toast';
import api from '../lib/api';

const Signup = () => {
  const [email, setEmail] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState(null);
  const [step, setStep] = useState('form'); // 'form' | 'recovery'
  const { signup, login } = useAuthContext();
  const navigate = useNavigate();

  const handleSocialAuth = async (provider) => {
    const socialEmail = prompt(`Please enter your ${provider.charAt(0).toUpperCase() + provider.slice(1)} email address to sign up/in:`);
    if (!socialEmail) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(socialEmail)) {
      toast.error('Invalid email address');
      return;
    }

    const password = prompt(`Enter/Create a Master Password for your secure Weave vault:`);
    if (!password || password.length < 8) {
      toast.error('Master Password is required and must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      let isSignup = false;
      try {
        await api.get('/auth/salt', { params: { email: socialEmail } });
      } catch (err) {
        isSignup = true;
      }

      if (isSignup) {
        await signup(socialEmail, password);
        sessionStorage.setItem('pending_social_provision', JSON.stringify({
          provider,
          email: socialEmail
        }));
      }

      const result = await login(socialEmail, password);
      if (result.requires2FA) {
        toast.success(`Registered! Please configure 2FA on login.`);
        navigate('/login');
      } else {
        toast.success(`Welcome to Weave via ${provider}!`);
        navigate('/');
      }
    } catch (err) {
      toast.error('SSO Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const strength = analyzePassword(masterPassword);
  const passwordsMatch = masterPassword === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!passwordsMatch) {
      toast.error('Passwords do not match');
      return;
    }
    if (strength.score < 2) {
      toast.error('Please choose a stronger master password');
      return;
    }

    setLoading(true);
    try {
      const result = await signup(email, masterPassword);
      setRecoveryKey(result.recoveryKey);
      setStep('recovery');
      toast.success('Account created! Save your recovery key.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryConfirm = () => {
    navigate('/login');
    toast.success('Please check your email to verify your account');
  };

  if (step === 'recovery') {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ maxWidth: 520 }}>
          <div className="auth-header">
            <div className="auth-logo">Weave</div>
            <p className="auth-subtitle">Save your recovery key</p>
          </div>

          <div className="recovery-key-display">
            <div style={{ fontSize: '2rem', marginBottom: 'var(--space-3)' }}>🔑</div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
              This is your <strong>recovery key</strong>. If you forget your master password,
              this is the <strong>only way</strong> to recover your vault.
            </p>
            <div className="recovery-key-value">{recoveryKey}</div>
            <p className="recovery-key-warning">
              ⚠️ Write it down and store it somewhere safe. You will <strong>never see this again</strong>.
            </p>
          </div>

          <div style={{ marginTop: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <button className="btn btn-primary btn-full btn-lg" onClick={handleRecoveryConfirm}>
              I've saved my recovery key
            </button>
            <button 
              className="btn btn-secondary btn-full"
              onClick={() => {
                navigator.clipboard.writeText(recoveryKey);
                toast.success('Recovery key copied to clipboard');
              }}
            >
              📋 Copy to clipboard
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
          <p className="auth-subtitle">Create your secure vault</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-label" htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" htmlFor="signup-password">Master Password</label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '0 4px', fontSize: 'var(--text-xs)', height: 'auto', color: 'var(--accent-primary)' }}
                onClick={() => {
                  const pass = generateMasterPassphrase();
                  setMasterPassword(pass);
                  setConfirmPassword(pass);
                  setShowPassword(true);
                  toast.success('Passphrase suggested & matched below!');
                }}
              >
                🎲 Suggest Passphrase
              </button>
            </div>
            <div className="form-input-wrapper">
              <input
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="Choose a strong master password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
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
            {masterPassword && (
              <div className="strength-meter">
                <div className="strength-bar-track">
                  <div
                    className="strength-bar-fill"
                    style={{
                      width: `${(strength.score + 1) * 20}%`,
                      backgroundColor: strength.color,
                    }}
                  />
                </div>
                <div className="strength-label">
                  <span style={{ color: strength.color }}>{strength.label}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Crack time: {strength.crackTime}
                  </span>
                </div>
                {strength.feedback && (
                  <p className="form-error" style={{ color: 'var(--text-tertiary)', marginTop: 'var(--space-1)' }}>
                    💡 {strength.feedback}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="signup-confirm">Confirm Master Password</label>
            <input
              id="signup-confirm"
              type="password"
              className="form-input"
              placeholder="Re-enter your master password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            {confirmPassword && !passwordsMatch && (
              <p className="form-error">Passwords do not match</p>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={loading || !email || !masterPassword || !confirmPassword || !passwordsMatch || strength.score < 2}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ borderTopColor: 'white' }} />
                Creating vault...
              </>
            ) : (
              'Create Vault'
            )}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '20px 0' }}>
          <hr style={{ flex: 1, borderColor: 'var(--border-default)', opacity: 0.3 }} />
          <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>or continue with</span>
          <hr style={{ flex: 1, borderColor: 'var(--border-default)', opacity: 0.3 }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => handleSocialAuth('google')} style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleSocialAuth('github')} style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
            </svg>
            GitHub
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleSocialAuth('microsoft')} style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', gridColumn: 'span 2' }}>
            <svg width="14" height="14" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="10" height="10" fill="#F25022"/>
              <rect x="11" width="10" height="10" fill="#7FBA00"/>
              <rect y="11" width="10" height="10" fill="#00A4EF"/>
              <rect x="11" y="11" width="10" height="10" fill="#FFB900"/>
            </svg>
            Microsoft / Azure Active Directory
          </button>
        </div>

        <div className="auth-reassurance">
          🔒 Your master password never leaves this device
        </div>

        <div className="auth-footer">
          Already have a vault?{' '}
          <Link to="/login" className="auth-link">Sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default Signup;
