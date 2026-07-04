import { useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { useVaultContext } from '../context/VaultContext';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  deriveKeys,
  deriveKeysWithRaw,
  generateSalt,
  hashKeyA,
  encrypt,
  decrypt,
  generateRecoveryKey,
  encryptKeyBBytesForRecovery,
} from '../lib/crypto';

const Settings = () => {
  const { user, logout } = useAuthContext();
  const { allEntries } = useVaultContext();
  const navigate = useNavigate();

  // 2FA state
  const [qrCode, setQrCode] = useState(null);
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  // Key rotation & recovery state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rotationLoading, setRotationLoading] = useState(false);
  const [rotationRecoveryKey, setRotationRecoveryKey] = useState('');
  const [regenerateLoading, setRegenerateLoading] = useState(false);
  const [regenerateRecoveryKeyVal, setRegenerateRecoveryKeyVal] = useState('');

  const handle2FASetup = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/2fa/setup');
      setQrCode(data.qrCode);
      setTotpSecret(data.secret);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to setup 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handle2FAVerify = async () => {
    setLoading(true);
    try {
      await api.post('/auth/2fa/verify', { totpCode });
      setTwoFAEnabled(true);
      setQrCode(null);
      setTotpCode('');
      toast.success('Two-factor authentication enabled!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handle2FADisable = async () => {
    setLoading(true);
    try {
      await api.post('/auth/2fa/disable', { totpCode: disableCode });
      setTwoFAEnabled(false);
      setDisableCode('');
      toast.success('Two-factor authentication disabled');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure? This will permanently delete your account and all vault data. This cannot be undone.')) {
      return;
    }
    if (!confirm('Really delete everything? Your encrypted vault data will be gone forever.')) {
      return;
    }

    try {
      toast.error('Account deletion coming in a future update');
    } catch {
      toast.error('Failed to delete account');
    }
  };

  const handleRevokeSessions = async () => {
    if (!confirm('Are you sure you want to sign out of all active sessions? You will be logged out of this device as well.')) {
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/revoke-sessions');
      toast.success('All sessions revoked!');
      logout();
    } catch (err) {
      toast.error('Failed to revoke sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleRotateKey = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }

    setRotationLoading(true);
    try {
      // 1. Fetch current salt
      const { data: saltData } = await api.get('/auth/salt', { params: { email: user.email } });

      // 2. Derive current Key B to decrypt entries
      const { keyB: currentKeyB } = await deriveKeys(currentPassword, saltData.salt);

      // 3. Decrypt all entries locally
      const decryptedEntries = [];
      for (const entry of allEntries) {
        try {
          const parsed = JSON.parse(entry.encryptedData);
          const plaintext = await decrypt(parsed.ciphertext, parsed.iv, parsed.tag, currentKeyB);
          decryptedEntries.push({ ...entry, plaintext });
        } catch (err) {
          throw new Error('Current master password incorrect or decryption failed.');
        }
      }

      // 4. Generate new salt and derive new keys
      const newSalt = generateSalt();
      const { keyA: newKeyA, keyB: newKeyB, keyBBytes: newKeyBBytes } = await deriveKeysWithRaw(newPassword, newSalt);
      const newAuthHash = await hashKeyA(newKeyA);

      // 5. Re-encrypt all entries under newKeyB
      const reEncryptedEntries = [];
      for (const entry of decryptedEntries) {
        const encrypted = await encrypt(entry.plaintext, newKeyB);
        reEncryptedEntries.push({
          serviceName: entry.serviceName,
          username: entry.username,
          category: entry.category,
          encryptedData: JSON.stringify(encrypted),
        });
      }

      // 6. Generate new recovery key and encrypt new Key B
      const newRecKey = generateRecoveryKey();
      const { encryptedKeyB: newEncKeyB, recoveryIv: newRecIv } = await encryptKeyBBytesForRecovery(newKeyBBytes, newRecKey);
      const newEncryptedKeyB = JSON.stringify({ data: newEncKeyB, iv: newRecIv });

      // 7. Post transactional update to server
      await api.post('/auth/rotate-key', {
        newAuthHash,
        newSalt,
        newEncryptedKeyB,
        encryptedEntries: reEncryptedEntries,
      });

      setRotationRecoveryKey(newRecKey);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Master password rotated successfully! Save your new recovery key.');
    } catch (err) {
      toast.error(err.message || 'Key rotation failed');
    } finally {
      setRotationLoading(false);
    }
  };

  const handleRegenerateRecovery = async () => {
    const password = prompt('Please enter your master password to verify:');
    if (!password) return;

    setRegenerateLoading(true);
    try {
      const { data: saltData } = await api.get('/auth/salt', { params: { email: user.email } });
      const { keyBBytes } = await deriveKeysWithRaw(password, saltData.salt);

      const newRecKey = generateRecoveryKey();
      const { encryptedKeyB: newEncKeyB, recoveryIv: newRecIv } = await encryptKeyBBytesForRecovery(keyBBytes, newRecKey);
      const newEncryptedKeyB = JSON.stringify({ data: newEncKeyB, iv: newRecIv });

      await api.post('/auth/regenerate-recovery', { newEncryptedKeyB });

      setRegenerateRecoveryKeyVal(newRecKey);
      toast.success('Recovery key regenerated successfully! Save this new key.');
    } catch (err) {
      toast.error('Failed to regenerate recovery key. Please check your password.');
    } finally {
      setRegenerateLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">Weave</div>
          <div className="sidebar-tagline">Zero-knowledge vault</div>
        </div>
        <nav className="sidebar-nav">
          <button className="sidebar-item" onClick={() => navigate('/')}>
            ← Back to Vault
          </button>
        </nav>
      </aside>

      <main className="main-content">
        <header className="main-header">
          <h1 className="main-header-title">⚙️ Settings</h1>
        </header>

        <div className="main-body" style={{ maxWidth: 640 }}>
          {/* Account Info */}
          <div className="settings-section">
            <h3 className="settings-section-title">👤 Account</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--accent-gradient)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--text-lg)',
                  fontWeight: 600,
                  color: 'white',
                }}
              >
                {user?.email?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <p style={{ fontWeight: 500 }}>{user?.email}</p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  Email verified ✓
                </p>
              </div>
            </div>
          </div>

          {/* 2FA */}
          <div className="settings-section">
            <h3 className="settings-section-title">🔐 Two-Factor Authentication</h3>
            <p className="settings-section-desc">
              Add an extra layer of security. You'll need your authenticator app
              (Google Authenticator, Authy, 1Password) every time you log in.
            </p>

            {twoFAEnabled ? (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--success-subtle)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  <span style={{ color: 'var(--success)' }}>✓ 2FA is enabled</span>
                </div>
                <div className="form-field" style={{ marginBottom: 'var(--space-3)' }}>
                  <label className="form-label">Enter TOTP code to disable</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="6-digit code"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value)}
                    maxLength={6}
                    style={{ maxWidth: 200, fontFamily: 'var(--font-mono)' }}
                  />
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={handle2FADisable}
                  disabled={loading || disableCode.length !== 6}
                >
                  Disable 2FA
                </button>
              </div>
            ) : qrCode ? (
              <div className="animate-fade-in-up">
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
                  Scan this QR code with your authenticator app:
                </p>
                <div className="twofa-qr">
                  <img src={qrCode} alt="2FA QR Code" />
                </div>
                <div style={{ textAlign: 'center', margin: 'var(--space-3) 0' }}>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    Or enter manually: <code className="mono" style={{ color: 'var(--accent-primary)' }}>{totpSecret}</code>
                  </p>
                </div>
                <div className="form-field" style={{ marginBottom: 'var(--space-3)' }}>
                  <label className="form-label">Enter the 6-digit code to verify</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    maxLength={6}
                    style={{ maxWidth: 200, fontFamily: 'var(--font-mono)', textAlign: 'center', fontSize: 'var(--text-lg)' }}
                    autoFocus
                  />
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handle2FAVerify}
                    disabled={loading || totpCode.length !== 6}
                  >
                    {loading ? 'Verifying...' : 'Verify & Enable'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setQrCode(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={handle2FASetup} disabled={loading}>
                {loading ? 'Setting up...' : 'Enable 2FA'}
              </button>
            )}
          </div>

          {/* Security Info */}
          <div className="settings-section">
            <h3 className="settings-section-title">🛡️ Security</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  Encryption
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)' }}>
                  AES-256-GCM ✓
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  Key Derivation
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)' }}>
                  Argon2id ✓
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  Zero-Knowledge
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)' }}>
                  Server never sees plaintext ✓
                </span>
              </div>
            </div>
          </div>

          {/* Master Password Rotation & Leak Recovery */}
          <div className="settings-section">
            <h3 className="settings-section-title">🔄 Rotate Master Password</h3>
            <p className="settings-section-desc">
              If you suspect your master password has been compromised, you can rotate it.
              All vault credentials will be decrypted and re-encrypted locally with a new key.
            </p>

            {rotationRecoveryKey ? (
              <div className="recovery-key-display" style={{ marginTop: 'var(--space-4)' }}>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--success)', marginBottom: 'var(--space-2)' }}>
                  ✓ Key rotated successfully! Save your new recovery key:
                </p>
                <div className="recovery-key-value" style={{ fontSize: '18px', padding: '12px' }}>{rotationRecoveryKey}</div>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 'var(--space-3)' }}
                  onClick={() => {
                    navigator.clipboard.writeText(rotationRecoveryKey);
                    toast.success('Copied new recovery key');
                  }}
                >
                  📋 Copy Key
                </button>
              </div>
            ) : (
              <form onSubmit={handleRotateKey} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                <div className="form-field">
                  <label className="form-label">Current Master Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">New Master Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">Confirm New Master Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={rotationLoading}>
                  {rotationLoading ? 'Rotating...' : 'Rotate Key & Re-encrypt Vault'}
                </button>
              </form>
            )}
          </div>

          {/* Regenerate Recovery Key */}
          <div className="settings-section">
            <h3 className="settings-section-title">🔑 Regenerate Recovery Key</h3>
            <p className="settings-section-desc">
              Lost your recovery key? Generate a new one. This will re-encrypt your master key B with a fresh offline recovery key.
            </p>

            {regenerateRecoveryKeyVal ? (
              <div className="recovery-key-display" style={{ marginTop: 'var(--space-4)' }}>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--success)', marginBottom: 'var(--space-2)' }}>
                  ✓ New recovery key generated:
                </p>
                <div className="recovery-key-value" style={{ fontSize: '18px', padding: '12px' }}>{regenerateRecoveryKeyVal}</div>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 'var(--space-3)' }}
                  onClick={() => {
                    navigator.clipboard.writeText(regenerateRecoveryKeyVal);
                    toast.success('Copied recovery key');
                  }}
                >
                  📋 Copy Key
                </button>
              </div>
            ) : (
              <button className="btn btn-secondary" onClick={handleRegenerateRecovery} disabled={regenerateLoading} style={{ marginTop: 'var(--space-2)' }}>
                {regenerateLoading ? 'Generating...' : 'Generate New Recovery Key'}
              </button>
            )}
          </div>

          {/* Danger Zone */}
          <div className="settings-section settings-danger-zone">
            <h3 className="settings-section-title">⚠️ Danger Zone</h3>
            <p className="settings-section-desc">
              These actions are irreversible. Proceed with extreme caution.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button className="btn btn-danger" onClick={handleDeleteAccount}>
                Delete Account
              </button>
              <button className="btn btn-secondary" onClick={handleRevokeSessions}>
                Sign Out Everywhere
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
