import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useVaultContext } from '../context/VaultContext';
import useClipboard from '../hooks/useClipboard';
import { analyzePassword, checkPasswordReuse, generatePassword, findSimilarPasswords } from '../lib/validators';
import { buildRecoveryGraph, blastRadiusBFS, computeDegreeCentrality, generatePanicPlan } from '../lib/graphEngine';
import { semanticSearch } from '../lib/nlSearch';
import { encryptVaultForTransfer, decryptVaultTransfer, generateTransferPIN } from '../lib/vaultTransfer';
import { getAccountType, getTierLabel, computeAccountHealthScore, getHealthScoreDisplay, ACCOUNT_TYPES } from '../lib/accountTypes';
import { checkPasswordBreach, getCachedBreachCount } from '../lib/hibp';
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
              ⚡ Smart Import
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

            const renderCard = (entry, index) => {
              const accountType = getAccountType(entry.serviceName);
              const brandColor = accountType?.brandColor || 'rgba(255, 255, 255, 0.05)';
              return (
                <div
                  key={entry.id}
                  className={`vault-card stagger-${Math.min(index + 1, 5)}`}
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  style={{ borderLeft: `3px solid ${brandColor}` }}
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
              );
            };
  
            if (activeCategory === 'all' && (!searchQuery || !searchQuery.trim())) {
              const t1 = displayEntries.filter(e => { const t = getAccountType(e.serviceName); return t?.tier === 1 || t?.isIdentityAnchor; });
              const t2 = displayEntries.filter(e => { const t = getAccountType(e.serviceName); return t?.tier === 2 && !t?.isIdentityAnchor; });
              const t3 = displayEntries.filter(e => { const t = getAccountType(e.serviceName); return !t || t?.tier === 3; });
  
              const groups = [
                { title: '🔑 Tier 1: Core Identity Anchors', desc: 'Critical accounts that control access/recovery of other accounts (e.g. Gmail, Apple ID, Outlook).', items: t1 },
                { title: '⭐ Tier 2: High-Value Accounts', desc: 'Financial, development, or identity-reliant work profiles (e.g. GitHub, Stripe, Coinbase).', items: t2 },
                { title: '🔓 Tier 3: Standard Accounts & Services', desc: 'Everyday accounts, socials, streaming services, and shopping profiles.', items: t3 }
              ];
  
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
                  {groups.map(group => {
                    if (group.items.length === 0) return null;
                    return (
                      <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        <div>
                          <h3 style={{ fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', margin: 0 }}>
                            {group.title}
                            <span style={{ fontSize: '11px', fontWeight: 500, opacity: 0.6 }}>({group.items.length})</span>
                          </h3>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>{group.desc}</p>
                        </div>
                        <div className="vault-grid">
                          {group.items.map((entry, index) => renderCard(entry, index))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }
  
            return (
              <div className="vault-grid">
                {displayEntries.map((entry, index) => renderCard(entry, index))}
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

      {/* WEAVE BOT (PRIVACY FIRST) */}
      <WeaveBot
        entries={allEntries}
        onEditEntry={(entry) => {
          setEditingEntry(entry);
          setShowModal(true);
        }}
        verifyMasterPassword={verifyMasterPassword}
      />

      {/* SMART IMPORT MODAL */}
      <SmartImportModal
        isOpen={showDiscoverModal}
        onClose={() => setShowDiscoverModal(false)}
        allEntries={allEntries}
        createEntry={createEntry}
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

  const matchedService = useMemo(() => {
    return getAccountType(formData.serviceName);
  }, [formData.serviceName]);

  const suggestions = useMemo(() => {
    if (!formData.serviceName.trim() || entry) return [];
    const query = formData.serviceName.toLowerCase();
    return ACCOUNT_TYPES.filter(
      (type) =>
        type.name.toLowerCase().includes(query) &&
        type.name.toLowerCase() !== query
    ).slice(0, 5);
  }, [formData.serviceName, entry]);

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

  const handleSelectSuggestion = (sug) => {
    setFormData({
      ...formData,
      serviceName: sug.name,
      url: sug.domain ? `https://${sug.domain}` : formData.url,
      category: sug.category || formData.category,
    });
  };

  const tierInfo = matchedService ? getTierLabel(matchedService.tier) : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ borderTop: `4px solid ${matchedService?.brandColor || 'var(--accent-primary)'}` }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{matchedService?.icon || '🔑'}</span>
            <span>{entry ? 'Edit Credential' : 'Add Credential'}</span>
            {tierInfo && (
              <span style={{ fontSize: '9px', padding: '2px 8px', borderRadius: '10px', background: tierInfo.bg, color: tierInfo.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {tierInfo.label}
              </span>
            )}
          </h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="form-field" style={{ position: 'relative' }}>
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
              {suggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', marginTop: '4px' }}>
                  {suggestions.map((sug) => (
                    <button
                      key={sug.name}
                      type="button"
                      onClick={() => handleSelectSuggestion(sug)}
                      style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                      onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.04)'}
                      onMouseLeave={(e) => e.target.style.background = 'none'}
                    >
                      <span>{sug.icon}</span>
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>{sug.name}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>{sug.domain}</span>
                    </button>
                  ))}
                </div>
              )}
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

  const cachedCount = getCachedBreachCount(password);
  const [breachCount, setBreachCount] = useState(cachedCount);
  const [checking, setChecking] = useState(false);

  const strength = analyzePassword(password);
  const reuse = checkPasswordReuse(password, allEntries, entryId);

  useEffect(() => {
    setBreachCount(getCachedBreachCount(password));
  }, [password]);

  const handleManualCheck = async (e) => {
    e.stopPropagation();
    setChecking(true);
    try {
      const count = await checkPasswordBreach(password);
      setBreachCount(count);
    } catch (err) {
      console.error(err);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
      <span
        style={{
          fontSize: 'var(--text-xs)',
          padding: '2px 8px',
          borderRadius: 'var(--radius-full)',
          background: strength.score >= 3 ? 'var(--success-subtle)' : strength.score >= 2 ? 'var(--warning-subtle)' : 'var(--danger-subtle)',
          color: strength.color,
          fontWeight: 600
        }}
      >
        {strength.label}
      </span>
      {reuse.isReused && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.08)', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
          ⚠️ Reused
        </span>
      )}
      {checking && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <div className="spinner" style={{ width: '10px', height: '10px', borderWidth: '1px', borderTopColor: 'var(--text-muted)' }} /> Checking...
        </span>
      )}
      {!checking && breachCount === null && (
        <button
          onClick={handleManualCheck}
          className="btn btn-ghost btn-sm"
          style={{
            fontSize: '10px',
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          🔍 Check leak database
        </button>
      )}
      {!checking && breachCount === 0 && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', background: 'rgba(16,185,129,0.08)', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
          🛡️ 0 leak matches in database
        </span>
      )}
      {!checking && breachCount > 0 && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)', background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontWeight: 700 }}>
          🚨 Found in {breachCount} public leaks!
        </span>
      )}
    </div>
  );
};

// ─── SMART IMPORT MODAL ───────────────────────────────────

const KNOWN_SERVICES = [
  { name: 'Gmail', url: 'https://mail.google.com', category: 'personal', keywords: ['gmail', 'google mail', 'googlemail'] },
  { name: 'Google', url: 'https://google.com', category: 'personal', keywords: ['google', 'google account'] },
  { name: 'Outlook', url: 'https://outlook.com', category: 'work', keywords: ['outlook', 'hotmail', 'live.com', 'msn'] },
  { name: 'Microsoft', url: 'https://microsoft.com', category: 'work', keywords: ['microsoft', 'azure', 'office 365', 'office365', 'ms365'] },
  { name: 'Apple', url: 'https://appleid.apple.com', category: 'personal', keywords: ['apple', 'apple id', 'icloud', 'apple account'] },
  { name: 'iCloud', url: 'https://icloud.com', category: 'personal', keywords: ['icloud', 'icloud.com'] },
  { name: 'GitHub', url: 'https://github.com', category: 'development', keywords: ['github', 'github.com'] },
  { name: 'GitLab', url: 'https://gitlab.com', category: 'development', keywords: ['gitlab', 'gitlab.com'] },
  { name: 'Twitter / X', url: 'https://x.com', category: 'social', keywords: ['twitter', 'x.com', 'tweet'] },
  { name: 'Instagram', url: 'https://instagram.com', category: 'social', keywords: ['instagram', 'insta'] },
  { name: 'Facebook', url: 'https://facebook.com', category: 'social', keywords: ['facebook', 'fb', 'facebook.com'] },
  { name: 'LinkedIn', url: 'https://linkedin.com', category: 'work', keywords: ['linkedin'] },
  { name: 'Discord', url: 'https://discord.com', category: 'social', keywords: ['discord', 'discord.com'] },
  { name: 'Slack', url: 'https://slack.com', category: 'work', keywords: ['slack', 'slack.com'] },
  { name: 'Zoom', url: 'https://zoom.us', category: 'work', keywords: ['zoom', 'zoom.us'] },
  { name: 'Netflix', url: 'https://netflix.com', category: 'general', keywords: ['netflix', 'netflix.com'] },
  { name: 'Spotify', url: 'https://spotify.com', category: 'general', keywords: ['spotify'] },
  { name: 'Amazon', url: 'https://amazon.com', category: 'shopping', keywords: ['amazon', 'amazon.com', 'prime'] },
  { name: 'PayPal', url: 'https://paypal.com', category: 'banking', keywords: ['paypal', 'paypal.com'] },
  { name: 'Stripe', url: 'https://stripe.com', category: 'banking', keywords: ['stripe'] },
  { name: 'Reddit', url: 'https://reddit.com', category: 'social', keywords: ['reddit', 'subreddit'] },
  { name: 'YouTube', url: 'https://youtube.com', category: 'general', keywords: ['youtube', 'yt'] },
  { name: 'Twitch', url: 'https://twitch.tv', category: 'social', keywords: ['twitch'] },
  { name: 'Steam', url: 'https://store.steampowered.com', category: 'general', keywords: ['steam', 'steampowered'] },
  { name: 'Epic Games', url: 'https://epicgames.com', category: 'general', keywords: ['epic games', 'epicgames', 'fortnite'] },
  { name: 'PlayStation', url: 'https://playstation.com', category: 'general', keywords: ['playstation', 'psn', 'ps5', 'ps4'] },
  { name: 'Xbox', url: 'https://xbox.com', category: 'general', keywords: ['xbox', 'xbox live', 'gamertag'] },
  { name: 'Dropbox', url: 'https://dropbox.com', category: 'work', keywords: ['dropbox'] },
  { name: 'Notion', url: 'https://notion.so', category: 'work', keywords: ['notion'] },
  { name: 'Figma', url: 'https://figma.com', category: 'development', keywords: ['figma'] },
  { name: 'Canva', url: 'https://canva.com', category: 'general', keywords: ['canva'] },
  { name: 'Adobe', url: 'https://adobe.com', category: 'work', keywords: ['adobe', 'photoshop', 'illustrator', 'adobe id'] },
  { name: 'Cloudflare', url: 'https://cloudflare.com', category: 'development', keywords: ['cloudflare'] },
  { name: 'AWS', url: 'https://aws.amazon.com', category: 'development', keywords: ['aws', 'amazon web services', 'ec2', 's3'] },
  { name: 'Vercel', url: 'https://vercel.com', category: 'development', keywords: ['vercel'] },
  { name: 'Heroku', url: 'https://heroku.com', category: 'development', keywords: ['heroku'] },
  { name: 'DigitalOcean', url: 'https://digitalocean.com', category: 'development', keywords: ['digitalocean', 'digital ocean'] },
  { name: 'Google Cloud', url: 'https://cloud.google.com', category: 'development', keywords: ['gcp', 'google cloud'] },
  { name: 'Jira', url: 'https://atlassian.com', category: 'work', keywords: ['jira', 'atlassian', 'confluence', 'bitbucket'] },
  { name: 'Trello', url: 'https://trello.com', category: 'work', keywords: ['trello'] },
  { name: 'Asana', url: 'https://asana.com', category: 'work', keywords: ['asana'] },
  { name: 'Shopify', url: 'https://shopify.com', category: 'shopping', keywords: ['shopify'] },
  { name: 'eBay', url: 'https://ebay.com', category: 'shopping', keywords: ['ebay', 'ebay.com'] },
  { name: 'Etsy', url: 'https://etsy.com', category: 'shopping', keywords: ['etsy'] },
  { name: 'WhatsApp', url: 'https://web.whatsapp.com', category: 'social', keywords: ['whatsapp'] },
  { name: 'Telegram', url: 'https://telegram.org', category: 'social', keywords: ['telegram'] },
  { name: 'Signal', url: 'https://signal.org', category: 'social', keywords: ['signal'] },
  { name: 'Yahoo', url: 'https://yahoo.com', category: 'personal', keywords: ['yahoo', 'yahoo mail'] },
  { name: 'Proton Mail', url: 'https://proton.me', category: 'personal', keywords: ['protonmail', 'proton mail', 'proton.me'] },
  { name: 'Bitwarden', url: 'https://bitwarden.com', category: 'general', keywords: ['bitwarden'] },
  { name: '1Password', url: 'https://1password.com', category: 'general', keywords: ['1password'] },
  { name: 'Dashlane', url: 'https://dashlane.com', category: 'general', keywords: ['dashlane'] },
  { name: 'LastPass', url: 'https://lastpass.com', category: 'general', keywords: ['lastpass'] },
  { name: 'Coinbase', url: 'https://coinbase.com', category: 'banking', keywords: ['coinbase', 'bitcoin', 'crypto', 'ethereum'] },
  { name: 'Binance', url: 'https://binance.com', category: 'banking', keywords: ['binance'] },
  { name: 'Chase', url: 'https://chase.com', category: 'banking', keywords: ['chase', 'jpmorgan'] },
  { name: 'Coursera', url: 'https://coursera.org', category: 'general', keywords: ['coursera'] },
  { name: 'Udemy', url: 'https://udemy.com', category: 'general', keywords: ['udemy'] },
  { name: 'Medium', url: 'https://medium.com', category: 'social', keywords: ['medium', 'medium.com'] },
  { name: 'Substack', url: 'https://substack.com', category: 'social', keywords: ['substack'] },
  { name: 'Snapchat', url: 'https://snapchat.com', category: 'social', keywords: ['snapchat', 'snap'] },
  { name: 'TikTok', url: 'https://tiktok.com', category: 'social', keywords: ['tiktok', 'tik tok'] },
  { name: 'Pinterest', url: 'https://pinterest.com', category: 'social', keywords: ['pinterest'] },
];

const parseServicesFromText = (text) => {
  if (!text) return [];
  const lower = text.toLowerCase();
  const found = [];
  const seenNames = new Set();
  for (const service of KNOWN_SERVICES) {
    for (const kw of service.keywords) {
      if (lower.includes(kw) && !seenNames.has(service.name)) {
        found.push(service);
        seenNames.add(service.name);
        break;
      }
    }
  }
  return found;
};

const parseCSV = (csvText) => {
  const lines = csvText.split('\n').map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Parse headers to find indexes
  const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').toLowerCase().trim());
  
  let nameIdx = headers.findIndex(h => ['name', 'title', 'label', 'service_name', 'service'].some(keyword => h === keyword || h.includes(keyword)));
  let urlIdx = headers.findIndex(h => ['url', 'website', 'link', 'login_uri', 'uri'].some(keyword => h === keyword || h.includes(keyword)));
  let userIdx = headers.findIndex(h => ['username', 'email', 'login_username', 'user', 'login_name'].some(keyword => h === keyword || h.includes(keyword)));
  let passIdx = headers.findIndex(h => ['password', 'secret', 'login_password', 'pass', 'code'].some(keyword => h === keyword || h.includes(keyword)));

  // Fallbacks if headers are missing/not recognized
  if (nameIdx === -1) nameIdx = 0;
  if (userIdx === -1) userIdx = headers.length > 1 ? 1 : 0;
  if (passIdx === -1) passIdx = headers.length > 2 ? 2 : 0;
  if (urlIdx === -1) urlIdx = headers.length > 3 ? 3 : 0;

  const parsed = [];
  for (let i = 1; i < lines.length; i++) {
    // Basic CSV splitting (handling commas inside quotes)
    const row = [];
    let current = '';
    let inQuotes = false;
    for (let char of lines[i]) {
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());

    const name = row[nameIdx]?.replace(/^["']|["']$/g, '') || '';
    if (!name) continue;

    const url = row[urlIdx]?.replace(/^["']|["']$/g, '') || '';
    const username = row[userIdx]?.replace(/^["']|["']$/g, '') || '';
    const password = row[passIdx]?.replace(/^["']|["']$/g, '') || '';

    // Map name to category
    let category = 'general';
    const lowerName = name.toLowerCase();
    if (lowerName.includes('mail') || lowerName.includes('google') || lowerName.includes('icloud') || lowerName.includes('outlook')) category = 'personal';
    else if (lowerName.includes('bank') || lowerName.includes('paypal') || lowerName.includes('coinbase') || lowerName.includes('stripe') || lowerName.includes('chase')) category = 'banking';
    else if (lowerName.includes('github') || lowerName.includes('gitlab') || lowerName.includes('aws') || lowerName.includes('vercel') || lowerName.includes('heroku') || lowerName.includes('cloudflare')) category = 'development';
    else if (lowerName.includes('facebook') || lowerName.includes('instagram') || lowerName.includes('twitter') || lowerName.includes('linkedin') || lowerName.includes('discord') || lowerName.includes('slack')) category = 'social';
    else if (lowerName.includes('amazon') || lowerName.includes('ebay') || lowerName.includes('etsy') || lowerName.includes('shopify')) category = 'shopping';
    else if (lowerName.includes('netflix') || lowerName.includes('spotify') || lowerName.includes('zoom') || lowerName.includes('notion') || lowerName.includes('figma')) category = 'work';

    parsed.push({
      name,
      url: url.startsWith('http') ? url : (url ? `https://${url}` : ''),
      category,
      username,
      password
    });
  }
  return parsed;
};

const SmartImportModal = ({ isOpen, onClose, allEntries, createEntry }) => {
  const [mode, setMode] = useState('menu'); // 'menu' | 'paste' | 'catalog' | 'csv' | 'review'
  const [pasteText, setPasteText] = useState('');
  const [csvText, setCsvText] = useState('');
  const [foundServices, setFoundServices] = useState([]);
  const [selectedServices, setSelectedServices] = useState(new Set());
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogSelected, setCatalogSelected] = useState(new Set());
  const [credentialsMap, setCredentialsMap] = useState({}); // { serviceName: { username, password } }
  const [saving, setSaving] = useState(false);

  const resetAll = () => {
    setMode('menu');
    setPasteText('');
    setCsvText('');
    setFoundServices([]);
    setSelectedServices(new Set());
    setCatalogSearch('');
    setCatalogSelected(new Set());
    setCredentialsMap({});
  };

  const handleParseText = () => {
    const found = parseServicesFromText(pasteText);
    if (found.length === 0) {
      toast.error('No recognizable services found in text. Try adding service names like "Gmail", "Netflix", "GitHub".');
      return;
    }
    setFoundServices(found);
    setSelectedServices(new Set(found.map(s => s.name)));
    setMode('review');
  };

  const handleParseCSV = () => {
    const parsed = parseCSV(csvText);
    if (parsed.length === 0) {
      toast.error('No valid accounts found in CSV. Make sure you have at least a Name, Username, and Password column.');
      return;
    }
    setFoundServices(parsed);
    setSelectedServices(new Set(parsed.map(s => s.name)));
    const creds = {};
    parsed.forEach(s => {
      creds[s.name] = { username: s.username, password: s.password };
    });
    setCredentialsMap(creds);
    setMode('review');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText(event.target.result);
      toast.success(`Successfully loaded ${file.name}! Click 'Start Parsing CSV' below.`);
    };
    reader.readAsText(file);
  };

  const handleCatalogConfirm = () => {
    const selected = KNOWN_SERVICES.filter(s => catalogSelected.has(s.name));
    setFoundServices(selected);
    setSelectedServices(new Set(selected.map(s => s.name)));
    setMode('review');
  };

  const isAlreadyInVault = (serviceName) => {
    return allEntries.some(e => (e.serviceName || '').toLowerCase().trim() === serviceName.toLowerCase().trim());
  };

  const handleSaveAll = async () => {
    const toSave = foundServices.filter(s => selectedServices.has(s.name) && !isAlreadyInVault(s.name));
    if (toSave.length === 0) {
      toast.error('No new services to add (all are already in vault or none selected).');
      return;
    }
    setSaving(true);
    try {
      let saved = 0;
      for (const service of toSave) {
        const creds = credentialsMap[service.name] || {};
        await createEntry({
          serviceName: service.name,
          username: creds.username || '',
          password: creds.password || '',
          url: service.url,
          category: service.category,
          notes: `Imported via Smart Import on ${new Date().toLocaleDateString()}.`,
        });
        saved++;
      }
      toast.success(`Added ${saved} account${saved !== 1 ? 's' : ''} to your vault!`);
      resetAll();
      onClose();
    } catch (err) {
      toast.error('Failed to save some accounts');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const filteredCatalog = KNOWN_SERVICES.filter(s =>
    !catalogSearch || s.name.toLowerCase().includes(catalogSearch.toLowerCase())
  );

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}>
      <div className="modal-content animate-scale-in" style={{ maxWidth: mode === 'review' ? '560px' : '480px' }}>
        <div className="modal-header">
          <h2 className="modal-title">⚡ Smart Account Import</h2>
          <button className="modal-close" onClick={() => { resetAll(); onClose(); }}>✕</button>
        </div>

        <div className="modal-body">

          {/* MENU */}
          {mode === 'menu' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Quickly add multiple accounts to your vault. Choose how you want to import:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '14px 16px', gap: '12px' }} onClick={() => setMode('paste')}>
                  <span style={{ fontSize: '20px' }}>📋</span>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>Paste Text / Email</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>Paste anything — emails, notes, browser history. We'll detect service names automatically.</div>
                  </div>
                </button>
                <button className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '14px 16px', gap: '12px' }} onClick={() => setMode('catalog')}>
                  <span style={{ fontSize: '20px' }}>🗂️</span>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>Pick from Service Catalog</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>Browse 60+ popular services and select which ones you have accounts on.</div>
                  </div>
                </button>
                <button className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '14px 16px', gap: '12px' }} onClick={() => setMode('csv')}>
                  <span style={{ fontSize: '20px' }}>📂</span>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>Import from Browser / CSV</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>Upload or paste a CSV export from Google Chrome, Safari, 1Password, or Bitwarden.</div>
                  </div>
                </button>
              </div>
              <div style={{ padding: '10px 12px', background: 'rgba(139,124,247,0.05)', border: '1px solid rgba(139,124,247,0.15)', borderRadius: 'var(--radius-sm)', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                🔒 <strong>Your data never leaves your device.</strong> Pattern matching runs entirely in your browser. No emails, no API calls, no scans.
              </div>
            </div>
          )}

          {/* PASTE TEXT */}
          {mode === 'paste' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Paste any text that mentions services you use — email confirmations, account summaries, browser bookmarks export, anything.
              </p>
              <textarea
                className="form-textarea"
                placeholder="e.g. 'I use Gmail for work, have a Netflix subscription, GitHub for code, and PayPal for payments...'"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={7}
                style={{ fontSize: '12px', lineHeight: 1.6 }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setMode('menu')}>← Back</button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleParseText} disabled={!pasteText.trim()}>
                  Detect Services →
                </button>
              </div>
            </div>
          )}

          {/* CSV IMPORT */}
          {mode === 'csv' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                Upload or paste a <strong>.csv</strong> export from Google Chrome, Safari, 1Password, or Bitwarden. We will parse it securely on your device.
              </p>

              <details style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', textAlign: 'left' }}>
                <summary style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', outline: 'none' }}>
                  💡 How do I export my passwords?
                </summary>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>
                  <p style={{ margin: '0 0 6px 0' }}><strong>Google Chrome:</strong> Go to Settings → Autofill and passwords → Password Manager → Settings → Export passwords (.csv).</p>
                  <p style={{ margin: '0 0 6px 0' }}><strong>Apple Safari:</strong> Go to Settings → Passwords → Click (...) icon → Export Passwords...</p>
                  <p style={{ margin: '0' }}><strong>Bitwarden / 1Password:</strong> Open your vault → Settings → Export Vault → Select File Format as .csv.</p>
                </div>
              </details>
              
              <div style={{ border: '2px dashed var(--border-default)', padding: '16px', borderRadius: 'var(--radius-md)', textAlign: 'center', background: 'rgba(255,255,255,0.01)', position: 'relative' }}>
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleFileUpload} 
                  style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer', width: '100%' }}
                />
                <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>📂</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Drag & drop CSV file or click to browse
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-default)' }} />
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>OR PASTE CSV TEXT BELOW</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-default)' }} />
              </div>

              <textarea
                className="form-textarea"
                placeholder="url,username,password&#10;https://github.com,yourusername,yourpassword"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={5}
                style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}
              />
              
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setMode('menu')}>← Back</button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleParseCSV} disabled={!csvText.trim()}>
                  Start Parsing CSV →
                </button>
              </div>
            </div>
          )}

          {/* CATALOG */}
          {mode === 'catalog' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search services..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                autoFocus
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '2px' }}>
                {filteredCatalog.map(service => {
                  const selected = catalogSelected.has(service.name);
                  const inVault = isAlreadyInVault(service.name);
                  return (
                    <button
                      key={service.name}
                      onClick={() => {
                        if (inVault) return;
                        const next = new Set(catalogSelected);
                        if (selected) next.delete(service.name); else next.add(service.name);
                        setCatalogSelected(next);
                      }}
                      style={{
                        padding: '8px 10px',
                        background: selected ? 'rgba(139,124,247,0.12)' : 'var(--bg-input)',
                        border: `1px solid ${selected ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                        borderRadius: 'var(--radius-sm)',
                        cursor: inVault ? 'default' : 'pointer',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: inVault ? 'var(--text-muted)' : 'var(--text-primary)',
                        textAlign: 'center',
                        position: 'relative',
                        opacity: inVault ? 0.5 : 1,
                      }}
                    >
                      {service.name}
                      {inVault && <span style={{ display: 'block', fontSize: '8px', color: 'var(--success)', marginTop: '2px' }}>✓ In vault</span>}
                      {selected && !inVault && <span style={{ display: 'block', fontSize: '8px', color: 'var(--accent-primary)', marginTop: '2px' }}>Selected</span>}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{catalogSelected.size} selected</div>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setMode('menu')}>← Back</button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleCatalogConfirm} disabled={catalogSelected.size === 0}>
                  Continue with {catalogSelected.size} services →
                </button>
              </div>
            </div>
          )}

          {/* REVIEW & FILL CREDENTIALS */}
          {mode === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                Found <strong>{foundServices.length}</strong> service{foundServices.length !== 1 ? 's' : ''}. Fill in your credentials (leave blank to save as a placeholder). Services already in your vault are skipped automatically.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '340px', overflowY: 'auto', paddingRight: '4px' }}>
                {foundServices.map(service => {
                  const inVault = isAlreadyInVault(service.name);
                  const isSelected = selectedServices.has(service.name);
                  const creds = credentialsMap[service.name] || { username: '', password: '' };
                  return (
                    <div
                      key={service.name}
                      style={{
                        padding: '12px 14px',
                        background: inVault ? 'rgba(46,213,115,0.03)' : 'var(--bg-input)',
                        border: `1px solid ${inVault ? 'rgba(46,213,115,0.2)' : isSelected ? 'var(--border-default)' : 'rgba(255,255,255,0.03)'}`,
                        borderRadius: 'var(--radius-sm)',
                        opacity: inVault || !isSelected ? 0.65 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: inVault ? 0 : '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '24px', height: '24px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                            <ServiceLogo name={service.name} url={service.url} category={service.category} size={14} />
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 600 }}>{service.name}</span>
                          {inVault && <span style={{ fontSize: '9px', color: 'var(--success)', background: 'rgba(46,213,115,0.1)', padding: '1px 6px', borderRadius: '4px' }}>✓ Already saved</span>}
                        </div>
                        {!inVault && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              const next = new Set(selectedServices);
                              if (isSelected) next.delete(service.name); else next.add(service.name);
                              setSelectedServices(next);
                            }}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                        )}
                      </div>
                      {!inVault && isSelected && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Email / Username"
                            value={creds.username}
                            onChange={(e) => setCredentialsMap(prev => ({ ...prev, [service.name]: { ...prev[service.name], username: e.target.value } }))}
                            style={{ fontSize: '11px', padding: '5px 10px', height: '30px' }}
                          />
                          <input
                            type="password"
                            className="form-input"
                            placeholder="Password (optional)"
                            value={creds.password}
                            onChange={(e) => setCredentialsMap(prev => ({ ...prev, [service.name]: { ...prev[service.name], password: e.target.value } }))}
                            style={{ fontSize: '11px', padding: '5px 10px', height: '30px' }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: '8px 10px', background: 'rgba(139,124,247,0.05)', border: '1px solid rgba(139,124,247,0.12)', borderRadius: 'var(--radius-sm)', fontSize: '10px', color: 'var(--text-muted)' }}>
                💡 Leaving password blank saves a placeholder entry — you can fill it in later from the edit screen.
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button className="btn btn-secondary" onClick={() => setMode('menu')}>← Back</button>
                <button
                  className="btn btn-primary btn-full"
                  onClick={handleSaveAll}
                  disabled={saving || selectedServices.size === 0}
                >
                  {saving ? 'Saving...' : `Add ${[...selectedServices].filter(n => !isAlreadyInVault(n)).length} New Account(s) to Vault`}
                </button>
              </div>
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
  const [scanStatus, setScanStatus] = useState('idle'); // 'idle' | 'scanning' | 'done'
  const [scanProgress, setScanProgress] = useState(0);

  // 1. Weak passwords: zxcvbn strength score < 3
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

  // 4. Breached passwords
  const breachedEntries = allEntries.filter(entry => {
    if (!entry.password) return false;
    const count = getCachedBreachCount(entry.password);
    return count !== null && count > 0;
  });

  const breachedCount = breachedEntries.length;
  const reusedCount = Object.values(reusedGroups).reduce((acc, grp) => acc + grp.length, 0);
  const weakCount = weakEntries.length;
  const similarCount = similarPairs.length;
  const totalCount = allEntries.length;
  const healthyCount = totalCount - (weakCount + totalDuplicatesCount + similarCount + breachedCount);

  const handleScanBreaches = async () => {
    const uniquePasswords = Array.from(new Set(allEntries.map(e => e.password).filter(Boolean)));
    const toScan = uniquePasswords.filter(p => getCachedBreachCount(p) === null);
    
    setScanStatus('scanning');
    setScanProgress(0);
    
    let completed = 0;
    const total = toScan.length;
    
    if (total === 0) {
      setScanStatus('done');
      setScanProgress(100);
      toast.success('All passwords scanned successfully!');
      return;
    }

    const chunkArray = (arr, size) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    const chunks = chunkArray(toScan, 3);
    for (const chunk of chunks) {
      await Promise.all(chunk.map(async (password) => {
        try {
          await checkPasswordBreach(password);
        } catch (e) {
          console.error('Breach scan failed for password:', e);
        }
      }));
      completed += chunk.length;
      setScanProgress(Math.round((completed / total) * 100));
      await new Promise(r => setTimeout(r, 100));
    }

    setScanStatus('done');
    toast.success('Password breach checkup complete!');
  };

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

      {/* Breach scanner control */}
      <div style={{
        padding: '16px 20px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🚨</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Password Leak Database Scan</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Compare all unique vault passwords against millions of leaked credentials using secure k-Anonymity (SHA-1 hashing).
            </div>
          </div>
        </div>
        <div>
          {scanStatus === 'idle' && (
            <button className="btn btn-secondary btn-sm" onClick={handleScanBreaches} style={{ padding: '8px 14px' }}>
              🔍 Scan Vault for Leaks
            </button>
          )}
          {scanStatus === 'scanning' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="spinner" style={{ width: '12px', height: '12px' }} />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Scanning ({scanProgress}%)</span>
            </div>
          )}
          {scanStatus === 'done' && (
            <button className="btn btn-ghost btn-sm" onClick={handleScanBreaches} style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.02)' }}>
              🔄 Re-scan Vault
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-4)' }}>
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
          <p style={{ fontSize: '20px', fontWeight: 700, color: '#ff4757', margin: '0 0 4px 0' }}>{breachedCount}</p>
          <p style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: 0 }}>Breached</p>
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

      {breachedCount > 0 && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'var(--space-2)' }}>
            <span>🚨</span> Passwords Found in Leaks
          </h3>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '-6px 0 12px 0', lineHeight: 1.4 }}>
            These password strings were matched against public databases of leaked credentials. You should change them immediately to avoid stuffing attacks.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {breachedEntries.map(entry => {
              const leakCount = getCachedBreachCount(entry.password);
              return (
                <div 
                  key={entry.id}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    background: 'rgba(255, 71, 87, 0.02)', 
                    border: '1px solid rgba(255, 71, 87, 0.1)', 
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
                    <span className="category-badge" style={{ color: 'var(--danger)', background: 'rgba(255, 71, 87, 0.08)', borderColor: 'rgba(255, 71, 87, 0.15)', fontSize: '9px', padding: '1px 6px' }}>
                      Exposed {leakCount} times
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
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {weakCount === 0 && totalDuplicatesCount === 0 && breachedCount === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-secondary)', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-lg)' }}>
          <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>🛡️</span>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--success)', marginBottom: '8px' }}>Your Vault is 100% Healthy!</h3>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0 }}>
            No weak, reused, duplicate, or breached passwords were found. Awesome job securing your digital life!
          </p>
        </div>
      )}

      {/* Zero-Knowledge Security Notice regarding Email/Account Monitoring */}
      <div style={{
        marginTop: 'var(--space-8)',
        padding: '16px 20px',
        background: 'rgba(139, 124, 247, 0.02)',
        border: '1px solid rgba(139, 124, 247, 0.12)',
        borderRadius: 'var(--radius-md)',
        fontSize: '11px',
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
        textAlign: 'left'
      }}>
        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-primary)', marginBottom: '8px', fontSize: '12px' }}>
          🔒 Weave's Zero-Knowledge Policy & Account Breach Monitoring
        </div>
        <p style={{ margin: '0 0 8px 0' }}>
          <strong>Why doesn't Weave automatically monitor your email addresses for database breaches?</strong> 
          Standard email/account breach monitoring requires querying third-party APIs (like Have I Been Pwned) with your raw, identifiable email addresses. Sending your usernames or recovery emails to external databases breaks Weave's strict zero-knowledge security standard, potentially exposing which services you own to third-party observers.
        </p>
        <p style={{ margin: 0 }}>
          For absolute metadata privacy, we recommend manually checking your email addresses directly at <a href="https://haveibeenpwned.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>Have I Been Pwned</a>. Weave only performs local k-Anonymity checks of your password <em>strings</em>, meaning your password hashes are never exposed to the network.
        </p>
      </div>
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

  const tierSummary = useMemo(() => {
    const t1 = allEntries.filter(e => { const t = getAccountType(e.serviceName); return t?.tier === 1 || t?.isIdentityAnchor; });
    const t2 = allEntries.filter(e => { const t = getAccountType(e.serviceName); return t?.tier === 2 && !t?.isIdentityAnchor; });
    const t3 = allEntries.filter(e => { const t = getAccountType(e.serviceName); return !t || t?.tier === 3; });
    return { t1, t2, t3 };
  }, [allEntries]);

  const overallHealth = useMemo(() => {
    if (allEntries.length === 0) return 0;
    const scores = allEntries.map(entry => {
      const { score: strengthScore } = analyzePassword(entry.password || '');
      const isReused = checkPasswordReuse(entry, allEntries);
      return computeAccountHealthScore(entry, { isReused, strengthScore });
    });
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [allEntries]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-12)' }}>
      {/* Header */}
      <div style={{ padding: 'var(--space-6)', background: 'rgba(139, 124, 247, 0.04)', border: '1px solid rgba(139, 124, 247, 0.15)', borderRadius: 'var(--radius-lg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: 'var(--space-2)' }}>🔗 Digital Identity Hub</h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Your complete account ecosystem — all credentials organized by tier. Track recovery chains, 2FA coverage, and security health across every account you own.
          </p>
        </div>
        {/* Overall health ring */}
        {allEntries.length > 0 && (() => {
          const hd = getHealthScoreDisplay(overallHealth);
          return (
            <div style={{ flexShrink: 0, textAlign: 'center', padding: '12px 20px', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)', border: `1px solid ${hd.color}33` }}>
              <div style={{ fontSize: '28px', fontWeight: 800, color: hd.color, lineHeight: 1 }}>{overallHealth}</div>
              <div style={{ fontSize: '9px', color: hd.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '4px' }}>Vault Health</div>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>{hd.label}</div>
            </div>
          );
        })()}
      </div>

      {/* Tier summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {[
          { label: 'Core Identity', count: tierSummary.t1.length, color: '#ef4444', bg: 'rgba(239,68,68,0.05)', icon: '🔑', tip: 'Accounts used to recover other accounts. Secure these first.' },
          { label: 'High Value', count: tierSummary.t2.length, color: '#f59e0b', bg: 'rgba(245,158,11,0.05)', icon: '⭐', tip: 'Financial, development, and professional accounts.' },
          { label: 'Standard', count: tierSummary.t3.length, color: '#10b981', bg: 'rgba(16,185,129,0.05)', icon: '🔓', tip: 'Social, entertainment, and everyday accounts.' },
        ].map(({ label, count, color, bg, icon, tip }) => (
          <div key={label} title={tip} style={{ padding: '14px 16px', background: bg, border: `1px solid ${color}22`, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '22px' }}>{icon}</span>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, color, lineHeight: 1 }}>{count}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>
            </div>
          </div>
        ))}
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

      {/* Identity Anchors (All accounts with tier + health) */}
      <div>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-4)' }}>
          All Accounts ({allEntries.length})
        </h3>
        {allEntries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-secondary)', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-md)' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
              No credentials yet. Add your Gmail, Outlook, Apple ID, and other accounts to visualize your identity ecosystem.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {allEntries.map(entry => {
              const accountType = getAccountType(entry.serviceName);
              const tierInfo = getTierLabel(accountType?.tier || 3);
              const { score: strengthScore } = analyzePassword(entry.password || '');
              const isReused = checkPasswordReuse(entry, allEntries);
              const healthScore = computeAccountHealthScore(entry, { isReused, strengthScore });
              const healthDisplay = getHealthScoreDisplay(healthScore);
              const brandColor = accountType?.brandColor || 'var(--accent-primary)';

              const sec2FA = get2FASecurityColor(entry.twoFactorMethod);
              const nodeName = (entry.username || '').toLowerCase().trim();
              const centralityItem = centralityRankings.find(c => c.node === nodeName);
              const blastRadiusVal = centralityItem?.blastRadius || 0;
              const isCriticalHub = centralityItem && (centralityItem.centrality > 0.3 || blastRadiusVal >= 2);
              
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
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
                  }}
                  className="hover-glow-card"
                >
                  {/* Brand color accent bar */}
                  <div style={{ height: '3px', background: brandColor, opacity: 0.7 }} />
                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

                    {/* Header row: logo + name + health score + tier */}
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
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.username || 'No username'}
                          </span>
                        </div>
                      </div>
                      {/* Health score + tier */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                        <div style={{ fontSize: '18px', fontWeight: 800, color: healthDisplay.color, lineHeight: 1 }}>{healthScore}</div>
                        <span style={{ fontSize: '8px', padding: '1px 6px', borderRadius: '10px', background: tierInfo.bg, color: tierInfo.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{tierInfo.label}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {nodeName && (
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => setSimulatingNode(simulatingNode === nodeName ? null : nodeName)}
                          style={{ padding: '2px 6px', fontSize: '9px', borderColor: isSimRoot ? 'var(--danger)' : 'var(--border-default)', flex: 1 }}
                        >
                          {isSimRoot ? 'Stop Sim' : '💥 Blast Radius'}
                        </button>
                      )}
                      <button 
                        className="btn btn-ghost btn-sm" 
                        onClick={() => onEditEntry(entry)}
                        style={{ padding: '2px 8px', fontSize: '10px' }}
                      >
                        Edit
                      </button>
                    </div>

                    {/* Critical hub warning */}
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

                    {/* Recovery details */}
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

const ServiceLogo = ({ name, url, category, size = 18 }) => {
  const [logoSrc, setLogoSrc] = useState('clearbit'); // 'clearbit' | 'google' | 'fallback'
  const domain = useMemo(() => {
    let d = extractDomain(url || '');
    if (!d) d = extractDomain(name || '');
    if (!d && name) {
      const match = name.toLowerCase().trim();
      if (match.includes('google')) d = 'google.com';
      else if (match.includes('gmail')) d = 'google.com';
      else if (match.includes('github')) d = 'github.com';
      else if (match.includes('outlook') || match.includes('microsoft')) d = 'microsoft.com';
      else if (match.includes('apple')) d = 'apple.com';
      else if (match.includes('icloud')) d = 'apple.com';
      else if (match.includes('netflix')) d = 'netflix.com';
      else if (match.includes('spotify')) d = 'spotify.com';
      else if (match.includes('amazon')) d = 'amazon.com';
      else if (match.includes('paypal')) d = 'paypal.com';
      else if (match.includes('stripe')) d = 'stripe.com';
      else if (match.includes('linkedin')) d = 'linkedin.com';
    }
    return d;
  }, [name, url]);

  const src = useMemo(() => {
    if (!domain || domain === 'localhost' || !domain.includes('.')) return null;
    if (logoSrc === 'clearbit') return `https://logo.clearbit.com/${domain}`;
    if (logoSrc === 'google') return `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
    return null;
  }, [domain, logoSrc]);

  const handleImageError = () => {
    if (logoSrc === 'clearbit') {
      setLogoSrc('google');
    } else if (logoSrc === 'google') {
      setLogoSrc('fallback');
    }
  };

  if (src) {
    return (
      <img 
        src={src} 
        alt={name} 
        onError={handleImageError} 
        style={{ width: `${size}px`, height: `${size}px`, borderRadius: '6px', objectFit: 'contain', display: 'block', background: 'transparent' }}
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
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '6px',
      background: bg,
      color: '#ffffff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: `${Math.max(8, size * 0.55)}px`,
      fontWeight: 700,
      textTransform: 'uppercase',
      flexShrink: 0
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

