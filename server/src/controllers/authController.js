const authService = require('../services/authService');

/**
 * Auth Controller
 * 
 * Thin layer between routes and service — handles HTTP concerns only.
 * All business logic lives in authService.
 */

const signup = async (req, res) => {
  try {
    const { email, authHash, salt, encryptedKeyB } = req.body;

    if (!email || !authHash || !salt) {
      return res.status(400).json({ error: 'Email, authHash, and salt are required' });
    }

    const result = await authService.signup({ email, authHash, salt, encryptedKeyB });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const result = await authService.verifyEmail(token);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getSalt = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const result = await authService.getSalt(email);
    res.json(result);
  } catch (error) {
    console.error('getSalt database connection error:', error);
    res.status(500).json({ 
      error: 'Database connection failed. Please check your DATABASE_URL in server/.env',
      details: error.message 
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, authHash } = req.body;

    if (!email || !authHash) {
      return res.status(400).json({ error: 'Email and authHash are required' });
    }

    const result = await authService.login({ email, authHash });
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
};

const validate2FA = async (req, res) => {
  try {
    const { pendingToken, totpCode } = req.body;

    if (!pendingToken || !totpCode) {
      return res.status(400).json({ error: 'Pending token and TOTP code are required' });
    }

    const result = await authService.validate2FA(pendingToken, totpCode);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
};

const setup2FA = async (req, res) => {
  try {
    const result = await authService.setup2FA(req.userId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const verify2FASetup = async (req, res) => {
  try {
    const { totpCode } = req.body;

    if (!totpCode) {
      return res.status(400).json({ error: 'TOTP code is required' });
    }

    const result = await authService.verify2FASetup(req.userId, totpCode);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const disable2FA = async (req, res) => {
  try {
    const { totpCode } = req.body;
    const result = await authService.disable2FA(req.userId, totpCode);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const result = await authService.refreshTokens(refreshToken);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
};

const logout = async (req, res) => {
  try {
    const result = await authService.logout(req.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
};

const getRecoveryData = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const result = await authService.getRecoveryData(email);
    res.json(result);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

const resetMasterPassword = async (req, res) => {
  try {
    const { email, newAuthHash, newSalt, newEncryptedKeyB } = req.body;

    if (!email || !newAuthHash || !newSalt) {
      return res.status(400).json({ error: 'Email, newAuthHash, and newSalt are required' });
    }

    const result = await authService.resetMasterPassword({ email, newAuthHash, newSalt, newEncryptedKeyB });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const revokeAllSessions = async (req, res) => {
  try {
    const result = await authService.revokeAllSessions(req.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const rotateMasterKey = async (req, res) => {
  try {
    const { newAuthHash, newSalt, newEncryptedKeyB, encryptedEntries } = req.body;
    if (!newAuthHash || !newSalt || !newEncryptedKeyB) {
      return res.status(400).json({ error: 'newAuthHash, newSalt, and newEncryptedKeyB are required' });
    }
    const result = await authService.rotateMasterKey(req.userId, { newAuthHash, newSalt, newEncryptedKeyB, encryptedEntries });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const regenerateRecoveryKey = async (req, res) => {
  try {
    const { newEncryptedKeyB } = req.body;
    if (!newEncryptedKeyB) {
      return res.status(400).json({ error: 'newEncryptedKeyB is required' });
    }
    const result = await authService.regenerateRecoveryKey(req.userId, { newEncryptedKeyB });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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
  refresh,
  logout,
  getRecoveryData,
  resetMasterPassword,
  revokeAllSessions,
  rotateMasterKey,
  regenerateRecoveryKey,
};
