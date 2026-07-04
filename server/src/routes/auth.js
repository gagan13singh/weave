const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter, signupLimiter } = require('../middleware/rateLimiter');

/**
 * Auth Routes
 * 
 * Public routes (no JWT required):
 * - POST   /signup           → Create account
 * - GET    /verify-email/:token → Verify email
 * - GET    /salt             → Get salt for key derivation
 * - POST   /login            → Authenticate
 * - POST   /2fa/validate     → Validate TOTP during login
 * - POST   /refresh          → Refresh access token
 * - GET    /recovery-data    → Get encrypted Key B for recovery
 * - PUT    /reset-master     → Reset master password via recovery key
 * 
 * Protected routes (JWT required):
 * - POST   /logout           → Invalidate session
 * - POST   /2fa/setup        → Generate TOTP secret
 * - POST   /2fa/verify       → Verify TOTP setup
 * - POST   /2fa/disable      → Disable 2FA
 */

// Public
router.post('/signup', signupLimiter, authController.signup);
router.get('/verify-email/:token', authController.verifyEmail);
router.get('/salt', authController.getSalt);
router.post('/login', authLimiter, authController.login);
router.post('/2fa/validate', authLimiter, authController.validate2FA);
router.post('/refresh', authController.refresh);
router.get('/recovery-data', authController.getRecoveryData);
router.put('/reset-master', authController.resetMasterPassword);

// Protected
router.post('/logout', authenticate, authController.logout);
router.post('/2fa/setup', authenticate, authController.setup2FA);
router.post('/2fa/verify', authenticate, authController.verify2FASetup);
router.post('/2fa/disable', authenticate, authController.disable2FA);
router.post('/rotate-key', authenticate, authController.rotateMasterKey);
router.post('/revoke-sessions', authenticate, authController.revokeAllSessions);
router.post('/regenerate-recovery', authenticate, authController.regenerateRecoveryKey);

module.exports = router;
