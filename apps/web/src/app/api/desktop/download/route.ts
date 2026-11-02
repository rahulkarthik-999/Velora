import { NextResponse } from 'next/server';
import { getDesktopRelease } from '@/lib/desktop-release';

export const revalidate = 300;

// Stable link to the latest installer, safe to share or embed in the desktop app.
export async function GET(req: Request) {
  const release = await getDesktopRelease();
  if (!release) {
    return NextResponse.redirect(new URL('/download', req.url));
  }
  return NextResponse.redirect(release.url);
}
