/**
 * accountTypes.js
 *
 * Central registry of known account types with brand metadata.
 * Powers: SmartImport detection, IdentityHub classification, health scoring.
 */

export const ACCOUNT_TYPES = [
  // CORE IDENTITY (Tier 1)
  { name: 'Gmail', domain: 'mail.google.com', brandColor: '#EA4335', category: 'personal', tier: 1, icon: '📧', isIdentityAnchor: true },
  { name: 'Google', domain: 'google.com', brandColor: '#4285F4', category: 'personal', tier: 1, icon: '🔍', isIdentityAnchor: true },
  { name: 'Apple ID', domain: 'appleid.apple.com', brandColor: '#1d1d1f', category: 'personal', tier: 1, icon: '🍎', isIdentityAnchor: true },
  { name: 'iCloud', domain: 'icloud.com', brandColor: '#1d9bf0', category: 'personal', tier: 1, icon: '☁️', isIdentityAnchor: true },
  { name: 'Outlook', domain: 'outlook.com', brandColor: '#0078d4', category: 'work', tier: 1, icon: '📫', isIdentityAnchor: true },
  { name: 'Microsoft', domain: 'microsoft.com', brandColor: '#0078d4', category: 'work', tier: 1, icon: '🪟', isIdentityAnchor: true },
  { name: 'Yahoo Mail', domain: 'yahoo.com', brandColor: '#6001d2', category: 'personal', tier: 1, icon: '📬', isIdentityAnchor: true },
  { name: 'Proton Mail', domain: 'proton.me', brandColor: '#6d4aff', category: 'personal', tier: 1, icon: '🔐', isIdentityAnchor: true },
  // HIGH VALUE (Tier 2)
  { name: 'GitHub', domain: 'github.com', brandColor: '#24292f', category: 'development', tier: 2, icon: '💻', isIdentityAnchor: false },
  { name: 'GitLab', domain: 'gitlab.com', brandColor: '#fc6d26', category: 'development', tier: 2, icon: '🦊', isIdentityAnchor: false },
  { name: 'LinkedIn', domain: 'linkedin.com', brandColor: '#0077b5', category: 'work', tier: 2, icon: '💼', isIdentityAnchor: false },
  { name: 'PayPal', domain: 'paypal.com', brandColor: '#003087', category: 'banking', tier: 2, icon: '💳', isIdentityAnchor: false },
  { name: 'Stripe', domain: 'stripe.com', brandColor: '#635bff', category: 'banking', tier: 2, icon: '💰', isIdentityAnchor: false },
  { name: 'Amazon', domain: 'amazon.com', brandColor: '#ff9900', category: 'shopping', tier: 2, icon: '📦', isIdentityAnchor: false },
  { name: 'AWS', domain: 'aws.amazon.com', brandColor: '#ff9900', category: 'development', tier: 2, icon: '☁️', isIdentityAnchor: false },
  { name: 'Cloudflare', domain: 'cloudflare.com', brandColor: '#f6821f', category: 'development', tier: 2, icon: '🔥', isIdentityAnchor: false },
  { name: 'Vercel', domain: 'vercel.com', brandColor: '#000000', category: 'development', tier: 2, icon: '▲', isIdentityAnchor: false },
  { name: 'Adobe', domain: 'adobe.com', brandColor: '#ff0000', category: 'work', tier: 2, icon: '🎨', isIdentityAnchor: false },
  // SOCIAL (Tier 3)
  { name: 'Twitter / X', domain: 'x.com', brandColor: '#1da1f2', category: 'social', tier: 3, icon: '🐦', isIdentityAnchor: false },
  { name: 'Instagram', domain: 'instagram.com', brandColor: '#e4405f', category: 'social', tier: 3, icon: '📷', isIdentityAnchor: false },
  { name: 'Facebook', domain: 'facebook.com', brandColor: '#1877f2', category: 'social', tier: 3, icon: '👤', isIdentityAnchor: false },
  { name: 'Discord', domain: 'discord.com', brandColor: '#5865f2', category: 'social', tier: 3, icon: '🎮', isIdentityAnchor: false },
  { name: 'Reddit', domain: 'reddit.com', brandColor: '#ff4500', category: 'social', tier: 3, icon: '🤖', isIdentityAnchor: false },
  { name: 'TikTok', domain: 'tiktok.com', brandColor: '#010101', category: 'social', tier: 3, icon: '🎵', isIdentityAnchor: false },
  { name: 'Snapchat', domain: 'snapchat.com', brandColor: '#fffc00', category: 'social', tier: 3, icon: '👻', isIdentityAnchor: false },
  { name: 'Pinterest', domain: 'pinterest.com', brandColor: '#e60023', category: 'social', tier: 3, icon: '📌', isIdentityAnchor: false },
  { name: 'Twitch', domain: 'twitch.tv', brandColor: '#9146ff', category: 'social', tier: 3, icon: '🎙️', isIdentityAnchor: false },
  { name: 'YouTube', domain: 'youtube.com', brandColor: '#ff0000', category: 'social', tier: 3, icon: '▶️', isIdentityAnchor: false },
  { name: 'Medium', domain: 'medium.com', brandColor: '#000000', category: 'social', tier: 3, icon: '📝', isIdentityAnchor: false },
  // WORK (Tier 3)
  { name: 'Slack', domain: 'slack.com', brandColor: '#4a154b', category: 'work', tier: 3, icon: '💬', isIdentityAnchor: false },
  { name: 'Zoom', domain: 'zoom.us', brandColor: '#2d8cff', category: 'work', tier: 3, icon: '📹', isIdentityAnchor: false },
  { name: 'Notion', domain: 'notion.so', brandColor: '#000000', category: 'work', tier: 3, icon: '📄', isIdentityAnchor: false },
  { name: 'Figma', domain: 'figma.com', brandColor: '#f24e1e', category: 'development', tier: 3, icon: '🎭', isIdentityAnchor: false },
  { name: 'Jira', domain: 'atlassian.com', brandColor: '#0052cc', category: 'work', tier: 3, icon: '🗂️', isIdentityAnchor: false },
  { name: 'Trello', domain: 'trello.com', brandColor: '#0052cc', category: 'work', tier: 3, icon: '📋', isIdentityAnchor: false },
  { name: 'Asana', domain: 'asana.com', brandColor: '#f06a6a', category: 'work', tier: 3, icon: '✅', isIdentityAnchor: false },
  { name: 'Dropbox', domain: 'dropbox.com', brandColor: '#0061ff', category: 'work', tier: 3, icon: '📁', isIdentityAnchor: false },
  { name: 'Canva', domain: 'canva.com', brandColor: '#00c4cc', category: 'work', tier: 3, icon: '🖌️', isIdentityAnchor: false },
  // GAMING (Tier 3)
  { name: 'Steam', domain: 'store.steampowered.com', brandColor: '#1b2838', category: 'general', tier: 3, icon: '🎮', isIdentityAnchor: false },
  { name: 'Epic Games', domain: 'epicgames.com', brandColor: '#2a2a2a', category: 'general', tier: 3, icon: '🎯', isIdentityAnchor: false },
  { name: 'PlayStation', domain: 'playstation.com', brandColor: '#003791', category: 'general', tier: 3, icon: '🕹️', isIdentityAnchor: false },
  { name: 'Xbox', domain: 'xbox.com', brandColor: '#107c10', category: 'general', tier: 3, icon: '🟢', isIdentityAnchor: false },
  // ENTERTAINMENT (Tier 3)
  { name: 'Netflix', domain: 'netflix.com', brandColor: '#e50914', category: 'general', tier: 3, icon: '🎬', isIdentityAnchor: false },
  { name: 'Spotify', domain: 'spotify.com', brandColor: '#1db954', category: 'general', tier: 3, icon: '🎵', isIdentityAnchor: false },
  // SHOPPING (Tier 3)
  { name: 'eBay', domain: 'ebay.com', brandColor: '#e53238', category: 'shopping', tier: 3, icon: '🛒', isIdentityAnchor: false },
  { name: 'Etsy', domain: 'etsy.com', brandColor: '#f56400', category: 'shopping', tier: 3, icon: '🛍️', isIdentityAnchor: false },
  { name: 'Shopify', domain: 'shopify.com', brandColor: '#96bf48', category: 'shopping', tier: 3, icon: '🏪', isIdentityAnchor: false },
  // CRYPTO/BANKING (Tier 2)
  { name: 'Coinbase', domain: 'coinbase.com', brandColor: '#0052ff', category: 'banking', tier: 2, icon: '₿', isIdentityAnchor: false },
  { name: 'Binance', domain: 'binance.com', brandColor: '#f3ba2f', category: 'banking', tier: 2, icon: '🔶', isIdentityAnchor: false },
  { name: 'Chase', domain: 'chase.com', brandColor: '#117aca', category: 'banking', tier: 2, icon: '🏦', isIdentityAnchor: false },
  // CLOUD (Tier 2)
  { name: 'Heroku', domain: 'heroku.com', brandColor: '#6762a6', category: 'development', tier: 2, icon: '🚀', isIdentityAnchor: false },
  { name: 'DigitalOcean', domain: 'digitalocean.com', brandColor: '#0080ff', category: 'development', tier: 2, icon: '🌊', isIdentityAnchor: false },
  { name: 'Google Cloud', domain: 'cloud.google.com', brandColor: '#4285f4', category: 'development', tier: 2, icon: '☁️', isIdentityAnchor: false },
  // MESSAGING (Tier 3)
  { name: 'WhatsApp', domain: 'web.whatsapp.com', brandColor: '#25d366', category: 'social', tier: 3, icon: '💬', isIdentityAnchor: false },
  { name: 'Telegram', domain: 'telegram.org', brandColor: '#26a5e4', category: 'social', tier: 3, icon: '✈️', isIdentityAnchor: false },
  { name: 'Signal', domain: 'signal.org', brandColor: '#3a76f0', category: 'social', tier: 3, icon: '🔒', isIdentityAnchor: false },
  // PASSWORD MANAGERS
  { name: 'Bitwarden', domain: 'bitwarden.com', brandColor: '#175ddc', category: 'general', tier: 2, icon: '🗝️', isIdentityAnchor: false },
  { name: '1Password', domain: '1password.com', brandColor: '#1a8cff', category: 'general', tier: 2, icon: '🔑', isIdentityAnchor: false },
  { name: 'LastPass', domain: 'lastpass.com', brandColor: '#d32d27', category: 'general', tier: 2, icon: '🔒', isIdentityAnchor: false },
];

