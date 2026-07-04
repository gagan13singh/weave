/**
 * Weave — Client-Side Cryptography Library
 * 
 * ═══════════════════════════════════════════════════════════
 * THIS IS THE MOST CRITICAL FILE IN THE ENTIRE APPLICATION.
 * ═══════════════════════════════════════════════════════════
 * 
 * Implements zero-knowledge encryption:
 * - The master password NEVER leaves the browser
 * - Key B (encryption key) NEVER leaves the browser
 * - The server only sees ciphertext + a hashed auth key
 * 
 * Algorithms used:
 * - Argon2id: Key derivation (memory-hard, GPU/ASIC resistant)
 * - AES-256-GCM: Authenticated encryption (confidentiality + integrity)
 * - SHA-256: Auth key hashing before sending to server
 * 
 * Key derivation flow:
 *   masterPassword + salt → Argon2id → 64 bytes
 *     → bytes[0..31]  = Key A (auth key — hashed and sent to server)
 *     → bytes[32..63] = Key B (encryption key — NEVER leaves browser)
 */

import { argon2id } from 'hash-wasm';

// ─── CONSTANTS ───────────────────────────────────────────

const ARGON2_CONFIG = {
  memorySize: 65536,    // 64 MB memory cost
  iterations: 3,        // 3 iterations
  parallelism: 1,
  hashLength: 64,       // 64 bytes output → split into Key A (32) + Key B (32)
};

// ─── KEY DERIVATION ──────────────────────────────────────

/**
 * Generate a random 16-byte salt for Argon2id.
 * Called once during signup, then stored on the server for re-derivation.
 */
export const generateSalt = () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bufferToHex(salt);
};

/**
 * Derive Key A (auth) and Key B (encryption) from master password.
 * 
 * @param {string} masterPassword - User's master password (never transmitted)
 * @param {string} saltHex - Hex-encoded salt from server
 * @returns {{ keyA: string, keyB: CryptoKey }} - Key A as hex, Key B as CryptoKey
 */
export const deriveKeys = async (masterPassword, saltHex) => {
  const salt = hexToBuffer(saltHex);

  const derivedHex = await argon2id({
    password: masterPassword,
    salt,
    ...ARGON2_CONFIG,
    outputType: 'hex',
  });

  // derivedHex is a 128-char hex string (64 bytes)
  const derivedBytes = hexToBuffer(derivedHex);

  // Split: first 32 bytes → Key A (auth), last 32 bytes → Key B (encryption)
  const keyABytes = derivedBytes.slice(0, 32);
  const keyBBytes = derivedBytes.slice(32, 64);

  // Key A: convert to hex string (will be SHA-256 hashed before sending to server)
  const keyA = bufferToHex(keyABytes);

  // Key B: import as CryptoKey for AES-256-GCM (never leaves browser memory)
  const keyB = await crypto.subtle.importKey(
    'raw',
    keyBBytes,
    { name: 'AES-GCM', length: 256 },
    false,        // not extractable — cannot be exported from CryptoKey
    ['encrypt', 'decrypt']
  );

  return { keyA, keyB };
};

/**
 * Hash Key A with SHA-256 before sending to server.
 * Server then bcrypts this hash — double protection.
 */
export const hashKeyA = async (keyAHex) => {
  const keyABytes = hexToBuffer(keyAHex);
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyABytes);
  return bufferToHex(new Uint8Array(hashBuffer));
};

// ─── ENCRYPTION ──────────────────────────────────────────

/**
 * Encrypt plaintext data with AES-256-GCM.
 * 
 * AES-GCM provides:
 * - Confidentiality: data is encrypted
 * - Integrity: any tampering is detected via the authentication tag
 * - Each encryption uses a unique random IV (nonce)
 * 
 * @param {object} data - Plaintext data (will be JSON-stringified)
 * @param {CryptoKey} keyB - AES-256-GCM CryptoKey
 * @returns {{ ciphertext: string, iv: string, tag: string }}
 */
