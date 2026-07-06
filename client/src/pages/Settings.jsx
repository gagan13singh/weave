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
  const { allEntries, createEntry } = useVaultContext();
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
  // Inline password for recovery-key regeneration (replaces prompt())
  const [regenPassword, setRegenPassword] = useState('');
  const [showRegenForm, setShowRegenForm] = useState(false);
  // CSV export warning dialog
  const [showExportWarning, setShowExportWarning] = useState(false);

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

      // 3. Decrypt all entries locally using the separate iv/tag fields from VaultContext
      const decryptedEntries = [];
      for (const entry of allEntries) {
        try {
          // VaultContext stores raw entries with entry.encryptedData, entry.iv, entry.tag as top-level hex strings
          // We need the raw entries from the vault, which have the correct structure
          // allEntries are already decrypted by VaultContext — re-encrypt them directly
          decryptedEntries.push(entry);
        } catch (err) {
          throw new Error('Failed to process vault entries.');
        }
      }

      // 4. Generate new salt and derive new keys
      const newSalt = generateSalt();
      const { keyA: newKeyA, keyB: newKeyB, keyBBytes: newKeyBBytes } = await deriveKeysWithRaw(newPassword, newSalt);
      const newAuthHash = await hashKeyA(newKeyA);

      // 5. Re-encrypt all entries under newKeyB
      // allEntries from VaultContext are the decrypted plaintext objects — re-encrypt them
      const reEncryptedEntries = [];
      for (const entry of decryptedEntries) {
        // Strip metadata, keep only plaintext fields for encryption
        const { id, createdAt, updatedAt, userId, category, url, _decryptionFailed, ...plaintextData } = entry;
        if (_decryptionFailed) continue; // Skip entries that couldn't be decrypted
        const { ciphertext, iv: newIv, tag: newTag } = await encrypt(plaintextData, newKeyB);
        reEncryptedEntries.push({
          encryptedData: ciphertext,
          iv: newIv,
          tag: newTag,
          category: category || 'general',
          url: url || null,
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

  const handleRegenerateRecovery = async (e) => {
    e.preventDefault();
    if (!regenPassword) return;

    setRegenerateLoading(true);
    try {
      const { data: saltData } = await api.get('/auth/salt', { params: { email: user.email } });
      const { keyBBytes } = await deriveKeysWithRaw(regenPassword, saltData.salt);

      const newRecKey = generateRecoveryKey();
      const { encryptedKeyB: newEncKeyB, recoveryIv: newRecIv } = await encryptKeyBBytesForRecovery(keyBBytes, newRecKey);
      const newEncryptedKeyB = JSON.stringify({ data: newEncKeyB, iv: newRecIv });

      await api.post('/auth/regenerate-recovery', { newEncryptedKeyB });

      setRegenerateRecoveryKeyVal(newRecKey);
      setRegenPassword('');
      setShowRegenForm(false);
      toast.success('Recovery key regenerated successfully! Save this new key.');
    } catch (err) {
      toast.error('Failed to regenerate recovery key. Please check your password.');
    } finally {
      setRegenerateLoading(false);
    }
  };

  const [importing, setImporting] = useState(false);

  const handleCsvImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) {
          toast.error('CSV file is empty');
          setImporting(false);
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
        const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('title'));
        const urlIdx = headers.findIndex(h => h.includes('url') || h.includes('website'));
        const userIdx = headers.findIndex(h => h.includes('username') || h.includes('user') || h.includes('email'));
        const passIdx = headers.findIndex(h => h.includes('password') || h.includes('pass'));
        const notesIdx = headers.findIndex(h => h.includes('note') || h.includes('desc'));

        if (nameIdx === -1 || passIdx === -1) {
          toast.error('CSV must contain name/title and password columns');
          setImporting(false);
          return;
        }

        let count = 0;
        let skipped = 0;
        let errors = 0;
        const duplicateNames = [];

        for (let i = 1; i < lines.length; i++) {
          try {
            const line = lines[i].trim();
            if (!line) continue;
            
            const cells = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/^"|"$/g, ''));
            if (cells.length <= Math.max(nameIdx, passIdx)) continue;

            const name = cells[nameIdx];
            const password = cells[passIdx];
            if (!name || !password) continue;

            const url = urlIdx !== -1 ? cells[urlIdx] : '';
            const username = userIdx !== -1 ? cells[userIdx] : '';

            // Check if exact duplicate already exists in the local vault
            const exists = allEntries.find(
              e => e.serviceName.toLowerCase().trim() === name.toLowerCase().trim() &&
                   (e.username || '').toLowerCase().trim() === (username || '').toLowerCase().trim()
            );

            if (exists) {
              if (exists.password === password) {
                skipped++;
                duplicateNames.push(name);
                continue; // Skip exact matches to avoid cluttering
              }
            }

            const notes = notesIdx !== -1 ? cells[notesIdx] : 'Imported via CSV';

            await createEntry({
              serviceName: name,
              username,
              password,
              url,
              category: 'general',
              notes
            });
            count++;
          } catch (rowErr) {
            errors++;
            console.error(`CSV row parsing issue at index ${i}:`, rowErr);
          }
        }
        if (skipped > 0) {
          const namesStr = duplicateNames.slice(0, 5).join(', ');
          const overflow = duplicateNames.length > 5 ? ` and ${duplicateNames.length - 5} more` : '';
          toast.success(`Successfully imported ${count} credentials. Skipped duplicates found for: ${namesStr}${overflow}.`, { duration: 7000 });
        } else {
          toast.success(`Successfully imported ${count} credentials from CSV!`);
        }
        if (errors > 0) {
          toast.error(`Warning: Skipped ${errors} unparseable lines.`);
        }
      } catch (err) {
        toast.error('Failed to parse CSV file');
      } finally {
        setImporting(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const doExportCsv = () => {
    try {
      const headers = ['name', 'url', 'username', 'password', 'notes', 'category'];
      const csvRows = [headers.join(',')];

      for (const entry of allEntries) {
        const row = [
          `"${(entry.serviceName || '').replace(/"/g, '""')}"`,
          `"${(entry.url || '').replace(/"/g, '""')}"`,
          `"${(entry.username || '').replace(/"/g, '""')}"`,
          `"${(entry.password || '').replace(/"/g, '""')}"`,
          `"${(entry.notes || '').replace(/"/g, '""')}"`,
          `"${(entry.category || '').replace(/"/g, '""')}"`
        ];
        csvRows.push(row.join(','));
      }

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `weave_vault_export_UNENCRYPTED_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setShowExportWarning(false);
      toast.success('Vault exported. Store this file securely — it contains plaintext passwords.');
    } catch (err) {
      toast.error('Failed to export vault');
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
            ) : showRegenForm ? (
              <form onSubmit={handleRegenerateRecovery} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)', maxWidth: 360 }}>
                <div className="form-field">
                  <label className="form-label">Master Password (to verify identity)</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter your master password"
                    value={regenPassword}
                    onChange={(e) => setRegenPassword(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={regenerateLoading || !regenPassword}>
                    {regenerateLoading ? 'Generating...' : 'Generate New Key'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowRegenForm(false); setRegenPassword(''); }}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button className="btn btn-secondary" onClick={() => setShowRegenForm(true)} style={{ marginTop: 'var(--space-2)' }}>
                Generate New Recovery Key
              </button>
            )}
          </div>

          {/* Import / Export Vault */}
          <div className="settings-section">
            <h3 className="settings-section-title">📥 Import / Export Data</h3>
            <p className="settings-section-desc">
              Import credentials directly from your browser's Google Chrome CSV export file, or export your decrypted vault safely as a local backup.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
              <label className="btn btn-secondary" style={{ cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center' }}>
                {importing ? 'Importing CSV...' : '📂 Import CSV File'}
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleCsvImport} 
                  disabled={importing} 
                  style={{ display: 'none' }} 
                />
              </label>
              <button className="btn btn-secondary" onClick={() => setShowExportWarning(true)} disabled={allEntries.length === 0} style={{ borderColor: 'rgba(251,191,36,0.3)', color: 'var(--warning)' }}>
                ⚠️ Export Vault (Plaintext CSV)
              </button>
            </div>
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

      {/* CSV Export Warning Dialog */}
      {showExportWarning && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content animate-scale-in" style={{ maxWidth: 420, border: '1px solid rgba(251,191,36,0.4)', background: 'var(--bg-secondary)' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: 'var(--warning)' }}>⚠️ Plaintext Export Warning</h2>
              <button className="modal-close" onClick={() => setShowExportWarning(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ padding: '14px 16px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 'var(--radius-md)' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
                  <strong>This will create an UNENCRYPTED file</strong> containing all your passwords in plaintext. Anyone who obtains this file — through email, cloud sync, screen recording, or physical access — can read every password.
                </p>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Weave's entire security model is zero-knowledge. This export permanently breaks that guarantee for the exported copy. Only proceed if you need to migrate to another password manager or create a secure offline backup.
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowExportWarning(false)}>Cancel</button>
                <button className="btn btn-danger" style={{ flex: 1 }} onClick={doExportCsv}>I Understand — Export Anyway</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
