import { requirePagePerm } from '@/server/auth/current';
import { getSettings } from '@/server/settings';
import { RiderApp } from '@/components/rider/RiderApp';

export const dynamic = 'force-dynamic';

export default async function RiderPage() {
  const user = await requirePagePerm('rider.deliver', '/rider/login');
  const r = await getSettings('restaurant');
  return <RiderApp name={user.fullName} timezone={r.timezone} />;
}
