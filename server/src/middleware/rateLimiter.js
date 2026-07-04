const rateLimit = require('express-rate-limit');

/**
 * Rate Limiter Configurations
 * 
 * Why rate limiting matters for a password manager:
 * - Brute-force protection on login (most critical)
 * - Prevents credential stuffing attacks
 * - Limits abuse of signup/email verification endpoints
 * 
 * These are layered ON TOP of account-level lockout (handled in authService).
 * Rate limiting is IP-based; account lockout is user-based.
 */

// Strict limiter for auth endpoints — 5 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed attempts
});

// Moderate limiter for signup — 3 signups per hour per IP
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many accounts created. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API limiter — 100 requests per 15 minutes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, signupLimiter, apiLimiter };
