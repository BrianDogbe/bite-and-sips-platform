import { NextResponse } from 'next/server';
import { handler, noStore } from '@/server/http';
import { publicMenu } from '@/server/menu';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  return NextResponse.json(await publicMenu(), { headers: noStore });
});
