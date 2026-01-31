import crypto from 'crypto';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // For GCM, this is 96 bits (12 bytes) but we'll use 16 for simplicity
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

/**
 * Derives a key from a password using PBKDF2
 * @param {string} password - The password to derive the key from
 * @param {Buffer} salt - The salt to use for key derivation
 * @returns {Buffer} - The derived key
 */
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
}

/**
 * Encrypts a message using AES-256-GCM
 * @param {string} text - The text to encrypt
 * @param {string} password - The encryption password/key
 * @returns {string} - The encrypted data as a hex string
 */
export function encryptMessage(text, password) {
  try {
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Derive key from password and salt
    const key = deriveKey(password, salt);
    
    // Create cipher
    const cipher = crypto.createCipher(ALGORITHM, key);
    cipher.setAAD(Buffer.from('message-encryption', 'utf8'));
    
    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get the authentication tag
    const tag = cipher.getAuthTag();
    
    // Combine salt + iv + tag + encrypted data
    const combined = Buffer.concat([salt, iv, tag, Buffer.from(encrypted, 'hex')]);
    
    return combined.toString('hex');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt message');
  }
}

/**
 * Decrypts a message using AES-256-GCM
 * @param {string} encryptedHex - The encrypted data as a hex string
 * @param {string} password - The decryption password/key
 * @returns {string} - The decrypted text
 */
export function decryptMessage(encryptedHex, password) {
  try {
    // Convert hex string back to buffer
    const combined = Buffer.from(encryptedHex, 'hex');
    
    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    // Derive the same key
    const key = deriveKey(password, salt);
    
    // Create decipher
    const decipher = crypto.createDecipher(ALGORITHM, key);
    decipher.setAAD(Buffer.from('message-encryption', 'utf8'));
    decipher.setAuthTag(tag);
    
    // Decrypt the data
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt message');
  }
}

/**
 * Gets the encryption key from environment variables
 * @returns {string} - The encryption key
 */
export function getEncryptionKey() {
  const key = process.env.MESSAGE_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('MESSAGE_ENCRYPTION_KEY environment variable is not set');
  }
  return key;
}

/**
 * Encrypts a message using the configured encryption key
 * @param {string} text - The text to encrypt
 * @returns {string} - The encrypted data
 */
export function encryptMessageWithKey(text) {
  const key = getEncryptionKey();
  return encryptMessage(text, key);
}

/**
 * Decrypts a message using the configured encryption key
 * @param {string} encryptedText - The encrypted text
 * @returns {string} - The decrypted text
 */
export function decryptMessageWithKey(encryptedText) {
  const key = getEncryptionKey();
  return decryptMessage(encryptedText, key);
}

/**
 * Checks if a string is encrypted (starts with hex pattern and has minimum length)
 * @param {string} text - The text to check
 * @returns {boolean} - True if the text appears to be encrypted
 */
export function isEncrypted(text) {
  // Check if it's a hex string and has minimum length for our encryption format
  return /^[0-9a-f]+$/i.test(text) && text.length > (SALT_LENGTH + IV_LENGTH + TAG_LENGTH) * 2;
}

