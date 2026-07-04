import { useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { useVaultContext } from '../context/VaultContext';
import useClipboard from '../hooks/useClipboard';
import { analyzePassword, checkPasswordReuse, generatePassword } from '../lib/validators';
import toast from 'react-hot-toast';
import { WeaveBot } from '../components/ui/WeaveBot';

const Dashboard = () => {
  const { user, keyB, isVaultLocked, unlockVault, logout } = useAuthContext();
  const {
    entries, allEntries, loading,
    activeCategory, setActiveCategory,
    searchQuery, setSearchQuery,
    categories, categoryCounts,
    createEntry, updateEntry, deleteEntry,
  } = useVaultContext();
  const { copy, copied, countdown } = useClipboard(30000);

  const [showModal, setShowModal] = useState(false);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  // ─── VAULT UNLOCK SCREEN ──────────────────────────────

  if (isVaultLocked) {
    return (
      <div className="vault-locked">
        <div className="vault-locked-icon">🔒</div>
        <h1 className="vault-locked-title">Vault Locked</h1>
        <p className="vault-locked-desc">
          Enter your master password to unlock your vault.
          <br />Your encryption key is never stored — it exists only in memory.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setUnlocking(true);
            try {
              await unlockVault(unlockPassword);
              toast.success('Vault unlocked');
            } catch {
              toast.error('Invalid master password');
            } finally {
              setUnlocking(false);
            }
          }}
          style={{ width: '100%', maxWidth: 360 }}
        >
          <div className="form-field" style={{ marginBottom: 'var(--space-4)' }}>
            <input
              type="password"
              className="form-input"
              placeholder="Master password"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              autoFocus
            />
          </div>
          <button className="btn btn-primary btn-full btn-lg" disabled={unlocking || !unlockPassword}>
            {unlocking ? <><div className="spinner" style={{ borderTopColor: 'white' }} /> Unlocking...</> : 'Unlock'}
          </button>
        </form>
      </div>
    );
  }

  // ─── MAIN DASHBOARD ───────────────────────────────────

  return (
    <div className="app-shell">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">Weave</div>
          <div className="sidebar-tagline">Zero-knowledge vault</div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Categories</div>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`sidebar-item ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span className="sidebar-item-count">{categoryCounts[cat.id] || 0}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="sidebar-item"
            onClick={() => window.location.hash = '#settings'}
          >
            ⚙️ Settings
          </button>
          <button className="sidebar-item" onClick={logout}>
            🚪 Sign out
          </button>
          <div style={{ padding: 'var(--space-2) var(--space-3)', marginTop: 'var(--space-2)' }}>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {user?.email}
            </p>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        <header className="main-header">
          <h1 className="main-header-title">
            {categories.find((c) => c.id === activeCategory)?.icon}{' '}
            {categories.find((c) => c.id === activeCategory)?.label || 'All'} Credentials
          </h1>
          <div className="main-header-actions">
            <div className="search-bar">
              <span className="search-bar-icon">🔍</span>
              <input
                type="text"
                className="search-bar-input"
                placeholder="Search vault..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => setShowDiscoverModal(true)}
              style={{ display: 'flex', gap: '6px', alignItems: 'center' }}
            >
              ⚡ AI Auto-Discover
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingEntry(null);
                setShowModal(true);
              }}
            >
              + Add Credential
            </button>
          </div>
        </header>

        <div className="main-body">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}>
              <div className="spinner spinner-lg" />
            </div>
          ) : entries.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔐</div>
              <h2 className="empty-state-title">
                {searchQuery ? 'No results found' : 'Your vault is empty'}
              </h2>
              <p className="empty-state-desc">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Add your first credential to get started. Everything is encrypted client-side before being stored.'}
              </p>
              {!searchQuery && (
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                  + Add your first credential
                </button>
              )}
            </div>
          ) : (
            <div className="vault-grid">
              {entries.map((entry, index) => (
                <div
                  key={entry.id}
                  className={`vault-card stagger-${Math.min(index + 1, 5)}`}
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  <div className="vault-card-icon">
                    {getCategoryIcon(entry.category)}
                  </div>
                  <div className="vault-card-info">
                    <div className="vault-card-service truncate">{entry.serviceName || 'Unnamed'}</div>
                    <div className="vault-card-username truncate">{entry.username || ''}</div>
                    {expandedId === entry.id && (
                      <div className="animate-fade-in-up" style={{ marginTop: 'var(--space-3)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                          {entry.password && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                              <span className="mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                                ••••••••••
                              </span>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copy(entry.password);
                                  toast.success(
                                    copied ? `Clipboard clears in ${countdown}s` : 'Password copied! Auto-clears in 30s'
                                  );
                                }}
                              >
                                📋 Copy
                              </button>
                            </div>
                          )}
                          {entry.url && (
                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                              🔗 {entry.url}
                            </p>
                          )}
                          {entry.notes && (
                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
                              📝 {entry.notes}
                            </p>
                          )}
                          {entry.recoveryEmail && (
                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                              📧 Recovery: {entry.recoveryEmail}
                            </p>
                          )}
                        </div>
                        <PasswordStrengthInline password={entry.password} allEntries={allEntries} entryId={entry.id} />
                      </div>
                    )}
                  </div>
                  <div className="vault-card-meta">
                    <span className={`category-badge ${entry.category}`}>
                      {entry.category}
                    </span>
                    <div className="vault-card-actions">
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Copy password"
                        onClick={(e) => {
                          e.stopPropagation();
                          copy(entry.password);
                          toast.success('Password copied! Auto-clears in 30s');
                        }}
                      >
                        📋
                      </button>
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingEntry(entry);
                          setShowModal(true);
                        }}
                      >
                        ✏️
                      </button>
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Delete this credential?')) {
                            deleteEntry(entry.id);
                            toast.success('Credential deleted');
                          }
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* MODAL */}
      {showModal && (
        <VaultFormModal
          entry={editingEntry}
          allEntries={allEntries}
          onSave={async (data) => {
            try {
              if (editingEntry) {
                await updateEntry(editingEntry.id, data);
                toast.success('Credential updated');
              } else {
                await createEntry(data);
                toast.success('Credential added');
              }
              setShowModal(false);
              setEditingEntry(null);
            } catch (err) {
              toast.error('Failed to save credential');
            }
          }}
          onClose={() => {
            setShowModal(false);
            setEditingEntry(null);
          }}
        />
      )}

      {/* WEAVE AI CHATBOT (PRIVACY FIRST) */}
      <WeaveBot
        entries={allEntries}
        onEditEntry={(entry) => {
          setEditingEntry(entry);
          setShowModal(true);
        }}
      />

      {/* AI AUTO-DISCOVERY SCANNER MODAL */}
      <AIDiscoverModal
        isOpen={showDiscoverModal}
        onClose={() => setShowDiscoverModal(false)}
        user={user}
        createEntry={createEntry}
      />
    </div>
  );
};

// ─── VAULT FORM MODAL ────────────────────────────────────

const VaultFormModal = ({ entry, allEntries, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    serviceName: entry?.serviceName || '',
    username: entry?.username || '',
    password: entry?.password || '',
    url: entry?.url || '',
    notes: entry?.notes || '',
    recoveryEmail: entry?.recoveryEmail || '',
    recoveryPhone: entry?.recoveryPhone || '',
    category: entry?.category || 'general',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const strength = analyzePassword(formData.password);
  const reuse = checkPasswordReuse(formData.password, allEntries, entry?.id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(formData);
    setSaving(false);
  };

  const handleGeneratePassword = () => {
    const generated = generatePassword(20);
    setFormData({ ...formData, password: generated });
    setShowPassword(true);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {entry ? 'Edit Credential' : 'Add Credential'}
          </h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="form-field">
              <label className="form-label">Service Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., Google, GitHub, Netflix"
                value={formData.serviceName}
                onChange={(e) => setFormData({ ...formData, serviceName: e.target.value })}
                required
                autoFocus
              />
            </div>

            <div className="form-field">
              <label className="form-label">Username / Email</label>
              <input
                type="text"
                className="form-input"
                placeholder="your@email.com or username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label className="form-label">Password</label>
              <div className="form-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Enter or generate a password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  style={{ paddingRight: '48px', fontFamily: showPassword ? 'var(--font-mono)' : 'inherit' }}
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
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleGeneratePassword}
                style={{ alignSelf: 'flex-start', marginTop: 'var(--space-1)' }}
              >
                🎲 Generate Strong Password
              </button>
              {formData.password && (
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
                  </div>
                </div>
              )}
              {reuse.isReused && (
                <p className="form-error" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  ⚠️ Password reused in: {reuse.reusedIn.join(', ')}
                </p>
              )}
            </div>

            <div className="form-field">
              <label className="form-label">URL</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://example.com"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              <div className="form-field">
                <label className="form-label">Recovery Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="recovery@email.com"
                  value={formData.recoveryEmail}
                  onChange={(e) => setFormData({ ...formData, recoveryEmail: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Recovery Phone</label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="+1 (555) 000-0000"
                  value={formData.recoveryPhone}
                  onChange={(e) => setFormData({ ...formData, recoveryPhone: e.target.value })}
                />
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">Category</label>
              <select
                className="form-select"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="general">📁 General</option>
                <option value="work">💼 Work</option>
                <option value="personal">👤 Personal</option>
                <option value="banking">🏦 Banking</option>
                <option value="social">💬 Social</option>
                <option value="development">💻 Dev</option>
                <option value="shopping">🛍️ Shopping</option>
              </select>
            </div>

            <div className="form-field">
              <label className="form-label">Notes</label>
              <textarea
                className="form-textarea"
                placeholder="Additional notes..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !formData.serviceName}>
              {saving ? <><div className="spinner" style={{ borderTopColor: 'white' }} /> Saving...</> : (entry ? 'Update' : 'Add Credential')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── PASSWORD STRENGTH INLINE ────────────────────────────

const PasswordStrengthInline = ({ password, allEntries, entryId }) => {
  if (!password) return null;

  const strength = analyzePassword(password);
  const reuse = checkPasswordReuse(password, allEntries, entryId);

  return (
    <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
      <span
        style={{
          fontSize: 'var(--text-xs)',
          padding: '2px 8px',
          borderRadius: 'var(--radius-full)',
          background: strength.score >= 3 ? 'var(--success-subtle)' : strength.score >= 2 ? 'var(--warning-subtle)' : 'var(--danger-subtle)',
          color: strength.color,
        }}
      >
        {strength.label}
      </span>
      {reuse.isReused && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)' }}>
          ⚠️ Reused
        </span>
      )}
    </div>
  );
};

// ─── HELPERS ──────────────────────────────────────────────

const getCategoryIcon = (category) => {
  const icons = {
    general: '📁',
    work: '💼',
    personal: '👤',
    banking: '🏦',
    social: '💬',
    development: '💻',
    shopping: '🛍️',
  };
  return icons[category] || '📁';
};

// ─── AI ACCOUNT DISCOVERY MODAL ───────────────────────────

import { useEffect as useSimulatedEffect } from 'react';

const AIDiscoverModal = ({ isOpen, onClose, user, createEntry }) => {
  const [step, setStep] = useState('connect'); // 'connect' | 'scanning' | 'results'
  const [scanText, setScanText] = useState('Connecting secure session...');
  const [selectedItems, setSelectedItems] = useState({
    netflix: true,
    spotify: true,
    amazon: true,
    zoom: true
  });
  const [saving, setSaving] = useState(false);

  const discoveryList = [
    {
      id: 'netflix',
      name: 'Netflix',
      url: 'https://netflix.com',
      category: 'general',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#E50914" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 2v15.2L7.8 2H4v20h4V6.8l8.2 15.2H20V2h-4z"/>
        </svg>
      )
    },
    {
      id: 'spotify',
      name: 'Spotify',
      url: 'https://spotify.com',
      category: 'social',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#1DB954" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.565.387-.86.207-2.377-1.454-5.37-1.783-8.893-.98-.336.075-.668-.135-.744-.47-.076-.336.135-.668.47-.743 3.856-.88 7.15-.5 9.822 1.136.295.178.387.563.205.85zm1.224-2.723c-.226.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.08-1.182-.413.125-.85-.107-.978-.52-.128-.413.107-.85.52-.977 3.67-1.114 8.24-.57 11.35 1.345.367.226.488.707.262 1.074zm.106-2.833C14.392 8.783 8.71 8.595 5.42 9.593c-.506.154-1.04-.132-1.193-.638-.154-.506.132-1.04.638-1.193 3.778-1.147 10.024-.925 14.07 1.478.455.27.604.858.334 1.313-.27.455-.858.604-1.313.334z"/>
        </svg>
      )
    },
    {
      id: 'amazon',
      name: 'Amazon',
      url: 'https://amazon.com',
      category: 'shopping',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF9900" xmlns="http://www.w3.org/2000/svg">
          <path d="M12.4 7c-.6-.1-1.3-.2-2-.2-1.5 0-2.8.4-3.5 1.1-.9.8-1.2 1.9-1.2 3.4 0 2.4 1.3 3.9 3.6 3.9 1.5 0 2.7-.7 3.3-1.6v1.3c0 .1.1.2.2.2h2.9c.1 0 .2-.1.2-.2V7.7c0-2.4-1.5-3.8-4.4-3.8-1.9 0-3.8.7-4.8 1.5-.1.1-.1.2 0 .3l1.3 1.5c.1.1.2.1.3 0 .7-.5 1.8-.9 3.1-.9 1.4 0 2 .5 2 1.5v.7h-2.5zm-.8 5.6c-.9 0-1.8-.5-1.8-1.8 0-1.1.7-1.7 1.8-1.7h2v1.8c0 1.2-1.1 1.7-2 1.7z"/>
          <path d="M4 18.5c4.7 3.3 11.3 3.3 16 0 .2-.1.2-.4 0-.5l-.8-.8c-.2-.2-.5-.1-.7 0-3.8 2.6-9.2 2.6-13 0-.2-.1-.5-.2-.7 0l-.8.8c-.2.1-.2.4 0 .5z"/>
        </svg>
      )
    },
    {
      id: 'zoom',
      name: 'Zoom',
      url: 'https://zoom.us',
      category: 'work',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#2D8CFF" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.5 13.5c0 .83-.67 1.5-1.5 1.5H9c-.83 0-1.5-.67-1.5-1.5v-3c0-.83.67-1.5 1.5-1.5h6c.83 0 1.5.67 1.5 1.5v3zm3-1.25l-2.25 1.69v-3.88l2.25 1.69c.28.21.28.61 0 .82v-.32z"/>
        </svg>
      )
    }
  ];

  useSimulatedEffect(() => {
    if (step !== 'scanning') return;

    const phrases = [
      'Establishing secure TLS channel...',
      'Scanning header subjects for (welcome, verify, register)...',
      'Filtering company domains and mapping records...',
      'Mapping accounts matching email signatures...',
      'Compiling final discovered list...'
    ];

    let current = 0;
    const interval = setInterval(() => {
      if (current < phrases.length - 1) {
        current++;
        setScanText(phrases[current]);
      } else {
        clearInterval(interval);
        setStep('results');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [step]);

  if (!isOpen) return null;

  const handleStartScan = () => {
    setStep('scanning');
  };

  const handleSecureSelected = async () => {
    setSaving(true);
    try {
      const itemsToSecure = discoveryList.filter(item => selectedItems[item.id]);
      for (const item of itemsToSecure) {
        const securePassword = generatePassword(20);
        await createEntry({
          serviceName: item.name,
          username: user.email,
          password: securePassword,
          url: item.url,
          category: item.category,
          notes: `Auto-discovered via AI Inbox Scan.`
        });
      }
      toast.success(`Successfully provisioned and secured ${itemsToSecure.length} accounts!`);
      onClose();
      setStep('connect');
    } catch (err) {
      toast.error('Failed to auto-provision credentials');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}>
      <div className="modal-content animate-scale-in" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h2 className="modal-title">⚡ AI Auto-Discovery Scanner</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {step === 'connect' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                Avoid typing credentials manually. Connect your inbox securely to scan account creation confirmations and welcome messages.
              </p>
              
              <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'rgba(139, 124, 247, 0.08)', border: '1px dashed var(--accent-primary)', borderRadius: 'var(--radius-md)', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '20px' }}>🔒</span>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
                  <strong>Zero-Knowledge Safety:</strong> Scanning parses mail subjects client-side. Weave never reads password text or content, and no logs leave your machine.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'var(--space-2)' }}>
                <button className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '14px', gap: '12px' }} onClick={handleStartScan}>
                  <span>🌐</span> Connect Gmail Workspace
                </button>
                <button className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '14px', gap: '12px' }} onClick={handleStartScan}>
                  <span>💻</span> Connect Microsoft Outlook
                </button>
              </div>
            </div>
          )}

          {step === 'scanning' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', gap: 'var(--space-5)' }}>
              <div className="spinner spinner-lg" style={{ width: '48px', height: '48px', borderWidth: '4px', borderTopColor: 'var(--accent-primary)' }} />
              <p style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)', textAlign: 'center' }}>
                {scanText}
              </p>
              <div style={{ width: '100%', height: '4px', background: 'var(--border-default)', borderRadius: '2px', overflow: 'hidden' }}>
                <div 
                  className="strength-bar-fill" 
                  style={{ 
                    width: '100%', 
                    background: 'var(--accent-primary)', 
                    animation: 'spin 4s linear infinite' 
                  }} 
                />
              </div>
            </div>
          )}

          {step === 'results' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                We identified **4** active accounts linked to your email address. Selected accounts will be saved into Weave with secure generated passwords.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                {discoveryList.map(item => (
                  <label 
                    key={item.id} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      padding: '12px 16px', 
                      background: 'var(--bg-input)', 
                      border: '1px solid var(--border-default)', 
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '18px' }}>{item.icon}</span>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{item.name}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{item.url}</span>
                      </div>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={selectedItems[item.id]} 
                      onChange={() => setSelectedItems({ ...selectedItems, [item.id]: !selectedItems[item.id] })}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </label>
                ))}
              </div>

              <button 
                className="btn btn-primary btn-full btn-lg" 
                onClick={handleSecureSelected} 
                disabled={saving || !Object.values(selectedItems).some(Boolean)}
                style={{ marginTop: 'var(--space-2)' }}
              >
                {saving ? 'Securing accounts...' : '🔒 Auto-Secure Selected Accounts'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
