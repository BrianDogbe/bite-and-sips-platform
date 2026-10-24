import type { Metadata } from 'next';
import { PageBanner } from '@/components/shop/PageBanner';
import { getMenuForStorefront, getStorefront } from '@/server/storefront';
import { MenuBrowser } from '@/components/shop/MenuBrowser';
import type { ClientMenuItem } from '@/components/shop/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Menu' };

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const [menu, sf, sp] = await Promise.all([getMenuForStorefront(), getStorefront(), searchParams]);
  const now = new Date();
  const activeClosure = sf.closures.find((c) => new Date(c.startsAt) <= now);
  return (
    <>
      <PageBanner eyebrow={sf.restaurant.name} title="Our menu" sub="Choose a dish to see sizes, sides and extras.">
        {/* Same open/closed notice as the home page, since shared links usually land here. */}
        {(activeClosure || !sf.ordering.acceptingOrders || !sf.openNow) && (
          <p className="alert warn mx-auto mt-5 max-w-[560px]" role="status">
            {activeClosure
              ? `Temporarily closed${activeClosure.reason ? `: ${activeClosure.reason}` : ''}. You can still browse the menu.`
              : !sf.ordering.acceptingOrders
                ? `${sf.ordering.pauseMessage} You can still browse the menu.`
                : 'We’re closed right now. You can still schedule an order for later at checkout.'}
          </p>
        )}
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
