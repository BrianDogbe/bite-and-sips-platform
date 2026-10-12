import { NextResponse } from 'next/server';
import { handler, noStore } from '@/server/http';
import { getCurrentUser } from '@/server/auth/current';
import { kitchenQueue } from '@/server/orders/queries';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => NextResponse.json(await kitchenQueue(await getCurrentUser()), { headers: noStore }));
