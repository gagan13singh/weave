import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useVaultContext } from '../context/VaultContext';
import useClipboard from '../hooks/useClipboard';
import { analyzePassword, checkPasswordReuse, generatePassword, findSimilarPasswords } from '../lib/validators';
import { buildRecoveryGraph, blastRadiusBFS, computeDegreeCentrality, generatePanicPlan } from '../lib/graphEngine';
import { semanticSearch } from '../lib/nlSearch';
import { encryptVaultForTransfer, decryptVaultTransfer, generateTransferPIN } from '../lib/vaultTransfer';
import QRCode from 'qrcode';
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
    verifyMasterPassword,
  } = useVaultContext();
  const { copy, copied, countdown } = useClipboard(30000);
  const navigate = useNavigate();

  const [showModal, setShowModal] = useState(false);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  const [repromptModal, setRepromptModal] = useState({
    isOpen: false,
    onSuccess: null,
    title: 'Unlock Sensitive Action'
  });
  const [revealId, setRevealId] = useState(null);

  const requestReprompt = (actionCallback, title = 'Confirm Master Password') => {
    setRepromptModal({
      isOpen: true,
      onSuccess: actionCallback,
      title
    });
  };

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
            className={`sidebar-item ${activeCategory === 'identity' ? 'active' : ''}`}
            onClick={() => setActiveCategory('identity')}
            style={{ marginBottom: '6px' }}
          >
            <span>🔗</span>
            <span>Identity Hub</span>
          </button>
          <button
            className={`sidebar-item ${activeCategory === 'checkup' ? 'active' : ''}`}
            onClick={() => setActiveCategory('checkup')}
            style={{ marginBottom: '6px' }}
          >
            <span>🛡️</span>
            <span>Password Checkup</span>
          </button>
          <button
            className={`sidebar-item ${activeCategory === 'panic' ? 'active' : ''}`}
            onClick={() => setActiveCategory('panic')}
            style={{ marginBottom: '6px' }}
          >
            <span>🚨</span>
            <span>Panic Mode</span>
          </button>
          <button
            className={`sidebar-item ${activeCategory === 'transfer' ? 'active' : ''}`}
            onClick={() => setActiveCategory('transfer')}
            style={{ marginBottom: '6px' }}
          >
            <span>📲</span>
            <span>Vault Transfer</span>
          </button>
          <button
            className="sidebar-item"
            onClick={() => navigate('/settings')}
            style={{ marginBottom: '6px' }}
          >
            <span>⚙️</span>
            <span>Settings</span>
          </button>
          <button className="sidebar-item" onClick={logout}>
            <span>🚪</span>
            <span>Sign out</span>
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
            {activeCategory === 'checkup' ? (
              <>🛡️ Password Checkup</>
            ) : activeCategory === 'identity' ? (
              <>🔗 Identity & Recovery Hub</>
            ) : activeCategory === 'panic' ? (
              <>🚨 Panic Mode — Breach Response</>
            ) : activeCategory === 'transfer' ? (
              <>📲 Vault Transfer</>
            ) : (
              <>
                {categories.find((c) => c.id === activeCategory)?.icon}{' '}
                {categories.find((c) => c.id === activeCategory)?.label || 'All'} Credentials
              </>
            )}
          </h1>
          <div className="main-header-actions">
            <div className="search-bar">
              <span className="search-bar-icon">🔍</span>
              <input
                type="text"
                className="search-bar-input"
                placeholder={'Try "college wifi" or "streaming service"...'}
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
          {activeCategory === 'checkup' ? (
            <PasswordCheckupView
              allEntries={allEntries}
              onEditEntry={(entry) => {
                setEditingEntry(entry);
                setShowModal(true);
              }}
              updateEntry={updateEntry}
              deleteEntry={deleteEntry}
              requestReprompt={requestReprompt}
            />
          ) : activeCategory === 'identity' ? (
            <IdentityHubView
              allEntries={allEntries}
              onEditEntry={(entry) => {
                setEditingEntry(entry);
                setShowModal(true);
              }}
            />
          ) : activeCategory === 'panic' ? (
            <PanicModeView
              allEntries={allEntries}
              onEditEntry={(entry) => {
                setEditingEntry(entry);
                setShowModal(true);
              }}
              updateEntry={updateEntry}
              requestReprompt={requestReprompt}
            />
          ) : activeCategory === 'transfer' ? (
            <VaultTransferView
              allEntries={allEntries}
              createEntry={createEntry}
              requestReprompt={requestReprompt}
            />
          ) : (() => {
            // Use NL search when a search query is active
            const displayEntries = searchQuery && searchQuery.trim().length > 0
              ? semanticSearch(searchQuery, allEntries)
                  .filter(r => activeCategory === 'all' || r.entry.category === activeCategory)
                  .map(r => r.entry)
              : entries;

            if (loading) return (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}>
                <div className="spinner spinner-lg" />
              </div>
            );

            if (displayEntries.length === 0) return (
              <div className="empty-state">
                <div className="empty-state-icon">🔐</div>
                <h2 className="empty-state-title">
                  {searchQuery ? 'No results found' : 'Your vault is empty'}
                </h2>
                <p className="empty-state-desc">
                  {searchQuery
                    ? 'Try a different search — you can use natural language like "my college wifi" or "streaming service"'
                    : 'Add your first credential to get started. Everything is encrypted client-side before being stored.'}
                </p>
                {!searchQuery && (
                  <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    + Add your first credential
                  </button>
                )}
              </div>
            );

            return (
            <div className="vault-grid">
              {displayEntries.map((entry, index) => (
                <div
                  key={entry.id}
                  className={`vault-card stagger-${Math.min(index + 1, 5)}`}
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  <div className="vault-card-icon" style={{ padding: 0, overflow: 'hidden' }}>
                    <ServiceLogo name={entry.serviceName} url={entry.url} category={entry.category} />
                  </div>
                  <div className="vault-card-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div className="vault-card-service truncate" style={{ marginRight: 'auto' }}>{entry.serviceName || 'Unnamed'}</div>
                      {(() => {
                        const duplicates = allEntries.filter(
                          (e) =>
                            e.id !== entry.id &&
                            (e.serviceName || '').toLowerCase().trim() === (entry.serviceName || '').toLowerCase().trim() &&
                            (e.username || '').toLowerCase().trim() === (entry.username || '').toLowerCase().trim()
                        );
                        if (duplicates.length === 0) return null;
                        const isLatest = duplicates.every(
                          (d) => new Date(entry.createdAt) >= new Date(d.createdAt)
                        );
                        return isLatest ? (
                          <span className="category-badge" style={{ color: 'var(--success)', background: 'rgba(46, 213, 115, 0.08)', borderColor: 'rgba(46, 213, 115, 0.15)', fontSize: '8px', padding: '1px 6px' }}>
                            ✨ Latest
                          </span>
                        ) : (
                          <span className="category-badge" style={{ color: 'var(--danger)', background: 'rgba(255, 71, 87, 0.08)', borderColor: 'rgba(255, 71, 87, 0.15)', fontSize: '8px', padding: '1px 6px' }}>
                            ⚠️ Outdated
                          </span>
                        );
                      })()}
                      {entry.twoFactorMethod && entry.twoFactorMethod !== 'none' && (
                        <span className="category-badge" style={{ color: '#8b7cf7', background: 'rgba(139, 124, 247, 0.08)', borderColor: 'rgba(139, 124, 247, 0.15)', fontSize: '8px', padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          🛡️ 2FA Setup
                        </span>
                      )}
                    </div>
                    <div className="vault-card-username truncate">{entry.username || ''}</div>
                    {expandedId === entry.id && (
                      <div className="animate-fade-in-up" style={{ marginTop: 'var(--space-3)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                          {entry.password && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                              {revealId === entry.id ? (
                                <span className="mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', userSelect: 'all' }}>
                                  {entry.password}
                                </span>
                              ) : (
                                <span className="mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                                  ••••••••••
                                </span>
                              )}
                              {revealId === entry.id ? (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRevealId(null);
                                  }}
                                >
                                  🙈 Hide
                                </button>
                              ) : (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    requestReprompt(() => {
                                      setRevealId(entry.id);
                                    }, 'Reveal Password');
                                  }}
                                >
                                  👁️ Show
                                </button>
                              )}
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requestReprompt(() => {
                                    copy(entry.password);
                                    toast.success('Password copied to clipboard!');
                                  }, 'Copy Password');
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
                              📧 Recovery Email: {entry.recoveryEmail}
                            </p>
                          )}
                          {entry.recoveryPhone && (
                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                              📞 Recovery Phone: {entry.recoveryPhone}
                            </p>
                          )}
                          {entry.twoFactorMethod && entry.twoFactorMethod !== 'none' && (
                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                              🛡️ 2FA Setup: <span style={{ textTransform: 'uppercase', fontWeight: 600, color: 'var(--accent-primary)', fontSize: '10px' }}>{entry.twoFactorMethod}</span>
                            </p>
                          )}
                          {entry.backupCodes && (
                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                              🔑 Backup Codes: <span className="mono" style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>{entry.backupCodes}</span>
                            </p>
                          )}
                        </div>
                        <PasswordStrengthInline password={entry.password} allEntries={allEntries} entryId={entry.id} />
                        
                        {/* Duplicate/Outdated password actions box */}
                        {(() => {
                          const duplicates = allEntries.filter(
                            (e) =>
                              e.id !== entry.id &&
                              (e.serviceName || '').toLowerCase().trim() === (entry.serviceName || '').toLowerCase().trim() &&
                              (e.username || '').toLowerCase().trim() === (entry.username || '').toLowerCase().trim()
                          );
                          if (duplicates.length === 0) return null;
                          const isLatest = duplicates.every(
                            (d) => new Date(entry.createdAt) >= new Date(d.createdAt)
                          );
                          const counterpart = duplicates[0];

                          return (
                            <div 
                              style={{ 
                                marginTop: 'var(--space-3)', 
                                padding: '12px 14px', 
                                background: isLatest ? 'rgba(46, 213, 115, 0.05)' : 'rgba(255, 71, 87, 0.05)', 
                                border: isLatest ? '1px solid rgba(46, 213, 115, 0.15)' : '1px solid rgba(255, 71, 87, 0.15)', 
                                borderRadius: 'var(--radius-sm)' 
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 8px 0', lineHeight: '1.4' }}>
                                {isLatest ? (
                                  <>
                                    <strong>✨ Duplicate Found:</strong> An older version of this credential exists (created {new Date(counterpart.createdAt).toLocaleDateString()}). Keep this latest copy.
                                  </>
                                ) : (
                                  <>
                                    <strong>⚠️ Outdated Password:</strong> A newer password for this account was saved on {new Date(counterpart.createdAt).toLocaleDateString()}. Use the latest copy.
                                  </>
                                )}
                              </p>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                {!isLatest && (
                                  <button 
                                    className="btn btn-secondary btn-sm"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const mergedNotes = `${counterpart.notes || ''} ${entry.notes ? `| Old notes: ${entry.notes}` : ''}`.trim();
                                      await updateEntry(counterpart.id, {
                                        ...counterpart,
                                        notes: mergedNotes
                                      });
                                      await deleteEntry(entry.id);
                                      toast.success('Successfully merged into latest copy!');
                                    }}
                                    style={{ padding: '4px 10px', fontSize: '10px' }}
                                  >
                                    Merge into Latest
                                  </button>
                                )}
                                <button 
                                  className="btn btn-danger btn-sm"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (confirm('Delete this older/outdated duplicate version?')) {
                                      await deleteEntry(isLatest ? counterpart.id : entry.id);
                                      toast.success('Deleted outdated duplicate copy');
                                    }
                                  }}
                                  style={{ padding: '4px 10px', fontSize: '10px' }}
                                >
                                  Delete Outdated Copy
                                </button>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Weave Smart Suggestions Box */}
                        {(() => {
                          const suggestions = analyzeCredentialSuggestions(entry);
                          if (suggestions.length === 0) return null;
                          return (
                            <div 
                              style={{ 
                                marginTop: 'var(--space-3)', 
                                padding: '12px 14px', 
                                background: 'rgba(108, 92, 231, 0.05)', 
                                border: '1px solid rgba(108, 92, 231, 0.15)', 
                                borderRadius: 'var(--radius-sm)' 
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <p style={{ fontSize: '11px', color: 'var(--text-primary)', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '14px' }}>✨</span>
                                <strong>Smart Suggestion:</strong> We analyzed this account and found improvements.
                              </p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {suggestions.map((suggestion, sIdx) => (
                                  <div 
                                    key={sIdx} 
                                    style={{ 
                                      display: 'flex', 
                                      justifyContent: 'space-between', 
                                      alignItems: 'center', 
                                      background: 'rgba(0,0,0,0.15)', 
                                      padding: '8px 12px', 
                                      borderRadius: '4px',
                                      border: '1px solid rgba(255,255,255,0.03)'
                                    }}
                                  >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {suggestion.label}
                                      </span>
                                      <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                                        {suggestion.description}
                                      </span>
                                    </div>
                                    <button 
                                      className="btn btn-primary"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        await suggestion.action(updateEntry);
                                        toast.success('Applied suggestion!');
                                      }}
                                      style={{ padding: '4px 10px', fontSize: '9px', height: '22px' }}
                                    >
                                      Apply
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
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
                          requestReprompt(() => {
                            copy(entry.password);
                            toast.success('Password copied to clipboard!');
                          }, 'Copy Password');
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
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
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestReprompt(() => {
                            if (confirm('Delete this credential?')) {
                              deleteEntry(entry.id);
                              toast.success('Credential deleted');
                            }
                          }, 'Delete Credential');
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--danger)' }}>
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          <line x1="10" y1="11" x2="10" y2="17"></line>
                          <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            );
          })()}
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
        allEntries={allEntries}
        createEntry={createEntry}
        updateEntry={updateEntry}
      />

      {/* MASTER PASSWORD REPROMPT MODAL */}
      {repromptModal.isOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content animate-scale-in" style={{ maxWidth: '400px', border: '1px solid var(--border-default)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', background: 'var(--bg-secondary)' }}>
            <div className="modal-header">
              <h2 className="modal-title">🔒 {repromptModal.title}</h2>
              <button 
                className="modal-close" 
                onClick={() => setRepromptModal({ isOpen: false, onSuccess: null, title: '' })}
              >
                ✕
              </button>
            </div>
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                const entered = e.target.elements.confirmPassword.value;
                const isValid = await verifyMasterPassword(entered);
                if (isValid) {
                  const cb = repromptModal.onSuccess;
                  setRepromptModal({ isOpen: false, onSuccess: null, title: '' });
                  if (cb) cb();
                } else {
                  toast.error('Incorrect master password');
                }
              }}
            >
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  For security reasons, please confirm your master password to complete this action.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="confirmPassword" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Master Password
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    placeholder="Enter master password..."
                    autoFocus
                    required
                    style={{
                      padding: '10px 12px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: 'var(--space-2)' }}>
                  <button 
                    type="button"
                    className="btn btn-secondary" 
                    onClick={() => setRepromptModal({ isOpen: false, onSuccess: null, title: '' })}
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
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
    twoFactorMethod: entry?.twoFactorMethod || 'none',
    backupCodes: entry?.backupCodes || '',
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              <div className="form-field">
                <label className="form-label">2FA Setup Method</label>
                <select
                  className="form-select"
                  value={formData.twoFactorMethod}
                  onChange={(e) => setFormData({ ...formData, twoFactorMethod: e.target.value })}
                >
                  <option value="none">❌ None / Not configured</option>
                  <option value="authenticator">📱 Authenticator App</option>
                  <option value="sms">💬 SMS Texts</option>
                  <option value="hardware">🔑 Hardware Key</option>
                  <option value="email">📧 Email Codes</option>
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Emergency Backup Codes</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 1234-5678"
                  value={formData.backupCodes}
                  onChange={(e) => setFormData({ ...formData, backupCodes: e.target.value })}
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

// ─── AI ACCOUNT DISCOVERY MODAL ───────────────────────────

const AIDiscoverModal = ({ isOpen, onClose, user, allEntries, createEntry, updateEntry }) => {
  const [step, setStep] = useState('connect'); // 'connect' | 'scanning' | 'results'
  const [emailToScan, setEmailToScan] = useState(user?.email || '');
  const [provider, setProvider] = useState('gmail'); // 'gmail' | 'outlook'
  const [scanText, setScanText] = useState('Connecting secure session...');
  const [selectedItems, setSelectedItems] = useState({
    netflix: true,
    spotify: true,
    amazon: true,
    zoom: true
  });
  const [saving, setSaving] = useState(false);

  const discoveryList = [
    { id: 'netflix', name: 'Netflix', url: 'https://netflix.com', category: 'general' },
    { id: 'spotify', name: 'Spotify', url: 'https://spotify.com', category: 'social' },
    { id: 'amazon', name: 'Amazon', url: 'https://amazon.com', category: 'shopping' },
    { id: 'zoom', name: 'Zoom', url: 'https://zoom.us', category: 'work' }
  ];

  useEffect(() => {
    if (step !== 'scanning') return;

    const phrases = [
      `Establishing secure SSL handshake for ${emailToScan}...`,
      `Querying ${provider === 'gmail' ? 'Gmail API' : 'Graph API'} for message headers...`,
      'Filtering metadata subjects for signup / welcome keywords...',
      'Mapping matching service endpoints to vault categories...',
      'Deduplicating existing vault entries...',
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
    }, 1200);

    return () => clearInterval(interval);
  }, [step, emailToScan, provider]);

  if (!isOpen) return null;

  const handleStartScan = (selectedProvider) => {
    if (!emailToScan || !emailToScan.includes('@')) {
      return toast.error('Please enter a valid email address first');
    }
    setProvider(selectedProvider);
    setStep('scanning');
  };

  const handleSecureSelected = async () => {
    setSaving(true);
    try {
      const itemsToSecure = discoveryList.filter(item => selectedItems[item.id]);
      let added = 0;
      let updated = 0;
      for (const item of itemsToSecure) {
        const exists = allEntries.find(
          e => e.serviceName.toLowerCase().trim() === item.name.toLowerCase() &&
               (e.username || '').toLowerCase().trim() === emailToScan.toLowerCase().trim()
        );
        const securePassword = generatePassword(20);
        if (exists) {
          await updateEntry(exists.id, {
            ...exists,
            password: securePassword,
            notes: `${exists.notes || ''} (Auto-updated via AI Inbox Scan)`.trim()
          });
          updated++;
        } else {
          await createEntry({
            serviceName: item.name,
            username: emailToScan,
            password: securePassword,
            url: item.url,
            category: item.category,
            notes: `Auto-discovered via AI Inbox Scan.`
          });
          added++;
        }
      }
      if (updated > 0 && added > 0) {
        toast.success(`Secured: ${added} new, updated ${updated} existing accounts!`);
      } else if (updated > 0) {
        toast.success(`Updated and secured ${updated} accounts!`);
      } else {
        toast.success(`Successfully secured ${added} accounts!`);
      }
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

              <div className="form-field" style={{ marginBottom: '6px' }}>
                <label className="form-label">Target Inbox Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="your@email.com"
                  value={emailToScan}
                  onChange={(e) => setEmailToScan(e.target.value)}
                  style={{ fontSize: '13px' }}
                />
              </div>
              
              <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'rgba(139, 124, 247, 0.08)', border: '1px dashed var(--accent-primary)', borderRadius: 'var(--radius-md)', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '20px' }}>🔒</span>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
                  <strong>Zero-Knowledge Safety:</strong> Scanning parses mail subjects client-side. Weave never reads password text or content, and no logs leave your machine.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'var(--space-2)' }}>
                <button className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '14px', gap: '12px' }} onClick={() => handleStartScan('gmail')}>
                  <span>🌐</span> Connect Gmail Workspace
                </button>
                <button className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '14px', gap: '12px' }} onClick={() => handleStartScan('outlook')}>
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
                We identified **4** active accounts linked to <strong>{emailToScan}</strong>. Selected accounts will be saved into Weave with secure generated passwords.
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
                      <div style={{ width: '28px', height: '28px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                        <ServiceLogo name={item.name} url={item.url} category={item.category} size={18} />
                      </div>
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

// ─── PASSWORD CHECKUP VIEW ─────────────────────────────────

const PasswordCheckupView = ({ allEntries, onEditEntry, updateEntry, deleteEntry, requestReprompt }) => {
  const [mergingAll, setMergingAll] = useState(false);

  // 1. Weak passwords: length < 8 or zxcvbn strength score < 3
  const weakEntries = allEntries.filter(entry => {
    if (!entry.password) return false;
    const strength = analyzePassword(entry.password);
    return entry.password.length < 8 || strength.score < 3;
  });

  // 2. Reused passwords: find duplicates where passwords match
  const reusedGroups = {};
  allEntries.forEach(entry => {
    if (!entry.password) return;
    const samePass = allEntries.filter(e => e.password === entry.password);
    if (samePass.length > 1) {
      reusedGroups[entry.password] = samePass;
    }
  });

  // 3. Similar password variations (Levenshtein pattern similarity)
  const similarPairs = useMemo(() => findSimilarPasswords(allEntries, 0.65), [allEntries]);

  // Group all entries by unique serviceName + username to detect duplicates
  const uniqueGroups = {};
  allEntries.forEach(entry => {
    const key = `${(entry.serviceName || '').toLowerCase().trim()}|${(entry.username || '').toLowerCase().trim()}`;
    if (!uniqueGroups[key]) {
      uniqueGroups[key] = [];
    }
    uniqueGroups[key].push(entry);
  });

  const duplicateGroups = Object.values(uniqueGroups).filter(grp => grp.length > 1);
  const totalDuplicatesCount = duplicateGroups.reduce((acc, grp) => acc + grp.length - 1, 0);

  const reusedCount = Object.values(reusedGroups).reduce((acc, grp) => acc + grp.length, 0);
  const weakCount = weakEntries.length;
  const similarCount = similarPairs.length;
  const totalCount = allEntries.length;
  const healthyCount = totalCount - (weakCount + totalDuplicatesCount + similarCount);

  const handleMerge = async (latest, entry) => {
    const mergedNotes = `${latest.notes || ''} ${entry.notes ? `| Old notes: ${entry.notes}` : ''}`.trim();
    try {
      await updateEntry(latest.id, {
        ...latest,
        notes: mergedNotes
      });
      await deleteEntry(entry.id);
      toast.success('Merged outdated duplicate copy!');
    } catch (err) {
      toast.error('Failed to merge duplicate copy');
    }
  };

  const handleMergeAll = async () => {
    if (confirm(`Are you sure you want to merge and clean up all ${totalDuplicatesCount} duplicate entries? Weave will preserve the latest passwords and append historical notes.`)) {
      requestReprompt(async () => {
        setMergingAll(true);
        try {
          for (const grp of duplicateGroups) {
            const sorted = [...grp].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const latest = sorted[0];
            const outdated = sorted.slice(1);

            let mergedNotes = latest.notes || '';
            outdated.forEach(o => {
              if (o.notes) {
                mergedNotes += ` | Old notes: ${o.notes}`;
              }
            });

            await updateEntry(latest.id, {
              ...latest,
              notes: mergedNotes.trim()
            });

            for (const o of outdated) {
              await deleteEntry(o.id);
            }
          }
          toast.success('Successfully merged all duplicates in one go!');
        } catch (err) {
          toast.error('Failed to batch merge duplicates');
        } finally {
          setMergingAll(false);
        }
      }, 'Merge All Duplicates');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-12)' }}>
      {/* Banner */}
      <div style={{ padding: 'var(--space-6)', background: 'rgba(139, 124, 247, 0.04)', border: '1px solid rgba(139, 124, 247, 0.15)', borderRadius: 'var(--radius-lg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: 'var(--space-2)' }}>🛡️ Security Checkup</h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Check your saved credentials for security issues. All passwords are analyzed locally in browser memory.
          </p>
        </div>
        {totalDuplicatesCount > 0 && (
          <button 
            className="btn btn-primary" 
            onClick={handleMergeAll} 
            disabled={mergingAll}
            style={{ padding: '10px 16px', fontSize: '12px' }}
          >
            {mergingAll ? 'Merging All...' : `⚡ Merge All ${totalDuplicatesCount} Duplicates`}
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)' }}>
        <div style={{ padding: '16px 8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--danger)', margin: '0 0 4px 0' }}>{totalDuplicatesCount}</p>
          <p style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: 0 }}>Duplicates</p>
        </div>
        <div style={{ padding: '16px 8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--warning)', margin: '0 0 4px 0' }}>{weakCount}</p>
          <p style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: 0 }}>Weak Passwords</p>
        </div>
        <div style={{ padding: '16px 8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: '#f59e0b', margin: '0 0 4px 0' }}>{similarCount}</p>
          <p style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: 0 }}>Pattern Reuse</p>
        </div>
        <div style={{ padding: '16px 8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--success)', margin: '0 0 4px 0' }}>{healthyCount > 0 ? healthyCount : 0}</p>
          <p style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: 0 }}>Secure</p>
        </div>
      </div>

      {/* Details Lists */}
      {totalDuplicatesCount > 0 && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span> Duplicate Login Details
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {duplicateGroups.map((group, idx) => {
              const sorted = [...group].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
              const latest = sorted[0];
              const outdated = sorted.slice(1);

              return (
                <div 
                  key={idx} 
                  style={{ 
                    padding: '16px', 
                    background: 'rgba(255, 71, 87, 0.02)', 
                    border: '1px solid rgba(255, 71, 87, 0.1)', 
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    We found **{group.length}** credentials saved for **{latest.serviceName}** ({latest.username}):
                  </div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {sorted.map((entry, eIdx) => (
                      <div 
                        key={entry.id}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-sm)'
                        }}
                      >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            <ServiceLogo name={entry.serviceName} url={entry.url} category={entry.category} size={14} />
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: 600 }}>{entry.serviceName}</span>
                          <span className="category-badge" style={{ 
                            fontSize: '8px', 
                            padding: '1px 6px',
                            color: eIdx === 0 ? 'var(--success)' : 'var(--danger)',
                            background: eIdx === 0 ? 'rgba(46, 213, 115, 0.08)' : 'rgba(255, 71, 87, 0.08)',
                            borderColor: eIdx === 0 ? 'rgba(46, 213, 115, 0.15)' : 'rgba(255, 71, 87, 0.15)',
                          }}>
                            {eIdx === 0 ? 'Latest' : 'Outdated'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {eIdx !== 0 && (
                            <button 
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                requestReprompt(() => {
                                  handleMerge(latest, entry);
                                }, 'Merge Duplicate Credentials');
                              }}
                              style={{ padding: '4px 10px', fontSize: '10px' }}
                            >
                              Merge
                            </button>
                          )}
                          <button 
                            className="btn btn-danger btn-sm"
                            onClick={async () => {
                              if (confirm('Delete this duplicate?')) {
                                await deleteEntry(entry.id);
                                toast.success('Deleted duplicate credential');
                              }
                            }}
                            style={{ padding: '4px 10px', fontSize: '10px' }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {similarCount > 0 && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span> Password Pattern Reuse (Weak Variations)
          </h3>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '-6px 0 12px 0', lineHeight: 1.4 }}>
            These password pairs are not identical but share high similarity patterns (e.g. Sajjan@123 vs Sajjan@124). Attackers can guess these easily once one account is breached.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {similarPairs.map((pair, idx) => (
              <div 
                key={idx}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <ServiceLogo name={pair.entryA.serviceName} url={pair.entryA.url} category={pair.entryA.category} size={12} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>{pair.entryA.serviceName}</span>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>➔</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <ServiceLogo name={pair.entryB.serviceName} url={pair.entryB.url} category={pair.entryB.category} size={12} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>{pair.entryB.serviceName}</span>
                  </div>
                  <span className="category-badge" style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.15)', fontSize: '8px' }}>
                    {pair.similarity}% similarity pattern
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={() => onEditEntry(pair.entryB)}
                    style={{ padding: '4px 10px', fontSize: '10px' }}
                  >
                    Change One
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {weakCount > 0 && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'var(--space-2)' }}>
            <span>⚠️</span> Weak Passwords
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {weakEntries.map(entry => (
              <div 
                key={entry.id}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <ServiceLogo name={entry.serviceName} url={entry.url} category={entry.category} size={16} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{entry.serviceName}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{entry.username || 'No email/username'}</span>
                  </div>
                  <span className="category-badge" style={{ color: 'var(--warning)', background: 'rgba(251, 191, 36, 0.08)', borderColor: 'rgba(251, 191, 36, 0.15)', fontSize: '8px', marginLeft: '8px' }}>
                    {entry.password.length < 8 ? 'Too Short' : 'Predictable'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={() => onEditEntry(entry)}
                    style={{ padding: '4px 10px', fontSize: '10px' }}
                  >
                    Change Password
                  </button>
                  <button 
                    className="btn btn-danger btn-sm"
                    onClick={async () => {
                      if (confirm('Delete this credential?')) {
                        await deleteEntry(entry.id);
                        toast.success('Deleted credential');
                      }
                    }}
                    style={{ padding: '4px 10px', fontSize: '10px' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {weakCount === 0 && totalDuplicatesCount === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-secondary)', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-lg)' }}>
          <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>🛡️</span>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--success)', marginBottom: '8px' }}>Your Vault is 100% Healthy!</h3>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0 }}>
            No weak, reused, or duplicate passwords were found. Awesome job securing your digital life!
          </p>
        </div>
      )}
    </div>
  );
};

// ─── IDENTITY & RECOVERY HUB VIEW ───────────────────────────

const IdentityHubView = ({ allEntries, onEditEntry }) => {
  const [simulatingNode, setSimulatingNode] = useState(null);

  const graph = useMemo(() => buildRecoveryGraph(allEntries), [allEntries]);
  
  const loops = useMemo(() => {
    const detectedLoops = [];
    const visitedGlobal = new Set();
    const adj = graph.adjacency;

    Object.keys(adj).forEach(startNode => {
      if (visitedGlobal.has(startNode)) return;
      
      const path = [];
      const visitedLocal = new Set();
      let curr = startNode;

      while (curr && adj[curr] && adj[curr].length > 0) {
        // Simple first recovery path cycle detection
        const next = adj[curr][0];
        if (visitedLocal.has(curr)) {
          const cycleStartIdx = path.indexOf(curr);
          const cyclePath = path.slice(cycleStartIdx);
          cyclePath.push(curr);
          detectedLoops.push(cyclePath);
          break;
        }
        visitedLocal.add(curr);
        path.push(curr);
        curr = next;
      }
      
      path.forEach(node => visitedGlobal.add(node));
    });

    return detectedLoops;
  }, [graph]);

  const centralityRankings = useMemo(() => {
    return computeDegreeCentrality(graph);
  }, [graph]);

  const blastRadiusResult = useMemo(() => {
    if (!simulatingNode) return null;
    return blastRadiusBFS(graph, simulatingNode);
  }, [simulatingNode, graph]);

  const identityAnchors = allEntries.filter(e => {
    const isEmail = (e.username || '').includes('@');
    const hasRecovery = !!e.recoveryEmail;
    const hasBackup = !!e.backupCodes;
    const has2FA = e.twoFactorMethod && e.twoFactorMethod !== 'none';
    const isCoreDomain = ['google', 'gmail', 'outlook', 'microsoft', 'apple', 'icloud', 'yahoo'].some(
      d => (e.serviceName || '').toLowerCase().includes(d)
    );
    return isEmail || hasRecovery || hasBackup || has2FA || isCoreDomain;
  });

  const get2FASecurityColor = (method) => {
    switch (method) {
      case 'hardware': return { text: '#10b981', bg: 'rgba(16,185,129,0.08)', label: 'Strong (Hardware)' };
      case 'authenticator': return { text: '#10b981', bg: 'rgba(16,185,129,0.08)', label: 'Secure (App)' };
      case 'email': return { text: '#f59e0b', bg: 'rgba(245,158,11,0.08)', label: 'Moderate (Email)' };
      case 'sms': return { text: '#f59e0b', bg: 'rgba(245,158,11,0.08)', label: 'Weak (SMS - Sim Swap Risk)' };
      default: return { text: '#ef4444', bg: 'rgba(239,68,68,0.08)', label: 'None Configured' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-12)' }}>
      <div style={{ padding: 'var(--space-6)', background: 'rgba(139, 124, 247, 0.04)', border: '1px solid rgba(139, 124, 247, 0.15)', borderRadius: 'var(--radius-lg)' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: 'var(--space-2)' }}>🔗 Identity & Recovery Hub</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          Visualize and map how your core digital identities (Gmail, Outlook, Apple ID) are recovered and secured. Secure recovery loops to prevent catastrophic account lockouts.
        </p>
      </div>

      {simulatingNode && blastRadiusResult && (
        <div style={{ padding: '16px 20px', background: 'rgba(255, 71, 87, 0.06)', border: '1px solid rgba(255, 71, 87, 0.25)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ color: 'var(--danger)', fontSize: '13px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              💥 Blast-Radius Simulation Active: Loss of {simulatingNode}
            </h4>
            <button className="btn btn-ghost btn-sm" onClick={() => setSimulatingNode(null)} style={{ padding: '2px 8px', fontSize: '11px' }}>
              Clear Simulation
            </button>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px 0', lineHeight: 1.4 }}>
            If you lose access to <strong>{simulatingNode}</strong>, you will also lose access to all downstream accounts that rely on it for recovery (and have no alternate methods configured):
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {blastRadiusResult.affectedNodes.map(node => (
              <span key={node} style={{ fontSize: '11px', fontWeight: 600, background: 'rgba(255, 71, 87, 0.1)', color: 'var(--danger)', padding: '4px 10px', borderRadius: '4px', border: '1px solid rgba(255, 71, 87, 0.15)' }}>
                {node} {node === simulatingNode ? '(Root Cause)' : `(Lost at depth ${blastRadiusResult.depthMap[node]})`}
              </span>
            ))}
          </div>
        </div>
      )}

      {loops.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loops.map((loop, idx) => (
            <div 
              key={idx} 
              style={{ 
                padding: '16px 20px', 
                background: 'rgba(239, 68, 68, 0.04)', 
                border: '1px solid rgba(239, 68, 68, 0.2)', 
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 4px 20px rgba(239, 68, 68, 0.05)'
              }}
            >
              <h4 style={{ color: 'var(--danger)', fontSize: '13px', fontWeight: 700, margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ⚠️ Critical Circular Recovery Loop Detected
              </h4>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                The following accounts depend on each other for password recovery:
              </p>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                {loop.map((node, nIdx) => (
                  <span key={nIdx} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    {nIdx > 0 && <span style={{ color: 'var(--text-muted)' }}>➔</span>}
                    <span style={{ fontSize: '11px', fontWeight: 600, background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
                      {node}
                    </span>
                  </span>
                ))}
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                <strong>The Risk:</strong> If both of these accounts are locked out at the same time, you will not be able to recover either since each relies on the other to receive verification links. Configure a secondary offline recovery method (e.g. printable backup codes or phone recovery) immediately.
              </p>
            </div>
          ))}
        </div>
      )}

      <div>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-4)' }}>
          Identity Anchor Connections ({identityAnchors.length})
        </h3>
        {identityAnchors.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-secondary)', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-md)' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
              No identity anchor credentials detected. Save your primary Gmail, Outlook, or Apple ID details to view their recovery mapping.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {identityAnchors.map(entry => {
              const sec2FA = get2FASecurityColor(entry.twoFactorMethod);
              const nodeName = (entry.username || '').toLowerCase().trim();
              const centralityItem = centralityRankings.find(c => c.node === nodeName);
              const blastRadiusVal = centralityItem?.blastRadius || 0;
              const inDegreeVal = centralityItem?.inDegree || 0;
              const isCriticalHub = centralityItem && (centralityItem.centrality > 0.3 || blastRadiusVal >= 2);
              
              // Visual styling highlight for simulation
              const isSimAffected = blastRadiusResult?.affectedNodes.includes(nodeName);
              const isSimRoot = simulatingNode === nodeName;
              
              let cardBorder = '1px solid var(--border-default)';
              let cardBg = 'rgba(255,255,255,0.015)';
              if (isSimRoot) {
                cardBorder = '1px solid var(--danger)';
                cardBg = 'rgba(239, 68, 68, 0.08)';
              } else if (isSimAffected) {
                cardBorder = '1px dashed var(--danger)';
                cardBg = 'rgba(239, 68, 68, 0.03)';
              } else if (isCriticalHub) {
                cardBorder = '1px solid rgba(139, 124, 247, 0.4)';
              }

              return (
                <div 
                  key={entry.id}
                  style={{ 
                    background: cardBg,
                    border: cardBorder, 
                    borderRadius: 'var(--radius-md)', 
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
                  }}
                  className="hover-glow-card"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '28px', height: '28px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        <ServiceLogo name={entry.serviceName} url={entry.url} category={entry.category} size={16} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {entry.serviceName}
                          {isCriticalHub && (
                            <span title="Single Point of Failure: multiple accounts depend on this hub" style={{ fontSize: '11px', cursor: 'help' }}>🎯</span>
                          )}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.username || 'No email username'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {nodeName && (
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => setSimulatingNode(simulatingNode === nodeName ? null : nodeName)}
                          style={{ padding: '2px 6px', fontSize: '9px', borderColor: isSimRoot ? 'var(--danger)' : 'var(--border-default)' }}
                        >
                          {isSimRoot ? 'Stop Sim' : 'What if lost?'}
                        </button>
                      )}
                      <button 
                        className="btn btn-ghost btn-sm" 
                        onClick={() => onEditEntry(entry)}
                        style={{ padding: '2px 8px', fontSize: '10px' }}
                      >
                        Configure
                      </button>
                    </div>
                  </div>

                  {isCriticalHub && (
                    <div style={{ padding: '8px 10px', background: 'rgba(139, 124, 247, 0.05)', border: '1px solid rgba(139, 124, 247, 0.15)', borderRadius: '4px', fontSize: '10px', color: 'var(--text-secondary)' }}>
                      <strong>🎯 Critical Recovery Hub:</strong> {blastRadiusVal} downstream account(s) depend on this. 
                      {entry.twoFactorMethod !== 'hardware' && (
                        <div style={{ color: 'var(--warning)', marginTop: '4px', fontWeight: 600 }}>
                          ⚠️ Recommendation: Configure a Hardware Security Key (e.g. YubiKey).
                        </div>
                      )}
                    </div>
                  )}

                  <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.03)', margin: 0 }} />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>📧 Recovery Email</span>
                      {entry.recoveryEmail ? (
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entry.recoveryEmail}</span>
                      ) : (
                        <span style={{ color: 'var(--danger)' }}>⚠️ None configured</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>📞 Recovery Phone</span>
                      {entry.recoveryPhone ? (
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entry.recoveryPhone}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Not configured</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>🛡️ 2FA Method</span>
                      <span style={{ 
                        fontSize: '9px', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        color: sec2FA.text, 
                        background: sec2FA.bg, 
                        fontWeight: 700 
                      }}>
                        {sec2FA.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>🔑 Backup Codes</span>
                      {entry.backupCodes ? (
                        <span style={{ color: 'var(--success)', fontWeight: 600 }}>Active (Configured)</span>
                      ) : (
                        <span style={{ color: 'var(--warning)' }}>⚠️ Missing backup keys</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── PANIC MODE VIEW ────────────────────────────────────────

const PanicModeView = ({ allEntries, onEditEntry, updateEntry, requestReprompt }) => {
  const [panicActive, setPanicActive] = useState(false);
  const [completedRotations, setCompletedRotations] = useState(new Set());

  const graph = useMemo(() => buildRecoveryGraph(allEntries), [allEntries]);
  const panicPlan = useMemo(() => {
    if (!panicActive) return [];
    return generatePanicPlan(allEntries, graph);
  }, [panicActive, allEntries, graph]);

  const activeSteps = panicPlan.filter(step => !completedRotations.has(step.entry.id));

  const handleRotate = (entry) => {
    onEditEntry(entry);
  };

  const handleMarkDone = (entryId) => {
    const updated = new Set(completedRotations);
    updated.add(entryId);
    setCompletedRotations(updated);
    toast.success('Account rotation completed!');
  };

  if (!panicActive) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-12)' }}>
        <div style={{ padding: 'var(--space-6)', background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
          <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>🚨</span>
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Panic Mode Breach Response</h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto var(--space-6) auto', lineHeight: 1.6 }}>
            Think your primary email or master password was leaked? Do not panic. Our prioritized response engine evaluates the blast-radius of your entire vault, mapping out exactly which high-stake accounts to secure first.
          </p>
          <button 
            className="btn btn-danger btn-lg" 
            onClick={() => {
              requestReprompt(() => {
                setPanicActive(true);
              }, 'Start Panic Mode');
            }}
            style={{ padding: '12px 32px' }}
          >
            ⚡ Initialize Breach Response
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-12)' }}>
      <div style={{ padding: 'var(--space-5) var(--space-6)', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-lg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 4px 0' }}>
            <span>🚨</span> Active Breach Response Plan
          </h2>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
            Follow the prioritized roadmap below. Secure critical recovery hubs first to prevent cascading takeover attacks.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setPanicActive(false)}>
          Exit Panic Mode
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', alignItems: 'flex-start' }}>
        {/* Prioritized Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {activeSteps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-secondary)', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-lg)' }}>
              <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>🛡️</span>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--success)', marginBottom: '8px' }}>Breach Contained!</h3>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0 }}>
                You have rotated all critical and vulnerable passwords in the queue.
              </p>
            </div>
          ) : (
            activeSteps.map((step, idx) => (
              <div 
                key={step.entry.id} 
                style={{ 
                  padding: '16px 20px', 
                  background: 'var(--bg-secondary)', 
                  border: '1px solid var(--border-default)', 
                  borderLeft: `4px solid ${step.priority === 'critical' ? 'var(--danger)' : step.priority === 'high' ? 'var(--warning)' : 'var(--accent-primary)'}`,
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '4px' }}>
                      Step {idx + 1}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>{step.entry.serviceName}</span>
                    <span className="category-badge" style={{ 
                      fontSize: '8px', 
                      padding: '1px 6px',
                      color: step.priority === 'critical' ? 'var(--danger)' : step.priority === 'high' ? 'var(--warning)' : 'var(--text-muted)',
                      background: 'rgba(0,0,0,0.1)'
                    }}>
                      {step.priority.toUpperCase()} PRIORITY
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 6px 0' }}>
                    Username: {step.entry.username || 'No email username'}
                  </p>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    💡 Reason: {step.reason}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-primary btn-sm" onClick={() => handleRotate(step.entry)}>
                    Rotate Password
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleMarkDone(step.entry.id)}>
                    Mark Done
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Sidebar Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ padding: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
            <h4 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>Rotation Stats</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Pending</span>
                <span style={{ fontWeight: 600, color: 'var(--danger)' }}>{activeSteps.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Completed</span>
                <span style={{ fontWeight: 600, color: 'var(--success)' }}>{completedRotations.size}</span>
              </div>
              <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', marginTop: '6px' }}>
                <div 
                  style={{ 
                    height: '100%', 
                    background: 'var(--success)', 
                    width: `${panicPlan.length > 0 ? (completedRotations.size / panicPlan.length) * 100 : 0}%`,
                    transition: 'width 0.4s ease'
                  }} 
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── VAULT TRANSFER VIEW ────────────────────────────────────

const VaultTransferView = ({ allEntries, createEntry, requestReprompt }) => {
  const [mode, setMode] = useState('menu'); // 'menu' | 'send' | 'receive'
  const [pin, setPin] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [payload, setPayload] = useState('');
  const [importPin, setImportPin] = useState('');
  const [transferPayload, setTransferPayload] = useState('');
  const [loading, setLoading] = useState(false);

  const handleStartSend = () => {
    requestReprompt(async () => {
      setLoading(true);
      try {
        const pairingPin = generateTransferPIN();
        setPin(pairingPin);
        
        const { payload: encPayload } = await encryptVaultForTransfer(allEntries, pairingPin);
        setPayload(encPayload);

        // Generate QR code image URI
        const qrUrl = await QRCode.toDataURL(encPayload, {
          width: 256,
          margin: 2,
          color: {
            dark: '#ffffff',
            light: '#030307' // Obsidian Space theme matching
          }
        });
        setQrCodeUrl(qrUrl);
        setMode('send');
      } catch (err) {
        toast.error('Failed to prepare vault for transfer');
      } finally {
        setLoading(false);
      }
    }, 'Authorize Vault Export');
  };

  const handleImport = async () => {
    if (!transferPayload || !importPin) {
      return toast.error('Please enter the encrypted payload and pairing PIN');
    }
    setLoading(true);
    try {
      const importedEntries = await decryptVaultTransfer(transferPayload.trim(), importPin.trim());
      
      let importedCount = 0;
      for (const entry of importedEntries) {
        await createEntry(entry);
        importedCount++;
      }
      toast.success(`Successfully imported ${importedCount} credentials offline!`);
      setMode('menu');
      setImportPin('');
      setTransferPayload('');
    } catch (err) {
      toast.error('Failed to decrypt vault. Please double check the Pairing PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-12)' }}>
      <div style={{ padding: 'var(--space-6)', background: 'rgba(139, 124, 247, 0.04)', border: '1px solid rgba(139, 124, 247, 0.15)', borderRadius: 'var(--radius-lg)' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: 'var(--space-2)' }}>📲 Device-to-Device Vault Transfer</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          Migrate your entire credentials vault offline. Encrypted locally with a one-time PBKDF2 pairing PIN before transfer. Nothing touches the cloud or any servers.
        </p>
      </div>

      {mode === 'menu' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '640px', margin: '0 auto' }}>
          <div 
            onClick={handleStartSend}
            style={{ padding: '24px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.3s ease' }}
            className="hover-glow-card"
          >
            <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>📤</span>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>Send Vault</h3>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
              Generate an encrypted QR code configuration to transfer your vault data to another phone or computer.
            </p>
          </div>

          <div 
            onClick={() => setMode('receive')}
            style={{ padding: '24px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.3s ease' }}
            className="hover-glow-card"
          >
            <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>📥</span>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>Receive Vault</h3>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
              Scan or paste a transfer code payload and enter the Pairing PIN to decrypt and merge credentials.
            </p>
          </div>
        </div>
      )}

      {mode === 'send' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', maxWidth: '440px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ padding: '16px', background: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt="Pairing QR Code" style={{ width: '220px', height: '220px', display: 'block' }} />
            ) : (
              <div className="spinner spinner-lg" />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>One-Time Pairing PIN</span>
            <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '4px' }}>{pin}</span>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            To transfer, open Weave on your new device, select <strong>Receive Vault</strong>, paste the transfer payload below, and enter this 6-digit pairing PIN.
          </p>

          <button 
            className="btn btn-secondary btn-sm" 
            onClick={() => {
              navigator.clipboard.writeText(payload);
              toast.success('Encrypted transfer payload copied!');
            }}
            style={{ padding: '6px 14px', fontSize: '11px' }}
          >
            📋 Copy Encrypted Payload Instead
          </button>

          <button className="btn btn-ghost btn-sm" onClick={() => setMode('menu')} style={{ marginTop: '8px' }}>
            Go Back
          </button>
        </div>
      )}

      {mode === 'receive' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '440px', margin: '0 auto' }}>
          <div className="form-field">
            <label className="form-label">Encrypted Transfer Payload</label>
            <textarea
              className="form-textarea"
              placeholder="Paste the Base64 transfer payload code..."
              value={transferPayload}
              onChange={(e) => setTransferPayload(e.target.value)}
              rows={6}
              style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}
            />
          </div>

          <div className="form-field">
            <label className="form-label">6-Digit Pairing PIN</label>
            <input
              type="text"
              className="form-input"
              placeholder="Enter pairing PIN shown on original screen"
              value={importPin}
              onChange={(e) => setImportPin(e.target.value)}
              maxLength={6}
              style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '2px', textAlign: 'center' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={() => setMode('menu')} style={{ flex: 1 }}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleImport} disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Decrypting...' : '🔒 Decrypt & Merge'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SERVICE LOGO COMPONENT ─────────────────────────────────

const extractDomain = (str = '') => {
  let text = str.trim().toLowerCase();
  
  // Remove protocol and port
  text = text.replace(/^(https?:\/\/)?(www\.)?/, '');
  text = text.split('/')[0];
  text = text.split(':')[0]; // remove port
  
  if (text.includes('.') && !text.includes(' ') && text.length > 3) {
    const parts = text.split('.');
    if (parts.length >= 2) {
      const tld = parts[parts.length - 1];
      const sld = parts[parts.length - 2];
      const countryCodes = ['co', 'com', 'org', 'net', 'edu', 'gov', 'in', 'us', 'uk', 'ca', 'cn', 'jp'];
      if (parts.length > 2 && countryCodes.includes(sld) && countryCodes.includes(tld)) {
        return parts.slice(-3).join('.');
      }
      return parts.slice(-2).join('.');
    }
    return text;
  }
  return null;
};

const getServiceLogoUrl = (name = '', url = '') => {
  let domain = extractDomain(url);
  
  if (!domain) {
    domain = extractDomain(name);
  }
  
  if (!domain && name) {
    const match = name.toLowerCase().trim();
    if (match.includes('google')) domain = 'google.com';
    else if (match.includes('github')) domain = 'github.com';
    else if (match.includes('microsoft') || match.includes('azure') || match.includes('outlook')) domain = 'microsoft.com';
    else if (match.includes('netflix')) domain = 'netflix.com';
    else if (match.includes('spotify')) domain = 'spotify.com';
    else if (match.includes('amazon')) domain = 'amazon.com';
    else if (match.includes('zoom')) domain = 'zoom.us';
    else if (match.includes('facebook')) domain = 'facebook.com';
    else if (match.includes('twitter') || match.includes(' x ')) domain = 'twitter.com';
    else if (match.includes('linkedin')) domain = 'linkedin.com';
  }
  
  if (domain && domain !== 'localhost' && domain.includes('.')) {
    return `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
  }
  return null;
};

const ServiceLogo = ({ name, url, category, size = 18 }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const logoUrl = getServiceLogoUrl(name, url);

  if (logoUrl && !imgFailed) {
    return (
      <img 
        src={logoUrl} 
        alt={name} 
        onError={() => setImgFailed(true)} 
        style={{ width: `${size}px`, height: `${size}px`, borderRadius: '4px', objectFit: 'contain', display: 'block' }}
      />
    );
  }

  const colors = {
    general: '#8b7cf7',
    work: '#60a5fa',
    personal: '#34d399',
    banking: '#fbbf24',
    social: '#f87171',
    development: '#a78bfa',
    shopping: '#22d3ee',
  };
  const bg = colors[category] || '#8b7cf7';
  const initial = (name || '?')[0].toUpperCase();

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: bg,
      color: '#ffffff',
      fontSize: size <= 14 ? '9px' : '12px',
      fontWeight: 700,
      borderRadius: '4px',
      textShadow: '0 1px 2px rgba(0,0,0,0.2)'
    }}>
      {initial}
    </div>
  );
};

const analyzeCredentialSuggestions = (entry) => {
  const name = (entry.serviceName || '').toLowerCase().trim();
  const url = (entry.url || '').toLowerCase().trim();
  const category = (entry.category || 'general').toLowerCase().trim();
  
  const suggestions = [];

  // 1. Suggest Category updates
  let recommendedCategory = null;
  if (category === 'general') {
    if (name.includes('localhost') || name.includes('127.0.0.1') || name.includes('github') || name.includes('gitlab') || url.includes('github') || url.includes('localhost')) {
      recommendedCategory = 'development';
    } else if (name.includes('live') || name.includes('office') || name.includes('microsoft') || name.includes('slack') || name.includes('zoom') || name.includes('teams') || name.includes('appen')) {
      recommendedCategory = 'work';
    } else if (name.includes('netflix') || name.includes('spotify') || name.includes('facebook') || name.includes('instagram') || name.includes('twitter') || name.includes('discord')) {
      recommendedCategory = 'social';
    } else if (name.includes('amazon') || name.includes('ebay') || name.includes('shopping') || name.includes('store') || name.includes('mcafee')) {
      recommendedCategory = 'shopping';
    } else if (name.includes('bank') || name.includes('paypal') || name.includes('stripe') || name.includes('visa') || name.includes('card')) {
      recommendedCategory = 'banking';
    }
  }

  if (recommendedCategory) {
    suggestions.push({
      type: 'category',
      recommendedValue: recommendedCategory,
      label: `Move to ${recommendedCategory.toUpperCase()} Category`,
      description: `Matches standard signatures for ${recommendedCategory}.`,
      action: async (updateEntry) => {
        await updateEntry(entry.id, { ...entry, category: recommendedCategory });
      }
    });
  }

  // 2. Suggest Service Name cleaning
  let recommendedName = null;
  if (name.includes('.') && !name.includes(' ')) {
    const cleanDomain = name.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].split(':')[0];
    const parts = cleanDomain.split('.');
    if (parts.length >= 2) {
      let coreName = parts[parts.length - 2];
      if (coreName === 'co' || coreName === 'com' || coreName === 'org' || coreName === 'net') {
        coreName = parts[parts.length - 3] || coreName;
      }
      recommendedName = coreName.charAt(0).toUpperCase() + coreName.slice(1);
    }
  } else if (name.startsWith('http://') || name.startsWith('https://')) {
    if (name.includes('localhost')) {
      const port = name.split(':')[2] || '5173';
      recommendedName = `Local Server (Port ${port})`;
    }
  }

  if (recommendedName && recommendedName.toLowerCase() !== name.toLowerCase() && recommendedName.length > 2) {
    suggestions.push({
      type: 'name',
      recommendedValue: recommendedName,
      label: `Rename to "${recommendedName}"`,
      description: `Clean up long technical domain URLs for a premium layout.`,
      action: async (updateEntry) => {
        await updateEntry(entry.id, { ...entry, serviceName: recommendedName });
      }
    });
  }

  return suggestions;
};

export default Dashboard;

