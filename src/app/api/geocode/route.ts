import { NextResponse } from '@/server/response';
import { z } from 'zod';
import { handler, readJson, noStore, clientIp } from '@/server/http';
import { invalid } from '@/server/errors';
import { enforceRateLimit } from '@/server/auth/rate-limit';

export const dynamic = 'force-dynamic';

const body = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

interface Nominatim {
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
}

/**
 * Turns the customer's GPS position into a readable street address (OpenStreetMap Nominatim).
 * Best-effort: coverage in Ghana varies, so the customer can always edit what we fill in.
 * Coordinates are sent in a POST body to us, then to OSM server-side (never put in our own URLs/logs).
 */
export const POST = handler(async (req: Request) => {
  await enforceRateLimit(`geocode:${clientIp(req.headers)}`, 30, 60);
  const p = body.safeParse(await readJson(req));
  if (!p.success) throw invalid('Invalid location.');
  const { lat, lng } = p.data;

  let data: Nominatim | null = null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=en&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'BiteAndSips-Checkout/1.0 (restaurant delivery address lookup)' }, signal: AbortSignal.timeout(6000) });
    if (res.ok) data = (await res.json()) as Nominatim;
  } catch {
    data = null;
  }
  if (!data || !data.address) return NextResponse.json({ found: false }, { headers: noStore });

  const a = data.address;
  const street = [a.house_number, a.road].filter(Boolean).join(' ') || a.pedestrian || a.footway || '';
  const area = a.neighbourhood || a.suburb || a.quarter || a.residential || a.city_district || '';
  const town = a.city || a.town || a.village || a.municipality || a.county || '';
  const parts = [street, area, town].filter((x, i, arr) => x && arr.indexOf(x) === i);
  let addressLine = parts.join(', ');
  if (!addressLine && data.display_name) addressLine = data.display_name.split(',').slice(0, 3).map((x) => x.trim()).join(', ');
  const poi = data.name && data.name !== a.road && data.name !== area && data.name !== town ? data.name : '';
  return NextResponse.json(
    { found: !!addressLine, addressLine: addressLine.slice(0, 200), landmark: poi ? `Near ${poi}`.slice(0, 200) : null, area: area || town || null },
    { headers: noStore },
  );
});
