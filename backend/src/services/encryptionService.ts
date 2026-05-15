import crypto from 'crypto';

// ── Constants ───────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;           // bytes
const AUTH_TAG_LENGTH = 16;     // bytes (GCM default)
const KEY_LENGTH = 32;          // bytes (AES-256)
const SALT = 'trust-maker-encryption-salt-v1';  // fixed for deterministic derivation

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive a 32-byte AES-256 key from JWT_SECRET + treeId.
 * Uses scryptSync with a fixed salt — same inputs always produce the same key,
 * which is required for round-trip encrypt/decrypt.
 */
function deriveKey(treeId: string): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('[encryptionService] JWT_SECRET environment variable is not set');
  }
  const input = `${secret}${treeId}`;
  return crypto.scryptSync(input, SALT, KEY_LENGTH);
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * The key is derived from JWT_SECRET + treeId, ensuring tree-scoped isolation.
 *
 * Output format (hex, colon-separated):
 *   iv:authTag:ciphertext
 *
 * @param plaintext - The string to encrypt.
 * @param treeId    - Tree-scoped identifier for key derivation.
 * @returns Colon-separated hex string: iv:authTag:ciphertext
 */
export function encryptKey(plaintext: string, treeId: string): string {
  const key = deriveKey(treeId);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a ciphertext produced by encryptKey().
 *
 * @param ciphertext - Colon-separated hex string: iv:authTag:ciphertext
 * @param treeId     - Same treeId used during encryption.
 * @returns The original plaintext string.
 * @throws If decryption fails (wrong treeId, tampered data, etc.)
 */
export function decryptKey(ciphertext: string, treeId: string): string {
  const key = deriveKey(treeId);

  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('[encryptionService] Invalid ciphertext format — expected iv:authTag:ciphertext');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = Buffer.from(parts[2], 'hex');

  if (iv.length !== IV_LENGTH) {
    throw new Error(`[encryptionService] Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`[encryptionService] Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (err: any) {
    throw new Error(`[encryptionService] Decryption failed: ${err.message}`);
  }
}
