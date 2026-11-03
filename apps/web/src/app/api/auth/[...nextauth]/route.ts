import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ensureNextAuthUrl } from '@/lib/site-url';

ensureNextAuthUrl();

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
