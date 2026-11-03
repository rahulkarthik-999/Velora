import { afterEach, describe, expect, it } from 'vitest';
import { resolvePublicUrl } from '@/lib/site-url';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('resolvePublicUrl', () => {
  it('keeps a real URL', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'veloraweb.online';
    expect(resolvePublicUrl('https://veloraweb.online/')).toBe('https://veloraweb.online');
  });

  it('replaces localhost in production with the production origin', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'veloraweb.online';
    expect(resolvePublicUrl('http://localhost:3000')).toBe('https://veloraweb.online');
    expect(resolvePublicUrl(undefined)).toBe('https://veloraweb.online');
  });

  it('leaves localhost alone in development', () => {
    delete process.env.VERCEL_ENV;
    expect(resolvePublicUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(resolvePublicUrl(undefined, 'http://x')).toBe('http://x');
  });
});
