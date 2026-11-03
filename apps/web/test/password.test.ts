import { describe, expect, it } from 'vitest';
import { EmailSchema, PasswordSchema, dummyVerify, hashPassword, verifyPassword } from '@/lib/password';

describe('passwords', () => {
  it('hashes with a random salt and verifies', async () => {
    const a = await hashPassword('correct horse 1');
    const b = await hashPassword('correct horse 1');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$32768$8$1$')).toBe(true);
    expect(await verifyPassword('correct horse 1', a)).toBe(true);
    expect(await verifyPassword('wrong horse 1', a)).toBe(false);
  });

  it('rejects missing or malformed hashes', async () => {
    expect(await verifyPassword('x', null)).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$abc')).toBe(false);
    expect(await dummyVerify('anything')).toBe(false);
  });

  it('validates email and password strength', () => {
    expect(EmailSchema.parse('  Me@Example.COM ')).toBe('me@example.com');
    expect(EmailSchema.safeParse('not-an-email').success).toBe(false);
    expect(PasswordSchema.safeParse('short1').success).toBe(false);
    expect(PasswordSchema.safeParse('onlyletters').success).toBe(false);
    expect(PasswordSchema.safeParse('letters4ever').success).toBe(true);
  });
});
