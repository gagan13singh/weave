const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { generateAccessToken, generateRefreshToken, hashToken } = require('../utils/tokens');
const { generateTOTPSecret, verifyTOTPCode } = require('../utils/totp');
const { sendVerificationEmail } = require('./emailService');

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MINUTES = 30;
const VERIFICATION_EXPIRY_HOURS = 24;

/**
 * Auth Service
 * 
 * Handles all authentication logic. Key design decisions:
 * 
 * 1. The server NEVER receives the master password or Key B
 *    - It only receives SHA-256(Key A), which it then bcrypts
 *    - Even if the DB is fully compromised, attackers can't derive the master password
 * 
 * 2. Account lockout is USER-based (not just IP-based like rate limiting)
 *    - Prevents distributed brute-force attacks across multiple IPs
 * 
 * 3. Refresh tokens are stored as SHA-256 hashes
 *    - A DB breach doesn't give attackers valid refresh tokens
 */

// ─── SIGNUP ──────────────────────────────────────────────

const signup = async ({ email, authHash, salt, encryptedKeyB }) => {
  // Check if user already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error('An account with this email already exists');
  }

  // bcrypt the authHash (which is already SHA-256 of Key A on the client)
  const hashedAuth = await bcrypt.hash(authHash, BCRYPT_ROUNDS);

  // Generate email verification token
  const verificationToken = uuidv4();
  const verificationExpiry = new Date(Date.now() + VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000);

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      authHash: hashedAuth,
      salt,
      encryptedKeyB: encryptedKeyB || null,
      verificationToken,
      verificationExpiry,
      emailVerified: process.env.NODE_ENV === 'development', // Auto-verify in development
    },
  });

  // Send verification email (non-blocking — don't fail signup if email fails)
  sendVerificationEmail(email, verificationToken).catch((err) => {
    console.error('Verification email failed:', err);
  });

  return { userId: user.id, message: 'Account created. Please verify your email.' };
};

// ─── EMAIL VERIFICATION ──────────────────────────────────

const verifyEmail = async (token) => {
  const user = await prisma.user.findFirst({
    where: {
      verificationToken: token,
      verificationExpiry: { gte: new Date() },
    },
  });

  if (!user) {
    throw new Error('Invalid or expired verification token');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      verificationToken: null,
      verificationExpiry: null,
    },
  });

  return { message: 'Email verified successfully' };
};

// ─── GET SALT ────────────────────────────────────────────

const getSalt = async (email) => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { salt: true },
  });

  if (!user) {
    // Return a fake salt to prevent user enumeration
    // Timing attack mitigation: always return something
    return { salt: require('crypto').randomBytes(16).toString('hex') };
  }

  return { salt: user.salt };
};

// ─── LOGIN ───────────────────────────────────────────────

const login = async ({ email, authHash }) => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Fake bcrypt compare to prevent timing attacks
    await bcrypt.compare(authHash, '$2a$12$fakehashtopreventtimingattacks000000000000000000000');
    throw new Error('Invalid credentials');
  }

  // Check lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil - new Date()) / 60000);
    throw new Error(`Account locked. Try again in ${minutesLeft} minutes.`);
  }

  // Check email verification
  if (!user.emailVerified) {
    throw new Error('Please verify your email before logging in');
  }

  // Verify authHash
  const isValid = await bcrypt.compare(authHash, user.authHash);

  if (!isValid) {
    // Increment failed attempts
    const newAttempts = user.failedAttempts + 1;
    const updateData = { failedAttempts: newAttempts };

    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      updateData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
      updateData.failedAttempts = 0;
    }

    await prisma.user.update({ where: { id: user.id }, data: updateData });
    throw new Error('Invalid credentials');
  }

  // Reset failed attempts on successful login
  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null },
  });

  // Check if 2FA is enabled — if so, return partial auth (needs TOTP)
  if (user.totpEnabled) {
    // Generate a short-lived "pending 2FA" token (5 min)
    const pendingToken = require('jsonwebtoken').sign(
      { userId: user.id, pending2FA: true },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '5m' }
    );
    return { requires2FA: true, pendingToken };
  }

  // Full login — generate token pair
  return generateTokenPair(user.id);
};

// ─── 2FA VALIDATION (during login) ──────────────────────

const validate2FA = async (pendingToken, totpCode) => {
  let decoded;
  try {
    decoded = require('jsonwebtoken').verify(pendingToken, process.env.JWT_ACCESS_SECRET);
  } catch {
    throw new Error('Invalid or expired 2FA session');
  }

  if (!decoded.pending2FA) {
    throw new Error('Invalid 2FA session');
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user || !user.totpSecret) {
    throw new Error('2FA not configured');
  }

  const isValid = verifyTOTPCode(user.totpSecret, totpCode);
  if (!isValid) {
    throw new Error('Invalid 2FA code');
  }

  return generateTokenPair(user.id);
};

