import { CartProvider } from '@/lib/cart';
import { ShopHeader } from '@/components/shop/ShopHeader';
import { getStorefront, getMenuForStorefront } from '@/server/storefront';
import { ShopFooter } from '@/components/shop/ShopFooter';

export const dynamic = 'force-dynamic';

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [sf, menu] = await Promise.all([getStorefront(), getMenuForStorefront()]);
  const r = sf.restaurant;
  return (
    <CartProvider>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <ShopHeader name={r.name} />
      <main id="main">{children}</main>
      <ShopFooter sf={sf} menu={menu} />
    </CartProvider>
  );
}
