import { requirePagePerm } from '@/server/auth/current';
import { getSettings } from '@/server/settings';
import { ROLE_LABELS } from '@/server/auth/permissions';
import { KitchenDisplay } from '@/components/kitchen/KitchenDisplay';

export const dynamic = 'force-dynamic';

export default async function KitchenPage() {
  const user = await requirePagePerm('kitchen.operate', '/kitchen/login');
  const r = await getSettings('restaurant');
  return <KitchenDisplay timezone={r.timezone} userName={user.fullName} roleLabel={user.roles.filter((x) => x !== 'customer').map((x) => ROLE_LABELS[x]).join(', ')} canMarkSoldOut={user.permissions.has('menu.availability')} />;
}
