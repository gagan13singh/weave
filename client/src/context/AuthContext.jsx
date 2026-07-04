import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { deriveKeys, deriveKeysWithRaw, hashKeyA, generateSalt, generateRecoveryKey, encryptKeyBBytesForRecovery } from '../lib/crypto';

const AuthContext = createContext(null);

export const useAuthContext = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [keyB, setKeyB] = useState(null); // CryptoKey — never leaves memory
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check for existing session on mount
  useEffect(() => {
    const token = sessionStorage.getItem('accessToken');
    const email = sessionStorage.getItem('userEmail');
    if (token && email) {
      setUser({ email });
      // Note: Key B is NOT persisted — user must re-enter master password
      // This is intentional: closing the tab clears the encryption key
    }
    setLoading(false);
  }, []);

  // ─── SIGNUP ──────────────────────────────────────────────

  const signup = useCallback(async (email, masterPassword) => {
    setError(null);

    // 1. Generate salt
    const salt = generateSalt();

    // 2. Derive keys (with raw bytes for recovery key)
    const { keyA, keyB: derivedKeyB, keyBBytes } = await deriveKeysWithRaw(masterPassword, salt);

    // 3. Hash Key A for server
    const authHash = await hashKeyA(keyA);

    // 4. Generate recovery key and encrypt Key B with it
    const recoveryKey = generateRecoveryKey();
    const { encryptedKeyB, recoveryIv } = await encryptKeyBBytesForRecovery(keyBBytes, recoveryKey);

    // 5. Send to server (server never sees master password or Key B)
    await api.post('/auth/signup', {
      email,
      authHash,
      salt,
      encryptedKeyB: JSON.stringify({ data: encryptedKeyB, iv: recoveryIv }),
    });

    return { recoveryKey }; // Show to user once
  }, []);

  // ─── LOGIN ───────────────────────────────────────────────

  const login = useCallback(async (email, masterPassword) => {
    setError(null);

    // 1. Get salt from server
    const { data: saltData } = await api.get('/auth/salt', { params: { email } });

    // 2. Re-derive keys from master password + salt
    const { keyA, keyB: derivedKeyB } = await deriveKeys(masterPassword, saltData.salt);

    // 3. Hash Key A
    const authHash = await hashKeyA(keyA);

    // 4. Send auth hash to server
    const { data } = await api.post('/auth/login', { email, authHash });

    // If 2FA required, return pending state
    if (data.requires2FA) {
      return {
        requires2FA: true,
        pendingToken: data.pendingToken,
        keyB: derivedKeyB, // Hold in memory for after 2FA
      };
    }

    // Full login
    sessionStorage.setItem('accessToken', data.accessToken);
    sessionStorage.setItem('refreshToken', data.refreshToken);
    sessionStorage.setItem('userEmail', email);
    setUser({ email });
    setKeyB(derivedKeyB);

    return { requires2FA: false };
  }, []);

  // ─── 2FA VALIDATE ────────────────────────────────────────

  const validate2FA = useCallback(async (pendingToken, totpCode, email, derivedKeyB) => {
    const { data } = await api.post('/auth/2fa/validate', { pendingToken, totpCode });

    sessionStorage.setItem('accessToken', data.accessToken);
    sessionStorage.setItem('refreshToken', data.refreshToken);
    sessionStorage.setItem('userEmail', email);
    setUser({ email });
    setKeyB(derivedKeyB);
  }, []);

  // ─── LOGOUT ──────────────────────────────────────────────

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore — clear local state regardless
    }
    sessionStorage.clear();
    setUser(null);
    setKeyB(null);
  }, []);

  // ─── RE-ENTER MASTER PASSWORD ────────────────────────────
  // Required when Key B is lost (e.g., page refresh)

  const unlockVault = useCallback(async (masterPassword) => {
    const email = sessionStorage.getItem('userEmail');
    if (!email) throw new Error('No active session');

    const { data: saltData } = await api.get('/auth/salt', { params: { email } });
    const { keyB: derivedKeyB } = await deriveKeys(masterPassword, saltData.salt);
    setKeyB(derivedKeyB);

    return true;
  }, []);

  // ─── CHECK IF VAULT IS LOCKED ───────────────────────────

  const isVaultLocked = user && !keyB;

  const value = {
    user,
    keyB,
    loading,
    error,
    isVaultLocked,
    signup,
    login,
    validate2FA,
    logout,
    unlockVault,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
