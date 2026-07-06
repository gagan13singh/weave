/**
 * hibp.js
 *
 * Client-side Have I Been Pwned (HIBP) checker using k-Anonymity.
 * Only the first 5 characters of the SHA-1 hash of the password are sent to the API.
 * The server never sees the full hash or the plaintext password.
 */

async function sha1(str) {
  const buf = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest('SHA-1', buf);
  const hashArray = Array.from(new Uint8Array(hashBuf));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

const breachCache = new Map();

export async function checkPasswordBreach(password) {
  if (!password) return 0;
  if (breachCache.has(password)) {
    return breachCache.get(password);
  }
  
  try {
    const hash = await sha1(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    if (!response.ok) {
      throw new Error('Failed to query HIBP database');
    }

    const text = await response.text();
    const lines = text.split('\n');

    for (const line of lines) {
      const [lineSuffix, countStr] = line.trim().split(':');
      if (lineSuffix === suffix) {
        const count = parseInt(countStr, 10);
        breachCache.set(password, count);
        return count;
      }
    }

    breachCache.set(password, 0);
    return 0;
  } catch (error) {
    console.error('Error checking password breach:', error);
    return 0;
  }
}

export function getCachedBreachCount(password) {
  if (!password) return null;
  return breachCache.has(password) ? breachCache.get(password) : null;
}
