import { NextResponse } from 'next/server';
import { getDesktopRelease } from '@/lib/desktop-release';

export const revalidate = 300;

// The newest Windows release, for the desktop app's "update available" prompt. Public: it
// only repeats what the download page shows. Users are sent to the download page rather than
// straight to the installer, so the link always lands somewhere Velora controls.
export async function GET(req: Request) {
  const release = await getDesktopRelease();
  if (!release?.version) {
    return NextResponse.json({ error: 'No desktop release is available yet.' }, { status: 404 });
  }
  return NextResponse.json({
    version: release.version,
    publishedAt: release.publishedAt,
    downloadPageUrl: new URL('/download', req.url).toString(),
  });
}