export const getAccountType = (nameOrDomain) => {
  if (!nameOrDomain) return null;
  const q = nameOrDomain.toLowerCase().trim();
  return ACCOUNT_TYPES.find(t =>
    t.name.toLowerCase() === q ||
    t.domain.toLowerCase().includes(q) ||
    q.includes(t.domain.split('.')[0]) ||
    q.includes(t.name.toLowerCase().split(' ')[0])
  ) || null;
};

export const getTierLabel = (tier) => {
  switch (tier) {
    case 1: return { label: 'Core Identity', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' };
    case 2: return { label: 'High Value', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' };
    case 3: return { label: 'Standard', color: '#10b981', bg: 'rgba(16,185,129,0.08)' };
    default: return { label: 'Unknown', color: '#6b7280', bg: 'rgba(107,114,128,0.08)' };
  }
};

export const computeAccountHealthScore = (entry, { isReused = false, strengthScore = 0 } = {}) => {
  let score = 0;
  const pwd = entry.password || '';
  if (pwd.length >= 12) score += 30;
  else if (pwd.length >= 8) score += 15;
  else if (pwd.length > 0) score += 5;
  if (strengthScore >= 3) score += 20;
  else if (strengthScore >= 2) score += 10;
  if (entry.twoFactorMethod === 'hardware') score += 30;
  else if (entry.twoFactorMethod === 'authenticator') score += 20;
  else if (entry.twoFactorMethod === 'email' || entry.twoFactorMethod === 'sms') score += 10;
  if (entry.recoveryEmail) score += 15;
  if (entry.backupCodes) score += 10;
  if (entry.recoveryPhone) score += 5;
  if (isReused) score -= 20;
  if (pwd.length > 0 && pwd.length < 8) score -= 10;
  return Math.max(0, Math.min(100, score));
};

export const getHealthScoreDisplay = (score) => {
  if (score >= 80) return { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Excellent' };
  if (score >= 60) return { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', label: 'Good' };
  if (score >= 40) return { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Fair' };
  if (score >= 20) return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Poor' };
  return { color: '#7f1d1d', bg: 'rgba(127,29,29,0.1)', label: 'Critical' };
};