export const encrypt = async (data, keyB) => {
  const plaintext = JSON.stringify(data);
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  // Generate random 12-byte IV (recommended size for GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt — GCM appends 16-byte auth tag to the ciphertext
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    keyB,
    plaintextBytes
  );

  const encryptedBytes = new Uint8Array(encryptedBuffer);

  // GCM output = ciphertext + 16-byte auth tag (appended at the end)
  const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - 16);
  const tag = encryptedBytes.slice(encryptedBytes.length - 16);

  return {
    ciphertext: bufferToHex(ciphertext),
    iv: bufferToHex(iv),
    tag: bufferToHex(tag),
  };
};

/**
 * Decrypt ciphertext with AES-256-GCM.
 * 
 * @param {string} ciphertextHex - Hex-encoded ciphertext
 * @param {string} ivHex - Hex-encoded IV
 * @param {string} tagHex - Hex-encoded authentication tag
 * @param {CryptoKey} keyB - AES-256-GCM CryptoKey
 * @returns {object} - Decrypted data (parsed from JSON)
 */
export const decrypt = async (ciphertextHex, ivHex, tagHex, keyB) => {
  const ciphertext = hexToBuffer(ciphertextHex);
  const iv = hexToBuffer(ivHex);
  const tag = hexToBuffer(tagHex);

  // Reconstruct GCM input: ciphertext + auth tag concatenated
  const encryptedBytes = new Uint8Array(ciphertext.length + tag.length);
  encryptedBytes.set(ciphertext, 0);
  encryptedBytes.set(tag, ciphertext.length);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    keyB,
    encryptedBytes
  );

  const decoder = new TextDecoder();
  const plaintext = decoder.decode(decryptedBuffer);

  return JSON.parse(plaintext);
};

// ─── RECOVERY KEY ────────────────────────────────────────

/**
 * Generate a 256-bit recovery key.
 * Displayed once at signup — user must store it offline.
 * Used to encrypt Key B for master password recovery.
 */
export const generateRecoveryKey = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  // Format as groups of 4 hex chars separated by dashes for readability
  const hex = bufferToHex(bytes);
  return hex.match(/.{1,4}/g).join('-');
};

/**
 * Encrypt raw Key B bytes with recovery key.
 * Called during signup before Key B bytes are discarded.
 */
export const encryptKeyBBytesForRecovery = async (keyBBytes, recoveryKeyFormatted) => {
  const recoveryHex = recoveryKeyFormatted.replace(/-/g, '');
  const recoveryBytes = hexToBuffer(recoveryHex);

  const recoveryKey = await crypto.subtle.importKey(
    'raw',
    recoveryBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    recoveryKey,
    keyBBytes
  );

  const encBytes = new Uint8Array(encrypted);
  return {
    encryptedKeyB: bufferToHex(encBytes),
    recoveryIv: bufferToHex(iv),
  };
};

/**
 * Decrypt Key B using recovery key.
 * Called during master password recovery.
 */
export const decryptKeyBWithRecovery = async (encryptedKeyBHex, recoveryIvHex, recoveryKeyFormatted) => {
  const recoveryHex = recoveryKeyFormatted.replace(/-/g, '');
  const recoveryBytes = hexToBuffer(recoveryHex);
  const encryptedKeyB = hexToBuffer(encryptedKeyBHex);
  const iv = hexToBuffer(recoveryIvHex);

  const recoveryKey = await crypto.subtle.importKey(
    'raw',
    recoveryBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    recoveryKey,
    encryptedKeyB
  );

  return new Uint8Array(decrypted);
};

/**
 * Extended deriveKeys that also returns raw Key B bytes.
 * Needed for recovery key encryption during signup.
 */
export const deriveKeysWithRaw = async (masterPassword, saltHex) => {
  const salt = hexToBuffer(saltHex);

  const derivedHex = await argon2id({
    password: masterPassword,
    salt,
    ...ARGON2_CONFIG,
    outputType: 'hex',
  });

  const derivedBytes = hexToBuffer(derivedHex);
  const keyABytes = derivedBytes.slice(0, 32);
  const keyBBytes = derivedBytes.slice(32, 64);

  const keyA = bufferToHex(keyABytes);
  const keyB = await crypto.subtle.importKey(
    'raw',
    keyBBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return { keyA, keyB, keyBBytes: new Uint8Array(keyBBytes) };
};

// ─── UTILITY FUNCTIONS ───────────────────────────────────

function bufferToHex(buffer) {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
