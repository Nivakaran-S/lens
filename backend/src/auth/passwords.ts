import { hash, verify, Algorithm } from '@node-rs/argon2';

// argon2id with sensible OWASP-recommended cost params. ~150ms per hash on
// a typical VPS CPU. Tune memoryCost down to 19 MB / time to 1 if the
// server is RAM-constrained.
const HASH_OPTS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456, // 19 MB
  timeCost: 2,
  parallelism: 1,
};

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 256; // argon2 hashes anything, but cap to prevent abuse.

export class WeakPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeakPasswordError';
  }
}

export function validatePassword(password: string): void {
  if (typeof password !== 'string') {
    throw new WeakPasswordError('Password must be a string');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new WeakPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new WeakPasswordError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters`);
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  return hash(password, HASH_OPTS);
}

export async function verifyPassword(stored: string, attempted: string): Promise<boolean> {
  try {
    return await verify(stored, attempted);
  } catch {
    // verify throws on malformed hashes — treat as auth failure.
    return false;
  }
}
