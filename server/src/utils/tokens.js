const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * JWT Token Utilities
 * 
 * Two-token strategy:
 * - Access token: Short-lived (15 min), used for API authorization
 * - Refresh token: Long-lived (7 days), single-use (rotated on every refresh)
 * 
 * Why this pattern?
 * - If an access token is stolen, the attacker has only 15 minutes
 * - Refresh tokens are stored as hashes in the DB, so even a DB breach doesn't give usable tokens
 * - Rotation means a stolen refresh token can only be used once before it's invalidated
 */

const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: '15m',
    issuer: 'weave',
  });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
    issuer: 'weave',
  });
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

/**
 * Hash a refresh token before storing in DB.
 * We store hashes, not raw tokens — same principle as password storage.
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
};
