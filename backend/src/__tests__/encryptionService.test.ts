/**
 * Unit tests for EncryptionService — AES-256-GCM with tree-scoped key derivation.
 *
 * Run:
 *   cd backend && npx vitest run src/__tests__/encryptionService.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { encryptKey, decryptKey } from '../services/encryptionService';

// ── Setup ───────────────────────────────────────────────────────────────────

beforeAll(() => {
  // Ensure JWT_SECRET is available for key derivation
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-secret-for-encryption-service-unit-tests';
  }
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('encryptionService', () => {
  const treeId = 'tree-alpha-001';
  const otherTreeId = 'tree-beta-002';

  // ── encryptKey ──────────────────────────────────────────────────────────

  describe('encryptKey', () => {
    it('returns a colon-separated hex string with 3 parts', () => {
      const result = encryptKey('hello', treeId);
      const parts = result.split(':');
      expect(parts).toHaveLength(3);
      // Each part should be valid hex
      for (const part of parts) {
        expect(/^[0-9a-f]+$/i.test(part)).toBe(true);
      }
    });

    it('produces different ciphertexts for the same plaintext (random IV)', () => {
      const a = encryptKey('same text', treeId);
      const b = encryptKey('same text', treeId);
      expect(a).not.toBe(b);
    });

    it('produces different ciphertexts for different treeIds', () => {
      const a = encryptKey('secret', treeId);
      const b = encryptKey('secret', otherTreeId);
      expect(a).not.toBe(b);
    });

    it('handles empty string', () => {
      const result = encryptKey('', treeId);
      expect(() => decryptKey(result, treeId)).not.toThrow();
      expect(decryptKey(result, treeId)).toBe('');
    });

    it('handles Unicode / emoji', () => {
      const text = 'secreto 🔐 árbol αβγ — 日本語';
      const encrypted = encryptKey(text, treeId);
      expect(decryptKey(encrypted, treeId)).toBe(text);
    });

    it('handles long text (>1KB)', () => {
      const text = 'x'.repeat(5000);
      const encrypted = encryptKey(text, treeId);
      expect(decryptKey(encrypted, treeId)).toBe(text);
    });
  });

  // ── decryptKey ──────────────────────────────────────────────────────────

  describe('decryptKey', () => {
    it('round-trips correctly', () => {
      const original = 'my-secret-api-key-12345';
      const encrypted = encryptKey(original, treeId);
      const decrypted = decryptKey(encrypted, treeId);
      expect(decrypted).toBe(original);
    });

    it('fails when decrypting with a different treeId', () => {
      const encrypted = encryptKey('secret', treeId);
      expect(() => decryptKey(encrypted, otherTreeId)).toThrow(/Decryption failed/);
    });

    it('fails on tampered ciphertext (modified hex)', () => {
      const encrypted = encryptKey('secret', treeId);
      const parts = encrypted.split(':');
      // Flip the last byte of the ciphertext part
      const lastChar = parts[2].slice(-1);
      const flipped = lastChar === 'f' ? '0' : 'f';
      const tampered = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -1)}${flipped}`;
      expect(() => decryptKey(tampered, treeId)).toThrow(/Decryption failed/);
    });

    it('fails on tampered auth tag', () => {
      const encrypted = encryptKey('secret', treeId);
      const parts = encrypted.split(':');
      const tamperedAuth = '00'.repeat(16); // 16 zero bytes = 32 hex chars
      const tampered = `${parts[0]}:${tamperedAuth}:${parts[2]}`;
      expect(() => decryptKey(tampered, treeId)).toThrow(/Decryption failed/);
    });

    it('fails on invalid format (missing parts)', () => {
      expect(() => decryptKey('just-one-part', treeId)).toThrow(/Invalid ciphertext format/);
      expect(() => decryptKey('a:b', treeId)).toThrow(/Invalid ciphertext format/);
    });

    it('fails on wrong IV length', () => {
      const shortIV = 'aabbccdd'; // 4 bytes, should be 16
      const tag = '00'.repeat(16);
      const data = '00'.repeat(16);
      expect(() => decryptKey(`${shortIV}:${tag}:${data}`, treeId)).toThrow(/Invalid IV length/);
    });

    it('fails on wrong auth tag length', () => {
      const iv = '00'.repeat(16);
      const shortTag = 'aabb'; // 2 bytes, should be 16
      const data = '00'.repeat(16);
      expect(() => decryptKey(`${iv}:${shortTag}:${data}`, treeId)).toThrow(/Invalid auth tag length/);
    });
  });

  // ── Tree-scoped isolation ───────────────────────────────────────────────

  describe('tree-scoped isolation', () => {
    it('tree A cannot decrypt tree B data', () => {
      const dataA = encryptKey('secret-of-A', treeId);
      const dataB = encryptKey('secret-of-B', otherTreeId);

      // Each tree can decrypt its own data
      expect(decryptKey(dataA, treeId)).toBe('secret-of-A');
      expect(decryptKey(dataB, otherTreeId)).toBe('secret-of-B');

      // Neither can decrypt the other's
      expect(() => decryptKey(dataA, otherTreeId)).toThrow(/Decryption failed/);
      expect(() => decryptKey(dataB, treeId)).toThrow(/Decryption failed/);
    });
  });
});
