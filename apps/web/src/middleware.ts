import { NextResponse, type NextRequest } from 'next/server';

// One canonical host for the site. Sign-in keeps its state and CSRF cookies per host, so a
// Google sign-in started on one of veloraweb.online / www.veloraweb.online and finished on
// the other would fail. The canonical host is NEXTAUTH_URL's (the host Google redirects
// back to), falling back to the bare domain.
const DOMAIN = 'veloraweb.online';

function canonicalHost(): string {
  try {
    const host = new URL(process.env.NEXTAUTH_URL ?? '').host.toLowerCase();
    if (host === DOMAIN || host === `www.${DOMAIN}`) return host;
  } catch {
    // Unset or invalid: use the bare domain.
  }
  return DOMAIN;
}

export function middleware(req: NextRequest) {
  const host = req.headers.get('host')?.toLowerCase();
  if (host !== DOMAIN && host !== `www.${DOMAIN}`) return NextResponse.next();
  const canonical = canonicalHost();
  if (host === canonical) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.protocol = 'https:';
  url.host = canonical;
  url.port = '';
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
