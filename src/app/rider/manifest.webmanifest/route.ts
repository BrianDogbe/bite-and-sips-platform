export const dynamic = 'force-static';

export function GET() {
  return new Response(
    JSON.stringify({
      name: 'Bite & Sips Rider',
      short_name: 'B&S Rider',
      start_url: '/rider',
      scope: '/rider',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#f3f5f2',
      theme_color: '#35251f',
      icons: [
        { src: '/icons/rider-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/rider-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/rider-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    }),
    { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } },
  );
}
