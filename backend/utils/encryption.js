import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Encryption configuration
// ---------------------------------------------------------------------------
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96 bits — correct for GCM (note: old code used 16)
const TAG_LENGTH = 16;  // 128-bit authentication tag

// Legacy constants (kept for decrypting old messages stored in the DB)
const LEGACY_SALT_LENGTH = 64;
const LEGACY_IV_LENGTH = 16;

// ---------------------------------------------------------------------------
// B-002: Static key — derived ONCE at module load, not per message.
//
// The old implementation called pbkdf2Sync(100_000 iters) on every send AND
// receive, blocking the event loop for ~100ms each time.  Because
// MESSAGE_ENCRYPTION_KEY is a static env var there is no need to derive a
// fresh key per message.  We run scryptSync here at startup so the cost is
// paid exactly once.
// ---------------------------------------------------------------------------
let _staticKey = null;

function getStaticKey() {
  if (_staticKey) return _staticKey;
  const raw = process.env.MESSAGE_ENCRYPTION_KEY;
  if (!raw) throw new Error('MESSAGE_ENCRYPTION_KEY environment variable is not set');
  // scrypt: CPU-hard KDF, suitable for one-time key derivation from a secret.
  // N=16384 (2^14) is the recommended minimum for interactive use.
  _staticKey = crypto.scryptSync(raw, 'mern-estate-msg-v2', 32, { N: 16384 });
  return _staticKey;
}

// ---------------------------------------------------------------------------
// New fast path (v2 format)
// Wire format: "v2:" + hex(iv[12] + authTag[16] + ciphertext)
// ---------------------------------------------------------------------------
function encryptV2(text) {
  const key = getStaticKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from('mern-estate-v2', 'utf8'));
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'v2:' + Buffer.concat([iv, tag, encrypted]).toString('hex');
}

function decryptV2(hexPayload) {
  const key = getStaticKey();
  const buf = Buffer.from(hexPayload, 'hex');
  if (buf.length < IV_LENGTH + TAG_LENGTH) throw new Error('Invalid ciphertext length');
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(Buffer.from('mern-estate-v2', 'utf8'));
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext, null, 'utf8') + decipher.final('utf8');
}

// ---------------------------------------------------------------------------
// Legacy PBKDF2 path — kept ONLY for decrypting messages already in the DB.
// This path is never used for new encryptions.
// ---------------------------------------------------------------------------
function legacyDeriveKey(password, salt) {
  // Intentionally synchronous — only called when decrypting old DB messages.
  // New messages use the static key path above.
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
}

function decryptLegacy(encryptedHex, password) {
  const combined = Buffer.from(encryptedHex, 'hex');
  const salt = combined.subarray(0, LEGACY_SALT_LENGTH);
  const iv = combined.subarray(LEGACY_SALT_LENGTH, LEGACY_SALT_LENGTH + LEGACY_IV_LENGTH);
  const tag = combined.subarray(LEGACY_SALT_LENGTH + LEGACY_IV_LENGTH, LEGACY_SALT_LENGTH + LEGACY_IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.subarray(LEGACY_SALT_LENGTH + LEGACY_IV_LENGTH + TAG_LENGTH);
  const key = legacyDeriveKey(password, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(Buffer.from('message-encryption', 'utf8'));
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, null, 'utf8') + decipher.final('utf8');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt using the fast static-key path.
 * Returned string begins with "v2:" so decryptMessageWithKey can route correctly.
 */
export function encryptMessageWithKey(text) {
  return encryptV2(text);
}

/**
 * Decrypt a message regardless of which encryption generation produced it.
 * - "v2:…" → fast static-key path (new messages)
 * - pure hex   → legacy PBKDF2 path (old DB messages)
 */
export function decryptMessageWithKey(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string') {
    throw new Error('Invalid encrypted text');
  }
  try {
    if (encryptedText.startsWith('v2:')) {
      return decryptV2(encryptedText.slice(3));
    }
    // Legacy format: fall back to PBKDF2 (synchronous but only for old data)
    const password = process.env.MESSAGE_ENCRYPTION_KEY;
    if (!password) throw new Error('MESSAGE_ENCRYPTION_KEY is not set');
    return decryptLegacy(encryptedText, password);
  } catch {
    throw new Error('Failed to decrypt message');
  }
}

/**
 * Returns true when a string looks like it was produced by either encryption
 * generation, so callers can skip decryption for plain-text messages.
 */
export function isEncrypted(text) {
  if (!text || typeof text !== 'string') return false;
  if (text.startsWith('v2:')) return true;
  // Legacy: long hex with at least salt+iv+tag prefix
  return /^[0-9a-f]+$/i.test(text) &&
    text.length > (LEGACY_SALT_LENGTH + LEGACY_IV_LENGTH + TAG_LENGTH) * 2;
}

