import type { Metadata } from 'next';
import Image from 'next/image';
import { getMenuForStorefront, getStorefront } from '@/server/storefront';
import { MenuBrowser } from '@/components/shop/MenuBrowser';
import type { ClientMenuItem } from '@/components/shop/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Menu' };

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const [menu, sf, sp] = await Promise.all([getMenuForStorefront(), getStorefront(), searchParams]);
  return (
    <>
      <header className="menu-hero">
        <Image src="/brand/hero-bg.jpg" alt="" fill priority sizes="100vw" className="menu-hero-bg" />
        <div className="menu-hero-shade" />
        <div className="wrap menu-hero-in">
          <p className="hero-eyebrow">{sf.restaurant.name}</p>
          <h1>Our menu</h1>
          <p className="menu-hero-sub">Choose a dish to see sizes, sides and extras.</p>
          {!sf.ordering.acceptingOrders && <p className="alert warn">{sf.ordering.pauseMessage} You can still browse the menu.</p>}
        </div>
      </header>
      <div className="wrap menu-body">
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
