/**
 * Password hashing using scrypt (a memory-hard KDF from node:crypto).
 *
 * We deliberately avoid rolling our own scheme: scrypt is a vetted primitive,
 * each hash gets a unique random salt, and verification is constant-time.
 *
 * Stored format (single string, self-describing):
 *   scrypt$N$r$p$<saltB64>$<hashB64>
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

// Cost parameters. N must be a power of two. These are reasonable for a login
// path; raise N as hardware allows. Changing them does not break old hashes
// because the parameters are stored alongside each hash.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  const salt = randomBytes(SALT_BYTES);
  const hash = await scrypt(plain, salt, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[4]!, 'base64');
  const expected = Buffer.from(parts[5]!, 'base64');
  // Re-derive with the SAME keylen as the stored hash so the buffers compare.
  const actual = await scrypt(plain, salt, expected.length);
  // timingSafeEqual throws on length mismatch; guard first.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
