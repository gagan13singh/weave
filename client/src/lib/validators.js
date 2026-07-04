/**
 * Validators
 * 
 * Client-side validation utilities for:
 * - Password strength (using zxcvbn)
 * - Reused password detection
 * - Input validation
 * 
 * All computed locally — never sent to the server.
 */

import zxcvbn from 'zxcvbn';

/**
 * Analyze password strength using zxcvbn.
 * Returns a score (0–4) and human-readable feedback.
 * 
 * zxcvbn is Dropbox's password strength estimator:
 * - Pattern-based (not just character classes)
 * - Estimates actual crack time
 * - Provides specific feedback ("avoid common words", etc.)
 */
export const analyzePassword = (password) => {
  if (!password) {
    return { score: 0, label: '', feedback: '', crackTime: '' };
  }

  const result = zxcvbn(password);

  const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
  const colors = ['#ff4757', '#ff6b6b', '#ffa502', '#2ed573', '#00d2d3'];

  return {
    score: result.score,
    label: labels[result.score],
    color: colors[result.score],
    feedback: result.feedback.warning || result.feedback.suggestions?.[0] || '',
    crackTime: result.crack_times_display.offline_slow_hashing_1e4_per_second,
    crackTimeSeconds: result.crack_times_seconds.offline_slow_hashing_1e4_per_second,
  };
};

/**
 * Check if a password is reused across vault entries.
 * Compares against all decrypted vault entries in memory.
 * 
 * @param {string} password - Password to check
 * @param {Array} vaultEntries - Decrypted vault entries
 * @param {string} [excludeId] - Entry ID to exclude (when editing)
 * @returns {{ isReused: boolean, reusedIn: string[] }}
 */
export const checkPasswordReuse = (password, vaultEntries, excludeId) => {
  if (!password || !vaultEntries.length) {
    return { isReused: false, reusedIn: [] };
  }

  const reusedIn = vaultEntries
    .filter((entry) => entry.id !== excludeId && entry.password === password)
    .map((entry) => entry.serviceName);

  return {
    isReused: reusedIn.length > 0,
    reusedIn,
  };
};

/**
 * Levenshtein distance — O(n*m) DP, pure client-side.
 * Measures the minimum number of single-character edits
 * (insertions, deletions, substitutions) to transform one string into another.
 * 
 * Used for weak-variation reuse detection (e.g., "Sajjan@123" vs "Sajjan@124").
 * Runs entirely in browser memory — passwords are never sent anywhere.
 */
export const levenshteinDistance = (a, b) => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
};

/**
 * Find passwords that are weak variations of each other.
 * 
 * Catches patterns like:
 * - Summer2024! vs Summer2025!  (digit change)
 * - Sajjan@123 vs Sajjan@124    (increment)
 * - password123 vs Password123  (case change)
 * 
 * Normalized similarity = 1 - (distance / max(len_a, len_b))
 * Threshold of 0.65 catches 1-3 character variations in typical passwords.
 * 
 * @param {Array} entries - Decrypted vault entries with passwords
 * @param {number} threshold - Similarity threshold (0-1), default 0.65
 * @returns {Array<{ entryA: Object, entryB: Object, similarity: number }>}
 */
export const findSimilarPasswords = (entries, threshold = 0.65) => {
  const pairs = [];
  const withPasswords = entries.filter(e => e.password && e.password.length >= 4);

  for (let i = 0; i < withPasswords.length; i++) {
    for (let j = i + 1; j < withPasswords.length; j++) {
      const a = withPasswords[i].password;
      const b = withPasswords[j].password;

      // Skip exact matches (already caught by checkPasswordReuse)
      if (a === b) continue;

      // Skip if lengths differ by more than 40% (unlikely to be variations)
      if (Math.abs(a.length - b.length) / Math.max(a.length, b.length) > 0.4) continue;

      const distance = levenshteinDistance(a, b);
      const maxLen = Math.max(a.length, b.length);
      const similarity = 1 - (distance / maxLen);

      if (similarity >= threshold) {
        pairs.push({
          entryA: withPasswords[i],
          entryB: withPasswords[j],
          similarity: Math.round(similarity * 100),
        });
      }
    }
  }

  // Sort by similarity descending
  pairs.sort((a, b) => b.similarity - a.similarity);
  return pairs;
};

