/** @type {import('next').NextConfig} */

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // Geolocation is needed by the rider portal (location sharing) and the checkout "use my location" button.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
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
