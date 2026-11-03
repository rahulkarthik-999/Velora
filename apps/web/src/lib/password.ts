import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { z } from 'zod';

// ============================================================================
// Email + password accounts (desktop app sign-up)
// ============================================================================

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>;

// OWASP-recommended scrypt cost; ~50 ms per hash.
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const MAX_MEM = 64 * 1024 * 1024;

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email('Enter a valid email address');

export const PasswordSchema = z
  .string()
  .min(8, 'Use at least 8 characters for your password')
  .max(200, 'That password is too long')
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), 'Use letters and at least one number');

/** Stored as "scrypt$N$r$p$salt$hash" so the cost can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LEN, { N, r: R, p: P, maxmem: MAX_MEM });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = stored?.split('$');
  if (!parts || parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAX_MEM,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Spends the same time as a real check, so unknown emails can't be told apart by timing. */
export async function dummyVerify(password: string): Promise<false> {
  await verifyPassword(password, DUMMY_HASH);
  return false;
}

const DUMMY_HASH = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(KEY_LEN).toString('base64');
