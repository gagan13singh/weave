/**
 * Natural Language Vault Search
 * 
 * On-device semantic search over vault entries.
 * Uses tokenization, synonym expansion, fuzzy matching (Levenshtein),
 * and TF-IDF scoring — all running locally in browser memory.
 * 
 * No external APIs, no network requests, zero-knowledge.
 * 
 * Supports queries like:
 * - "my college wifi password"
 * - "which account did I use for that gurdwara portal"
 * - "streaming service"
 */

import { levenshteinDistance } from './validators';

// ─── STOP WORDS ──────────────────────────────────────────
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'am', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'shall', 'should', 'may', 'might', 'must', 'can', 'could',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it',
  'they', 'them', 'their', 'this', 'that', 'these', 'those',
  'what', 'which', 'who', 'whom', 'where', 'when', 'how', 'why',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
  'and', 'or', 'but', 'not', 'if', 'then', 'so', 'as',
  'up', 'out', 'about', 'into', 'over', 'after',
  'password', 'pass', 'login', 'account', 'credentials', 'creds',
]);

// ─── SYNONYM DICTIONARY ──────────────────────────────────
const SYNONYMS = {
  'wifi': ['wi-fi', 'wireless', 'router', 'network', 'internet', 'hotspot', 'broadband'],
  'email': ['gmail', 'outlook', 'mail', 'inbox', 'yahoo', 'protonmail', 'icloud'],
  'college': ['university', 'school', 'campus', 'student', 'edu', 'academic'],
  'work': ['office', 'job', 'company', 'corporate', 'business', 'workplace', 'enterprise'],
  'bank': ['banking', 'finance', 'financial', 'money', 'payment', 'credit', 'debit', 'savings'],
  'social': ['facebook', 'instagram', 'twitter', 'linkedin', 'snapchat', 'tiktok', 'reddit', 'discord'],
  'streaming': ['netflix', 'youtube', 'spotify', 'hulu', 'disney', 'prime', 'video', 'music', 'twitch'],
  'shopping': ['amazon', 'ebay', 'flipkart', 'shop', 'store', 'buy', 'order', 'ecommerce'],
  'dev': ['development', 'github', 'gitlab', 'bitbucket', 'code', 'programming', 'api', 'developer', 'coding'],
  'cloud': ['aws', 'azure', 'gcp', 'server', 'hosting', 'infrastructure', 'vercel', 'netlify', 'heroku'],
  'vpn': ['proxy', 'tunnel', 'private', 'nord', 'express', 'surfshark'],
  'gaming': ['steam', 'epic', 'playstation', 'xbox', 'nintendo', 'game', 'twitch'],
  'food': ['swiggy', 'zomato', 'doordash', 'ubereats', 'delivery', 'restaurant'],
  'travel': ['booking', 'airbnb', 'flight', 'hotel', 'airline', 'makemytrip', 'trip'],
  'temple': ['gurdwara', 'church', 'mosque', 'mandir', 'religious', 'prayer', 'spiritual'],
  'gurdwara': ['temple', 'sikh', 'gurudwara', 'prayer'],
  'phone': ['mobile', 'cell', 'smartphone', 'android', 'iphone', 'sim'],
  'old': ['previous', 'former', 'past', 'legacy', 'archive'],
  'new': ['recent', 'latest', 'current', 'updated'],
};

// ─── TOKENIZER ───────────────────────────────────────────
const tokenize = (text) => {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9@.\-_\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
};

// ─── SIMPLE PORTER-ISH STEMMER ──────────────────────────
const stem = (word) => {
  return word
    .replace(/ing$/, '')
    .replace(/tion$/, '')
    .replace(/ness$/, '')
    .replace(/ment$/, '')
    .replace(/able$/, '')
    .replace(/ible$/, '')
    .replace(/ful$/, '')
    .replace(/ous$/, '')
    .replace(/ive$/, '')
    .replace(/ly$/, '')
    .replace(/ed$/, '')
    .replace(/er$/, '')
    .replace(/es$/, '')
    .replace(/s$/, '');
};

// ─── EXPAND QUERY WITH SYNONYMS ─────────────────────────
const expandQuery = (tokens) => {
  const expanded = new Set(tokens);
  
  tokens.forEach(token => {
    const stemmed = stem(token);
    expanded.add(stemmed);

    // Direct synonym lookup
    Object.entries(SYNONYMS).forEach(([key, values]) => {
      if (key === token || key === stemmed || values.includes(token) || values.includes(stemmed)) {
        expanded.add(key);
        values.forEach(v => expanded.add(v));
      }
    });
  });

  return [...expanded];
};

// ─── BUILD DOCUMENT FROM ENTRY ──────────────────────────
const entryToDocument = (entry) => {
  const fields = [
    entry.serviceName || '',
    entry.username || '',
    entry.url || '',
    entry.notes || '',
    entry.category || '',
    entry.recoveryEmail || '',
  ];
  return fields.join(' ');
};

// ─── FUZZY TOKEN MATCH ──────────────────────────────────
const fuzzyMatch = (queryToken, docToken, maxDistance = 2) => {
  if (docToken.includes(queryToken) || queryToken.includes(docToken)) return 1.0;
  
  const stemQ = stem(queryToken);
  const stemD = stem(docToken);
  if (stemQ === stemD) return 0.9;

  if (Math.abs(queryToken.length - docToken.length) > maxDistance) return 0;
  
  const dist = levenshteinDistance(queryToken, docToken);
  if (dist <= maxDistance) {
    return 1 - (dist / Math.max(queryToken.length, docToken.length));
  }
  return 0;
};

// ─── MAIN SEARCH FUNCTION ───────────────────────────────
/**
 * Semantic search over vault entries.
 * 
 * @param {string} query - Natural language query
 * @param {Array} entries - Decrypted vault entries
 * @returns {Array<{ entry: Object, score: number, highlights: string[] }>}
 */
export const semanticSearch = (query, entries) => {
  if (!query || !query.trim() || !entries.length) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    // Fallback: simple substring match on the raw query
    const q = query.toLowerCase().trim();
    return entries
      .filter(e => entryToDocument(e).toLowerCase().includes(q))
      .map(e => ({ entry: e, score: 50, highlights: [q] }));
  }

  const expandedTokens = expandQuery(queryTokens);

  const results = entries.map(entry => {
    const doc = entryToDocument(entry);
    const docTokens = tokenize(doc);
    
    let totalScore = 0;
    const highlights = [];

    expandedTokens.forEach(qToken => {
      let bestMatchScore = 0;

      docTokens.forEach(dToken => {
        const matchScore = fuzzyMatch(qToken, dToken);
        if (matchScore > bestMatchScore) {
          bestMatchScore = matchScore;
        }
      });

      if (bestMatchScore > 0) {
        // Weight: original query tokens score 2x vs expanded synonyms
        const isOriginal = queryTokens.includes(qToken);
        const weight = isOriginal ? 2.0 : 0.8;
        totalScore += bestMatchScore * weight;
        
        if (bestMatchScore > 0.5) {
          highlights.push(qToken);
        }
      }
    });

    // Bonus for service name exact match
    if (entry.serviceName && entry.serviceName.toLowerCase().includes(query.toLowerCase().trim())) {
      totalScore += 5;
    }

    // Normalize score to 0-100
    const normalizedScore = Math.min(100, Math.round((totalScore / expandedTokens.length) * 100));

    return { entry, score: normalizedScore, highlights };
  });

  return results
    .filter(r => r.score > 15)
    .sort((a, b) => b.score - a.score);
};
