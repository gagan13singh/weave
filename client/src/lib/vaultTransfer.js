/**
 * Vault Transfer — Encrypted QR-based Device-to-Device Transfer
 * 
 * Zero-knowledge offline vault handoff:
 * 1. Export: Serializes vault → encrypts with AES-256-GCM using a random PIN
 *    → encodes as base64 → generates chunked QR codes
 * 2. Import: Scans QR → prompts for PIN → decrypts → merges into vault
 * 
 * The PIN is derived through PBKDF2 to prevent brute-force attacks.
 * Nothing touches the server. Everything runs in browser memory.
 */

/**
 * Derive an AES-256-GCM key from a short PIN using PBKDF2.
 * This makes the PIN resistant to brute-force even if the QR data is intercepted.
 * 
 * @param {string} pin - 6-digit PIN shown on both devices
 * @param {Uint8Array} salt - Random salt embedded in the QR payload
 * @returns {CryptoKey} AES-256-GCM key
 */
export const deriveTransferKey = async (pin, salt) => {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

/**
 * Generate a random 6-digit PIN for pairing.
 */
export const generateTransferPIN = () => {
  const array = crypto.getRandomValues(new Uint8Array(4));
  const num = ((array[0] << 24) | (array[1] << 16) | (array[2] << 8) | array[3]) >>> 0;
  return String(num % 1000000).padStart(6, '0');
};

/**
 * Encrypt vault data for transfer.
 * 
 * @param {Array} entries - Decrypted vault entries
 * @param {string} pin - 6-digit PIN
 * @returns {{ payload: string, pin: string }} Base64-encoded encrypted payload
 */
export const encryptVaultForTransfer = async (entries, pin) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveTransferKey(pin, salt);

  const plaintext = JSON.stringify({
    version: 1,
    timestamp: Date.now(),
    entries: entries.map(e => ({
      serviceName: e.serviceName,
      username: e.username,
      password: e.password,
      url: e.url,
      notes: e.notes,
      category: e.category,
      recoveryEmail: e.recoveryEmail,
      recoveryPhone: e.recoveryPhone,
      twoFactorMethod: e.twoFactorMethod,
      backupCodes: e.backupCodes,
    })),
  });

  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    encoder.encode(plaintext)
  );

  // Combine salt + iv + ciphertext into single buffer
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  // Convert to base64
  const payload = btoa(String.fromCharCode(...combined));

  return { payload, pin };
};

/**
 * Decrypt a vault transfer payload.
 * 
 * @param {string} payload - Base64-encoded encrypted payload
 * @param {string} pin - 6-digit PIN entered by user
 * @returns {Array} Decrypted vault entries
 * @throws {Error} If PIN is wrong or data is tampered with
 */
export const decryptVaultTransfer = async (payload, pin) => {
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  // Extract salt (16 bytes) + iv (12 bytes) + ciphertext (rest)
  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const ciphertext = bytes.slice(28);

  const key = await deriveTransferKey(pin, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  const data = JSON.parse(decoder.decode(decrypted));

  if (data.version !== 1 || !Array.isArray(data.entries)) {
    throw new Error('Invalid transfer payload format');
  }

  return data.entries;
};
