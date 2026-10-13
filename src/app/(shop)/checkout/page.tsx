import type { Metadata } from 'next';
import { BackLink } from '@/components/shop/BackLink';
import { getStorefront, publicZones, getMenuForStorefront } from '@/server/storefront';
import { getCurrentUser } from '@/server/auth/current';
import { Checkout } from '@/components/shop/Checkout';
import type { ClientMenuItem } from '@/components/shop/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Checkout' };

export default async function CheckoutPage() {
  const [sf, zones, menu, user] = await Promise.all([getStorefront(), publicZones(), getMenuForStorefront(), getCurrentUser()]);
  const r = sf.restaurant;
  return (
    <div className="wrap section" style={{ paddingTop: 28 }}>
      <BackLink href="/menu" label="Back to menu" />
      <h1>Checkout</h1>
      <Checkout
        ordering={sf.ordering}
        zones={zones}
        timezone={r.timezone}
        menuItems={menu.items as unknown as ClientMenuItem[]}
        user={user && user.roles.includes('customer') ? { name: user.fullName, phone: user.phone, email: user.email } : null}
        restaurantAddress={[r.addressLine, r.city].filter(Boolean).join(', ')}
      />
    </div>
  );
}
