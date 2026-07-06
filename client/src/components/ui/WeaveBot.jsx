import { useState, useEffect, useRef, useMemo } from 'react';
import { parseLocalBotQuery } from '../../lib/validators';
import useClipboard from '../../hooks/useClipboard';
import toast from 'react-hot-toast';

export const WeaveBot = ({ entries, onEditEntry, verifyMasterPassword }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'bot',
      text: "👋 Hello! I'm **Weave Bot**, your local privacy-first assistant. Any queries or actions you run here execute entirely on your device.\n\nHow can I help you find or audit your credentials today?",
      timestamp: new Date(),
    },
  ]);
  // Reprompt gate state
  const [repromptState, setRepromptState] = useState(null); // null | { password, onVerified, serviceName }
  const [repromptInput, setRepromptInput] = useState('');
  const [repromptLoading, setRepromptLoading] = useState(false);
  const { copy } = useClipboard();
  const chatEndRef = useRef(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = (textToSend) => {
    const userMessageText = textToSend || query;
    if (!userMessageText.trim()) return;

    // Add user message
    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: userMessageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuery('');

    // Process query locally using zero-knowledge NLP matching helper
    setTimeout(() => {
      const response = parseLocalBotQuery(userMessageText, entries);
      
      const botMsg = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: response.reply,
        type: response.type,
        matches: response.matches || [],
        suggestedPassword: response.suggestedPassword,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMsg]);
    }, 300);
  };

  const handleSuggestClick = (suggestion) => {
    handleSend(suggestion);
  };

  const handleCopyPassword = (password, serviceName) => {
    // Gate all password copies behind master password reprompt
    setRepromptState({ password, serviceName });
    setRepromptInput('');
  };

  const handleRepromptSubmit = async (e) => {
    e.preventDefault();
    if (!repromptState) return;
    setRepromptLoading(true);
    try {
      const ok = await verifyMasterPassword(repromptInput);
      if (!ok) {
        toast.error('Incorrect master password');
        return;
      }
      copy(repromptState.password);
      toast.success(`Copied password for ${repromptState.serviceName}`);
      setRepromptState(null);
      setRepromptInput('');
    } catch {
      toast.error('Verification failed');
    } finally {
      setRepromptLoading(false);
    }
  };

  return (
    <div className="weave-bot-container" style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 999 }}>
      {/* Floating Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--text-primary)',
          color: 'var(--bg-primary)',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.06)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        title="Weave Privacy Assistant"
      >
        {isOpen ? (
          <span style={{ fontSize: '24px', fontWeight: 300 }}>✕</span>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 6C13.66 6 15 7.34 15 9C15 10.66 13.66 12 12 12C10.34 12 9 10.66 9 9C9 7.34 10.34 6 12 6ZM12 18C9.33 18 7.02 16.63 5.75 14.53C5.78 12.44 9.94 11.3 12 11.3C14.05 11.3 18.22 12.44 18.25 14.53C16.98 16.63 14.67 18 12 18Z"
              fill="currentColor"
            />
          </svg>
        )}
      </button>

      {/* Sliding Dialog Chat Window */}
      {isOpen && (
        <div
          className="animate-scale-in"
          style={{
            position: 'absolute',
            bottom: '72px',
            right: '0',
            width: '380px',
            height: '520px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-default)',
              background: 'rgba(0,0,0,0.15)',
              display: 'flex',
              justifyContent: 'between',
              alignItems: 'center',
            }}
          >
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Weave Bot</h3>
              <p style={{ fontSize: '10px', color: 'var(--success)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }}></span>
                100% On-Device · Local Rule-Based Search
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                fontSize: '16px',
              }}
            >
              ✕
            </button>
          </div>

          {/* Chat History Panel */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                {/* Text Balloon */}
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: msg.sender === 'user' ? 'var(--bg-tertiary)' : 'rgba(255, 255, 255, 0.02)',
                    border: msg.sender === 'user' ? '1px solid var(--border-default)' : '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.5',
                  }}
                >
                  {msg.text}
                </div>

                {/* Match List Renderer */}
                {msg.matches && msg.matches.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    {msg.matches.map((match) => (
                      <div
                        key={match.id}
                        style={{
                          padding: '10px 12px',
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '24px', height: '24px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                              <ServiceLogo name={match.serviceName} url={match.url} category={match.category} size={14} />
                            </div>
                            <span style={{ fontWeight: 600, fontSize: '12px' }}>{match.serviceName}</span>
                          </div>
                          <span className={`category-badge ${match.category.toLowerCase()}`} style={{ fontSize: '8px', padding: '1px 6px' }}>
                            {match.category}
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                          {match.username || 'No username'}
                        </span>
                        
                        <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ flex: 1, padding: '4px 8px', fontSize: '10px', height: '24px' }}
                            onClick={() => handleCopyPassword(match.password, match.serviceName)}
                          >
                            📋 Copy Pass
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px', fontSize: '10px', height: '24px' }}
                            onClick={() => {
                              setIsOpen(false);
                              onEditEntry(match);
                            }}
                          >
                            👁️ View
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Password Suggester Match Action */}
                {msg.suggestedPassword && (
                  <div
                    style={{
                      marginTop: '6px',
                      padding: '10px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--warning)', wordBreak: 'break-all' }}>
                      {msg.suggestedPassword}
                    </code>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ padding: '4px 8px', fontSize: '10px', height: '24px' }}
                      onClick={() => handleCopyPassword(msg.suggestedPassword, 'generated password')}
                    >
                      📋 Copy
                    </button>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Suggestions Chips */}
          <div
            style={{
              padding: '8px 12px',
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              background: 'rgba(0,0,0,0.08)',
              borderTop: '1px solid var(--border-default)',
            }}
          >
            <button
              onClick={() => handleSuggestClick('Perform a security audit')}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)',
                fontSize: '10px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              🛡️ Audit Vault
            </button>
            <button
              onClick={() => handleSuggestClick('Suggest a password')}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)',
                fontSize: '10px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              🎲 Generate Pass
            </button>
            <button
              onClick={() => handleSuggestClick('Help')}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)',
                fontSize: '10px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              ❓ Help
            </button>
          </div>

          {/* Master Password Reprompt Gate */}
          {repromptState && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-default)', background: 'rgba(239, 68, 68, 0.04)' }}>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.4 }}>
                🔐 Enter master password to copy password for <strong>{repromptState.serviceName}</strong>:
              </p>
              <form onSubmit={handleRepromptSubmit} style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="password"
                  placeholder="Master password..."
                  value={repromptInput}
                  onChange={(e) => setRepromptInput(e.target.value)}
                  autoFocus
                  style={{ flex: 1, padding: '5px 10px', background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '12px', outline: 'none' }}
                />
                <button type="submit" className="btn btn-primary" style={{ padding: '5px 10px', fontSize: '10px', height: '28px' }} disabled={repromptLoading || !repromptInput}>
                  {repromptLoading ? '...' : 'Verify'}
                </button>
                <button type="button" className="btn btn-ghost" style={{ padding: '5px 8px', fontSize: '10px', height: '28px' }} onClick={() => { setRepromptState(null); setRepromptInput(''); }}>✕</button>
              </form>
            </div>
          )}

          {/* Footer Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border-default)',
              background: 'rgba(0,0,0,0.15)',
              display: 'flex',
              gap: '8px',
            }}
          >
            <input
              type="text"
              placeholder="Ask Weave Bot..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                flex: 1,
                padding: '6px 12px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              style={{ padding: '6px 12px', fontSize: '11px', height: '28px' }}
              disabled={!query.trim()}
            >
              Send
            </button>
          </form>
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

export default WeaveBot;
