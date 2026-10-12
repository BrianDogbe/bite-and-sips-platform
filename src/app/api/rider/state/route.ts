import { NextResponse } from 'next/server';
import { handler, noStore } from '@/server/http';
import { getCurrentUser } from '@/server/auth/current';
import { riderAssignments, riderHistory } from '@/server/fulfillment/inhouse';
import { getSettings } from '@/server/settings';
import { sql } from '@/server/db';
import { requirePerm } from '@/server/auth/guard';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const user = requirePerm(await getCurrentUser(), 'rider.deliver');
  const [a, history, s, prof] = await Promise.all([
    riderAssignments(user),
    riderHistory(user),
    getSettings('delivery'),
    sql<{ isOnDuty: boolean; lastLocationAt: Date | null }[]>`select is_on_duty, last_location_at from rider_profiles where user_id = ${user.id}`,
  ]);
  return NextResponse.json(
    { ...a, history, onDuty: prof[0]?.isOnDuty ?? false, lastLocationAt: prof[0]?.lastLocationAt ?? null, locationIntervalSeconds: s.locationIntervalSeconds, serverTime: new Date().toISOString() },
    { headers: noStore },
  );
});
