import { NextResponse, type NextRequest } from 'next/server';

// One canonical host. Sign-in keeps its state and CSRF cookies per host, so a Google
// sign-in started on www.veloraweb.online and finished on veloraweb.online would fail.
const CANONICAL_HOST = 'veloraweb.online';

export function middleware(req: NextRequest) {
  const host = req.headers.get('host')?.toLowerCase();
  if (host === `www.${CANONICAL_HOST}`) {
    const url = req.nextUrl.clone();
    url.protocol = 'https:';
    url.host = CANONICAL_HOST;
    url.port = '';
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