/**
 * Validate email format.
 */
export const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * Validate master password requirements.
 * We recommend strong passwords but don't enforce arbitrary rules
 * (e.g., "must have uppercase + symbol") since zxcvbn handles
 * actual strength assessment.
 */
export const validateMasterPassword = (password) => {
  const errors = [];

  if (password.length < 8) {
    errors.push('Must be at least 8 characters');
  }

  if (password.length > 128) {
    errors.push('Must be 128 characters or fewer');
  }

  const strength = analyzePassword(password);
  if (strength.score < 2) {
    errors.push('Password is too weak. Try adding more unique words.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    strength,
  };
};

/**
 * Generate a strong random password.
 * Uses crypto.getRandomValues for true randomness.
 */
export const generatePassword = (length = 20, options = {}) => {
  const {
    uppercase = true,
    lowercase = true,
    numbers = true,
    symbols = true,
  } = options;

  let chars = '';
  if (lowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
  if (uppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (numbers) chars += '0123456789';
  if (symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (!chars) chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  const array = new Uint32Array(length);
  crypto.getRandomValues(array);

  return Array.from(array, (num) => chars[num % chars.length]).join('');
};

/**
 * Generate a strong, memorable master passphrase using the Diceware concept.
 * Selects 4 random visual words and appends a secure single digit.
 */
export const generateMasterPassphrase = () => {
  const wordsList = [
    'cosmic', 'velvet', 'crater', 'glimmer', 'orbit', 'gravity', 'nebula', 'anchor',
    'matrix', 'shadow', 'beacon', 'canvas', 'vertex', 'spiral', 'quiver', 'summit',
    'canyon', 'fossil', 'quartz', 'aurora', 'timber', 'glacier', 'breeze', 'harbor',
    'pulsar', 'comet', 'meteor', 'galaxy', 'lunar', 'solar', 'stellar', 'zenith',
    'plasma', 'proton', 'vector', 'cortex', 'cipher', 'tunnel', 'weaver', 'sensor',
    'shield', 'helmet', 'castle', 'temple', 'bridge', 'geyser', 'monolith', 'prism',
    'safari', 'tundra', 'desert', 'forest', 'canyon', 'valley', 'volcano', 'island'
  ];

  const randomIndices = new Uint32Array(4);
  crypto.getRandomValues(randomIndices);

  const words = Array.from(randomIndices).map((num) => wordsList[num % wordsList.length]);
  
  const randomNumberArray = new Uint32Array(1);
  crypto.getRandomValues(randomNumberArray);
  const number = (randomNumberArray[0] % 9) + 1; // 1-9

  return `${words.join('-')}-${number}`;
};

/**
 * Parses user chatbot natural language queries locally against decrypted credentials.
 * 100% Client-Side — Apple-level privacy (zero server transmission).
 */
export const parseLocalBotQuery = (query, entries) => {
  const cleanQuery = query.toLowerCase().trim();

  // 1. Help / Greeting intent
  if (
    cleanQuery === 'help' ||
    cleanQuery.includes('help') ||
    cleanQuery === 'hello' ||
    cleanQuery.startsWith('hi') ||
    cleanQuery === 'hey' ||
    cleanQuery === '?'
  ) {
    return {
      reply: `👋 Hello! I'm **Weave Bot**, your local privacy-first assistant. You can ask me to:
- Find credentials: *"Where is GitHub?"* or *"Get Netflix login"*
- Run a security check: *"Perform a security audit"*
- Generate a password: *"Suggest a password"*`,
      type: 'help',
      matches: []
    };
  }

  // 2. Password security audit intent
  if (cleanQuery.includes('weak') || cleanQuery.includes('audit') || cleanQuery.includes('reused') || cleanQuery.includes('security') || cleanQuery.includes('check')) {
    const weak = entries.filter(e => analyzePassword(e.password).score < 3);
    const reused = entries.filter(e => checkPasswordReuse(e.password, entries, e.id).isReused);
    
    if (weak.length === 0 && reused.length === 0) {
      return {
        reply: "🛡️ I analyzed your vault. Your credentials look solid! No weak or reused passwords detected.",
        type: 'audit_success',
        matches: []
      };
    }

    let reply = `🛡️ **Security Audit Results**:\n`;
    if (weak.length > 0) {
      reply += `- Found **${weak.length}** entries with fair/weak passwords.\n`;
    }
    if (reused.length > 0) {
      reply += `- Found **${reused.length}** entries with reused passwords.\n`;
    }
    reply += `I recommend reviewing them to secure your accounts.`;
    
    const uniqueMatches = Array.from(new Set([...weak, ...reused]));
    return {
      reply,
      type: 'audit_warning',
      matches: uniqueMatches
    };
  }

  // 3. Generate password intent
  if (
    cleanQuery.includes('generate') ||
    cleanQuery.includes('suggest') ||
    cleanQuery.includes('create') ||
    cleanQuery.includes('random')
  ) {
    return {
      reply: "🎲 I generated a new secure password for you:",
      type: 'generate',
      suggestedPassword: generatePassword(20),
      matches: []
    };
  }

  // 4. Category search intent
  const categoriesList = ['work', 'personal', 'banking', 'social', 'development', 'dev', 'shopping', 'general'];
  const categoryMatch = categoriesList.find(cat => cleanQuery.includes(cat));
  if (categoryMatch) {
    const targetCat = categoryMatch === 'dev' ? 'development' : categoryMatch;
    const matches = entries.filter(e => e.category.toLowerCase() === targetCat);
    if (matches.length > 0) {
      return {
        reply: `📁 Found **${matches.length}** credentials inside your **${targetCat}** category:`,
        type: 'list',
        matches
      };
    }
  }

  // 5. Fuzzy search intent
  const stopWords = new Set(['find', 'my', 'password', 'for', 'login', 'credentials', 'account', 'show', 'me', 'where', 'is', 'get', 'the', 'please', 'any', 'website', 'of', 'bot', 'weave']);
  const keywords = cleanQuery.split(/\s+/).filter(word => word && !stopWords.has(word));

  if (keywords.length === 0) {
    return {
      reply: `👋 Hello! I'm **Weave Bot**, your local privacy-first assistant. You can ask me to:
- Find credentials: *"Where is GitHub?"* or *"Get Netflix login"*
- Run a security check: *"Perform a security audit"*
- Generate a password: *"Suggest a password"*`,
      type: 'help',
      matches: []
    };
  }

  // Score matches based on keyword hits
  const scoredEntries = entries.map(entry => {
    let score = 0;
    const service = entry.serviceName.toLowerCase();
    const user = entry.username.toLowerCase();
    const notes = entry.notes?.toLowerCase() || '';
    const url = entry.url?.toLowerCase() || '';

    keywords.forEach(kw => {
      if (service === kw) score += 10;
      else if (service.includes(kw)) score += 5;
      if (user.includes(kw)) score += 3;
      if (url.includes(kw)) score += 2;
      if (notes.includes(kw)) score += 1;
    });

    return { entry, score };
  }).filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scoredEntries.length > 0) {
    const matches = scoredEntries.map(item => item.entry);
    return {
      reply: `🔍 I searched your vault and found **${matches.length}** match${matches.length > 1 ? 'es' : ''}:`,
      type: 'list',
      matches
    };
  }

  return {
    reply: `❌ I couldn't find any credentials matching your request. Try typing "help" to see what I can do.`,
    type: 'empty',
    matches: []
  };
};
