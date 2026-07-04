import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { deriveKeysWithRaw, hashKeyA, generateSalt, encryptKeyBBytesForRecovery } from '../lib/crypto';

const RecoverAccount = () => {
  const [step, setStep] = useState('enter-key'); // 'enter-key' | 'new-password'
  const [email, setEmail] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRecovery = async (e) => {
    e.preventDefault();

    if (step === 'enter-key') {
      setLoading(true);
      try {
        // Verify recovery data exists
        await api.get('/auth/recovery-data', { params: { email } });
        setStep('new-password');
        toast.success('Recovery key accepted. Set your new master password.');
      } catch (err) {
        toast.error(err.response?.data?.error || 'Recovery failed');
      } finally {
        setLoading(false);
      }
    } else {
      if (newPassword !== confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }

      setLoading(true);
      try {
        // 1. Generate new salt and derive new keys
        const newSalt = generateSalt();
        const { keyA, keyBBytes } = await deriveKeysWithRaw(newPassword, newSalt);
        const newAuthHash = await hashKeyA(keyA);

        // 2. Re-encrypt Key B with recovery key for future recoveries
        const { encryptedKeyB, recoveryIv } = await encryptKeyBBytesForRecovery(
          keyBBytes,
          recoveryKey
        );

        // 3. Send to server
        await api.put('/auth/reset-master', {
          email,
          newAuthHash,
          newSalt,
          newEncryptedKeyB: JSON.stringify({ data: encryptedKeyB, iv: recoveryIv }),
        });

        toast.success('Master password reset! Please log in.');
        navigate('/login');
      } catch (err) {
        toast.error(err.response?.data?.error || 'Recovery failed');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 480 }}>
        <div className="auth-header">
          <div className="auth-logo">Weave</div>
          <p className="auth-subtitle">Recover your vault</p>
        </div>

        <form className="auth-form" onSubmit={handleRecovery}>
          <div className="form-field">
            <label className="form-label" htmlFor="recovery-email">Email</label>
            <input
              id="recovery-email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={step === 'new-password'}
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="recovery-key">Recovery Key</label>
            <textarea
              id="recovery-key"
              className="form-textarea mono"
              placeholder="Enter your recovery key (xxxx-xxxx-xxxx-...)"
              value={recoveryKey}
              onChange={(e) => setRecoveryKey(e.target.value)}
              required
              rows={3}
              style={{ fontSize: 'var(--text-sm)' }}
              disabled={step === 'new-password'}
            />
          </div>

          {step === 'new-password' && (
            <>
              <div className="form-field animate-fade-in-up">
                <label className="form-label" htmlFor="new-password">New Master Password</label>
                <input
                  id="new-password"
                  type="password"
                  className="form-input"
                  placeholder="Choose a new master password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              <div className="form-field animate-fade-in-up stagger-1">
                <label className="form-label" htmlFor="confirm-new-password">Confirm New Password</label>
                <input
                  id="confirm-new-password"
                  type="password"
                  className="form-input"
                  placeholder="Re-enter your new master password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="form-error">Passwords do not match</p>
                )}
              </div>
            </>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={loading || !email || !recoveryKey}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ borderTopColor: 'white' }} />
                {step === 'enter-key' ? 'Verifying...' : 'Resetting...'}
              </>
            ) : (
              step === 'enter-key' ? 'Verify Recovery Key' : 'Reset Master Password'
            )}
          </button>
        </form>

        <div className="auth-footer">
          <Link to="/login" className="auth-link">← Back to login</Link>
        </div>
      </div>
    </div>
  );
};

export default RecoverAccount;
