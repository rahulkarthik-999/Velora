/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@velora/schemas'],
  experimental: {
    // In this pnpm monorepo the Prisma query engine sits outside the app folder,
    // and file tracing can miss it; include it in every server function explicitly.
    outputFileTracingIncludes: {
      '/**/*': [
        '../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node',
        '../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/schema.prisma',
      ],
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  async redirects() {
    // Common sign-in addresses people type or bookmark.
    return [
      { source: '/login', destination: '/auth/signin', permanent: true },
      { source: '/signin', destination: '/auth/signin', permanent: true },
      { source: '/signup', destination: '/auth/signin?mode=signup', permanent: true },
      { source: '/register', destination: '/auth/signin?mode=signup', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
