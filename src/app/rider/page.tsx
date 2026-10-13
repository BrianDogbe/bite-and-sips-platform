import { requirePagePerm } from '@/server/auth/current';
import { ROLE_LABELS } from '@/server/auth/permissions';
import { getSettings } from '@/server/settings';
import { TabSignIn } from '@/components/TabSignIn';
import { RiderApp } from '@/components/rider/RiderApp';

export const dynamic = 'force-dynamic';

export default async function RiderPage() {
  const user = await requirePagePerm('rider.deliver', '/rider/login');
  const r = await getSettings('restaurant');
  return (
    <>
      <TabSignIn portal="rider" loginPath="/rider/login" />
      <RiderApp name={user.fullName} timezone={r.timezone} roleLabel={user.roles.filter((x) => x !== 'customer').map((x) => ROLE_LABELS[x]).join(', ')} />
    </>
  );
}
