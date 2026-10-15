import type { Metadata } from 'next';
import { PageBanner } from '@/components/shop/PageBanner';
import { getMenuForStorefront, getStorefront } from '@/server/storefront';
import { MenuBrowser } from '@/components/shop/MenuBrowser';
import type { ClientMenuItem } from '@/components/shop/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Menu' };

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const [menu, sf, sp] = await Promise.all([getMenuForStorefront(), getStorefront(), searchParams]);
  return (
    <>
      <PageBanner eyebrow={sf.restaurant.name} title="Our menu" sub="Choose a dish to see sizes, sides and extras.">
        {!sf.ordering.acceptingOrders && <p className="alert warn mx-auto max-w-[560px]">{sf.ordering.pauseMessage} You can still browse the menu.</p>}
      </PageBanner>
      <div className="mx-auto w-full max-w-none px-[clamp(20px,5vw,80px)] pb-24">
      <MenuBrowser
        categories={menu.categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description }))}
        items={menu.items as unknown as ClientMenuItem[]}
        bestsellerIds={menu.bestsellerIds}
        maxQty={sf.ordering.maxItemQuantity}
        initialItem={sp.item ?? null}
      />
      </div>
    </>
  );
}
