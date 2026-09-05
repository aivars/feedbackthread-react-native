import { FeedbackThreadError } from './errors.js';
import type { IdentityStorage } from './types.js';

// Concurrent surfaces and client instances share only an in-flight storage read.
// The key includes the backend and project; account data is never cached here.
const pending = new WeakMap<IdentityStorage, Map<string, Promise<string>>>();

export function validateIdentity(value: string): string {
  if (typeof value !== 'string') throw new FeedbackThreadError('User identifiers must be text.', 'configuration');
  const result = value.trim();
  // IDs are HTTP header values. Reject non-ASCII rather than allowing the
  // transport to misclassify an invalid header as a retryable network failure.
  if (!result || result.length > 160 || /[^\x20-\x7e]/.test(result)) {
    throw new FeedbackThreadError('User identifiers must contain 1–160 printable ASCII characters.', 'configuration');
  }
  return result;
}

export function resolveAnonymousIdentity(storage: IdentityStorage, key: string, generateId: () => string): Promise<string> {
  let reads = pending.get(storage);
  if (!reads) { reads = new Map(); pending.set(storage, reads); }
  const existing = reads.get(key);
  if (existing) return existing;
  const result = (async () => {
    try {
      const stored = await storage.getItem(key);
      if (stored !== null) return validateIdentity(stored);
      const created = validateIdentity(generateId());
      await storage.setItem(key, created);
      return created;
    } catch {
      // Changing identity after a storage failure would lose the user's votes
      // and private requests. Fail explicitly and let the caller retry.
      throw new FeedbackThreadError('Could not load your feedback identity. Please try again.', 'identity_storage', undefined, true);
    }
  })();
  reads.set(key, result);
  void result.finally(() => reads.delete(key)).catch(() => {});
  return result;
}
