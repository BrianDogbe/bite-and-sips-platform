/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === 'production';

// Where the browser may connect for live updates (the separate backend's websocket, if one is configured).
function socketOrigins() {
  const url = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (!url) return [];
  try {
    const u = new URL(url);
    const ws = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return [u.origin, `${ws}//${u.host}`];
  } catch {
    return [];
  }
}

// Content-Security-Policy, sent in REPORT-ONLY mode first: the browser lists anything it would have blocked in the
// developer console (F12 -> Console) but blocks nothing, so a missed source can't break the site. When the console is
// clean on every page, change the header name below to 'Content-Security-Policy' to enforce it.
// 'unsafe-inline' is needed because Next.js writes small inline scripts and styles; 'unsafe-eval' only for the dev server.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  `connect-src ${["'self'", ...socketOrigins()].join(' ')}`,
  "media-src 'self'",
  'frame-src https://www.openstreetmap.org',
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // Geolocation is needed by the rider portal (location sharing) and the checkout "use my location" button.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  { key: 'Content-Security-Policy-Report-Only', value: csp },
  // Tells browsers to use HTTPS only. Production only: on http://localhost it would be ignored anyway.
  ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `postgres` is a Node-only driver; keep it out of the bundler.
  serverExternalPackages: ['postgres'],
  images: {
    remotePatterns: [
      // Demo photography (see docs/IMAGE-SOURCES.md). Replace with the restaurant's own photos before launch.
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  // When BACKEND_URL is set (e.g. http://localhost:4000), every /api/* call is proxied to the separate backend service.
  // Leave it unset to keep serving the API from this Next.js app.
  async rewrites() {
    const backend = process.env.BACKEND_URL?.replace(/\/$/, '');
    if (!backend) return [];
    return { beforeFiles: [{ source: '/api/:path*', destination: `${backend}/api/:path*` }] };
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/rider-sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/rider' },
        ],
      },
    ];
  },
};

export default nextConfig;
