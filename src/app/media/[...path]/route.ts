import { readImage } from '@/server/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path.length !== 1) return new Response('Not found', { status: 404 });
  const img = await readImage(path[0]);
  if (!img) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(img.body), {
    headers: { 'Content-Type': img.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
  });
}
