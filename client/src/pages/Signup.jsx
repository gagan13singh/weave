import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { analyzePassword, generateMasterPassphrase } from '../lib/validators';
import toast from 'react-hot-toast';

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
          <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>security note</span>
          <hr style={{ flex: 1, borderColor: 'var(--border-default)', opacity: 0.3 }} />
        </div>

        <div style={{ padding: '12px 14px', background: 'rgba(139,124,247,0.05)', border: '1px solid rgba(139,124,247,0.15)', borderRadius: 'var(--radius-md)', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          🔐 <strong>Weave does not use OAuth.</strong> Create your vault using any email address. Your encryption key is derived from your master password — Weave never connects to Google, Apple, or GitHub servers.
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
