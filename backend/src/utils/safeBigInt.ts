/**
 * safeBigInt — wraps BigInt() conversion with safety checks.
 *
 * BigInt() throws TypeError/SyntaxError/RangeError when:
 *   - Value is undefined, null, or an object
 *   - Value is a non-numeric string like "abc" or ""
 *   - Value is a float like 1.5 or "1.5"
 *
 * This wrapper returns null on any conversion failure, making it safe
 * to use in request processing without try-catch boilerplate.
 *
 * @returns The BigInt value, or null if conversion fails.
 */
export function safeBigInt(value: unknown): bigint | null {
  if (value === undefined || value === null) return null;

  // Already a bigint — return as-is
  if (typeof value === 'bigint') return value;

  // Number: reject NaN, Infinity, non-integers
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }

  // String: reject empty, trim and validate
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Must be purely numeric (no decimal points, no hex prefix unless 0x)
    if (/^\d+$/.test(trimmed) || /^0x[0-9a-fA-F]+$/.test(trimmed)) {
      try {
        return BigInt(trimmed);
      } catch {
        return null;
      }
    }
    return null;
  }

  // Boolean: reject (0n/1n is surprising and usually a bug)
  // Objects/arrays: reject
  return null;
}

/**
 * Checks whether a value is safe to use as a BigInt without conversion.
 * For the createTree flow, we care about whether incoming numeric IDs
 * (which may represent BigInt database fields like telegramUserId) are
 * safe or need protection.
 */
export function isSafeBigIntInput(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'bigint') return true;
  if (typeof value === 'number') {
    return Number.isFinite(value) && Number.isInteger(value) && Number.isSafeInteger(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (/^\d+$/.test(trimmed)) {
      // Any numeric string that fits in a valid BigInt
      try {
        BigInt(trimmed);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
  return false;
}
