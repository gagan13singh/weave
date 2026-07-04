const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

/**
 * TOTP (Time-based One-Time Password) Utilities
 * 
 * Implements RFC 6238 TOTP for two-factor authentication.
 * Compatible with Google Authenticator, Authy, 1Password, etc.
 * 
 * Flow:
 * 1. User requests 2FA setup → we generate a secret + QR code
 * 2. User scans QR with authenticator app
 * 3. User enters the 6-digit code to verify setup
 * 4. On future logins, user must provide TOTP code after password
 */

/**
 * Generate a new TOTP secret and QR code data URL.
 * The QR code encodes the otpauth:// URI that authenticator apps understand.
 */
const generateTOTPSecret = async (email) => {
  const secret = speakeasy.generateSecret({
    name: `Weave (${email})`,
    issuer: 'Weave',
    length: 32,
  });

  const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

  return {
    secret: secret.base32,       // Store this in DB (encrypted)
    otpauthUrl: secret.otpauth_url,
    qrCode: qrCodeDataUrl,       // Send to client for display
  };
};

/**
 * Verify a TOTP code against a secret.
 * Window of 1 allows for 30-second clock skew tolerance.
 */
const verifyTOTPCode = (secret, code) => {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: code,
    window: 1, // Allow 1 step before/after current time (±30 seconds)
  });
};

module.exports = { generateTOTPSecret, verifyTOTPCode };