// ─── 2FA SETUP ───────────────────────────────────────────

const setup2FA = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');
  if (user.totpEnabled) throw new Error('2FA is already enabled');

  const { secret, qrCode } = await generateTOTPSecret(user.email);

  // Store secret temporarily (not enabled yet until verified)
  await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: secret },
  });

  return { qrCode, secret }; // secret shown as backup code
};

const verify2FASetup = async (userId, totpCode) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.totpSecret) throw new Error('2FA setup not initiated');

  const isValid = verifyTOTPCode(user.totpSecret, totpCode);
  if (!isValid) {
    throw new Error('Invalid code. Please try again.');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: true },
  });

  return { message: '2FA enabled successfully' };
};

const disable2FA = async (userId, totpCode) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.totpEnabled) throw new Error('2FA is not enabled');

  const isValid = verifyTOTPCode(user.totpSecret, totpCode);
  if (!isValid) throw new Error('Invalid 2FA code');

  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: false, totpSecret: null },
  });

  return { message: '2FA disabled' };
};

// ─── TOKEN REFRESH ───────────────────────────────────────

const refreshTokens = async (refreshToken) => {
  let decoded;
  try {
    decoded = require('../utils/tokens').verifyRefreshToken(refreshToken);
  } catch {
    throw new Error('Invalid refresh token');
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user) throw new Error('User not found');

  // Verify the refresh token hash matches what's stored
  const tokenHash = hashToken(refreshToken);
  if (user.refreshToken !== tokenHash) {
    // Possible token reuse attack — invalidate all sessions
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: null },
    });
    throw new Error('Token reuse detected. All sessions invalidated.');
  }

  return generateTokenPair(user.id);
};

// ─── LOGOUT ──────────────────────────────────────────────

const logout = async (userId) => {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: null },
  });
  return { message: 'Logged out' };
};

// ─── RECOVERY ────────────────────────────────────────────

const getRecoveryData = async (email) => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { encryptedKeyB: true, salt: true },
  });

  if (!user || !user.encryptedKeyB) {
    throw new Error('No recovery data found for this account');
  }

  return { encryptedKeyB: user.encryptedKeyB, salt: user.salt };
};

const resetMasterPassword = async ({ email, newAuthHash, newSalt, newEncryptedKeyB }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error('User not found');

  const hashedAuth = await bcrypt.hash(newAuthHash, BCRYPT_ROUNDS);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      authHash: hashedAuth,
      salt: newSalt,
      encryptedKeyB: newEncryptedKeyB || user.encryptedKeyB,
      refreshToken: null, // Invalidate all sessions
    },
  });

  return { message: 'Master password reset successfully' };
};

const revokeAllSessions = async (userId) => {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: null },
  });
  return { message: 'All active sessions revoked successfully' };
};

const rotateMasterKey = async (userId, { newAuthHash, newSalt, newEncryptedKeyB, encryptedEntries }) => {
  const hashedAuth = await bcrypt.hash(newAuthHash, BCRYPT_ROUNDS);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        authHash: hashedAuth,
        salt: newSalt,
        encryptedKeyB: newEncryptedKeyB,
        refreshToken: null, // Invalidate sessions for safety
      },
    });

    await tx.vaultEntry.deleteMany({
      where: { userId },
    });

    if (encryptedEntries && encryptedEntries.length > 0) {
      await tx.vaultEntry.createMany({
        data: encryptedEntries.map((e) => ({
          userId,
          encryptedData: e.encryptedData,
          iv: e.iv,
          tag: e.tag,
          category: e.category || 'general',
          url: e.url || null,
        })),
      });
    }
  });

  return { message: 'Master key rotated successfully' };
};

const regenerateRecoveryKey = async (userId, { newEncryptedKeyB }) => {
  await prisma.user.update({
    where: { id: userId },
    data: { encryptedKeyB: newEncryptedKeyB },
  });
  return { message: 'Recovery key regenerated successfully' };
};

// ─── HELPERS ─────────────────────────────────────────────

const generateTokenPair = async (userId) => {
  const accessToken = generateAccessToken(userId);
  const refreshToken = generateRefreshToken(userId);

  // Store hashed refresh token
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: hashToken(refreshToken) },
  });

  return { accessToken, refreshToken };
};

module.exports = {
  signup,
  verifyEmail,
  getSalt,
  login,
  validate2FA,
  setup2FA,
  verify2FASetup,
  disable2FA,
  refreshTokens,
  logout,
  getRecoveryData,
  resetMasterPassword,
  revokeAllSessions,
  rotateMasterKey,
  regenerateRecoveryKey,
};
