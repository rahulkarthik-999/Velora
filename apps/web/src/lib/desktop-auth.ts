import { createHash, randomBytes, randomInt } from 'crypto';
import { NextRequest } from 'next/server';
import prisma from '@/lib/db';

// ============================================================================
// Desktop app authentication (device code flow)
// ============================================================================

/** How long a pending desktop sign-in stays valid. */
export const DEVICE_AUTH_TTL_MS = 10 * 60 * 1000;
/** How often the desktop app should poll. */
export const DEVICE_POLL_INTERVAL_S = 3;

// No 0/O, 1/I/L: the code is read off one screen and typed into another.
const USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Secret held by the desktop app while it waits for approval. */
export function newDeviceCode(): string {
  return randomBytes(32).toString('base64url');
}

/** Long-lived bearer token for a linked desktop app. */
export function newDeviceToken(): string {
  return `vdt_${randomBytes(32).toString('base64url')}`;
}

/** Short code the user confirms on the website, e.g. "KQ7M-X3PD". */
export function newUserCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Normalises what a user typed ("kq7m x3pd") to the stored form ("KQ7M-X3PD"). */
export function normaliseUserCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length !== 8 || [...raw].some((c) => !USER_CODE_ALPHABET.includes(c))) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export interface DesktopCaller {
  userId: string;
  deviceId: string;
}

/** Resolves a desktop app's bearer token. Returns null if missing, unknown or revoked. */
export async function getDesktopCaller(req: NextRequest): Promise<DesktopCaller | null> {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token.startsWith('vdt_')) return null;

  const device = await prisma.device.findUnique({ where: { tokenHash: sha256(token) } });
  if (!device || device.revokedAt) return null;

  // Record activity at most once a minute to avoid a write per request.
  if (!device.lastUsedAt || Date.now() - device.lastUsedAt.getTime() > 60_000) {
    await prisma.device.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
  }
  return { userId: device.userId, deviceId: device.id };
}

/** Creates a signed-in device for a user and returns its bearer token (shown once). */
export async function issueDeviceToken(userId: string, deviceName: string): Promise<{ token: string; deviceId: string }> {
  const token = newDeviceToken();
  const device = await prisma.device.create({ data: { userId, name: deviceName, tokenHash: sha256(token) } });
  return { token, deviceId: device.id };
}

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
