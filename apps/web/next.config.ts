import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Prevent Webpack/Turbopack from trying to bundle native .node binaries and
  // the Sentry instrumentation package — each is require()'d at runtime from
  // node_modules instead. Eliminates bundling warnings and speeds up cold compile.
  serverExternalPackages: ['better-sqlite3', '@node-rs/argon2', '@sentry/nextjs'],
  experimental: {
    // Enable server actions (default in Next 15, but explicit for clarity)
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
