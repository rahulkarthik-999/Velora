import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ default: {} }));

const { newDeviceCode, newDeviceToken, newUserCode, normaliseUserCode, sha256 } = await import('@/lib/desktop-auth');

describe('desktop sign-in codes', () => {
  it('makes readable user codes without ambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = newUserCode();
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it('accepts codes typed loosely and rejects invalid ones', () => {
    expect(normaliseUserCode('kq7m x3pd')).toBe('KQ7M-X3PD');
    expect(normaliseUserCode('KQ7M-X3PD')).toBe('KQ7M-X3PD');
    expect(normaliseUserCode('KQ7M-X3P')).toBeNull();
    expect(normaliseUserCode('KQ7M-X3P0')).toBeNull(); // 0 is never issued
  });

  it('issues unguessable secrets and stores only a hash', () => {
    const a = newDeviceCode();
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(newDeviceCode()).not.toBe(a);
    const token = newDeviceToken();
    expect(token.startsWith('vdt_')).toBe(true);
    expect(sha256(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256(token)).not.toContain(token);
  });
});
