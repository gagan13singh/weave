const helmet = require('helmet');
const cors = require('cors');

/**
 * Security Middleware Configuration
 * 
 * Helmet sets various HTTP headers to protect against common attacks:
 * - HSTS: Forces HTTPS (critical for a password manager)
 * - CSP: Prevents XSS by restricting script sources
 * - X-Frame-Options: Prevents clickjacking
 * - X-Content-Type-Options: Prevents MIME sniffing
 * 
 * CORS is restricted to the frontend origin only.
 */

const configureHelmet = () => {
  return helmet({
    // HTTP Strict Transport Security — force HTTPS for 1 year
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // needed for inline styles
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    // Prevent clickjacking
    frameguard: { action: 'deny' },
    // Prevent MIME type sniffing
    noSniff: true,
    // Referrer policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
};

const configureCors = () => {
  return cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
};

module.exports = { configureHelmet, configureCors };
