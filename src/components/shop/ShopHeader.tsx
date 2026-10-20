'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BrandMark } from '../BrandMark';
import { Icon } from '../Icon';
import { useCart } from '@/lib/cart';

/** The order in progress on this device (written by the tracking page), so customers can get back to it if they closed that page. */
export const ACTIVE_ORDER_STORE = 'bs_active_order';
export const ACTIVE_ORDER_EVENT = 'bs-active-order';
const ACTIVE_ORDER_MAX_AGE = 24 * 60 * 60 * 1000;

function readActiveOrder(): { token: string; orderNumber: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(ACTIVE_ORDER_STORE) || 'null') as { token?: string; orderNumber?: string; savedAt?: number } | null;
    if (!v?.token || !v.orderNumber) return null;
    if (!v.savedAt || Date.now() - v.savedAt > ACTIVE_ORDER_MAX_AGE) {
      localStorage.removeItem(ACTIVE_ORDER_STORE);
      return null;
    }
    return { token: v.token, orderNumber: v.orderNumber };
  } catch {
    return null;
  }
}

export function ShopHeader({ name }: { name: string }) {
  const path = usePathname();
  const { count, ready } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<{ token: string; orderNumber: string } | null>(null);
  useEffect(() => {
    const sync = () => setActive(readActiveOrder());
    sync();
    window.addEventListener(ACTIVE_ORDER_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ACTIVE_ORDER_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [path]);
  // No need for the shortcut on the order's own page.
  const showActive = active && path !== `/track/${active.token}`;
  const home = path === '/' || path === '/menu' || path === '/about';
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    setMenuOpen(false);
  }, [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  const cur = (p: string) => (path === p || (p !== '/' && path.startsWith(p)) ? 'page' : undefined);

  // Over the hero the header floats transparent with white text; once scrolled (or on other pages) it is solid ivory.
  const overHero = home && !scrolled;
  const headerCls = [
    'z-30 border-b transition-[background-color,box-shadow,border-color] duration-[250ms] motion-reduce:transition-none',
    home ? 'fixed inset-x-0' : 'sticky top-0',
    overHero
      ? "isolate border-transparent bg-transparent before:pointer-events-none before:absolute before:inset-[0_0_-56px_0] before:-z-10 before:bg-gradient-to-b before:from-[rgba(53,37,31,0.62)] before:to-[rgba(53,37,31,0)] before:content-['']"
      : home
        ? 'border-[var(--border)] bg-[rgba(247,242,233,0.96)] shadow-[0_6px_20px_rgba(53,37,31,0.08)] backdrop-blur-sm'
        : 'border-line bg-[rgba(247,242,233,0.94)] backdrop-blur-sm',
  ].join(' ');
  const innerCls = [
    'flex w-full min-h-16 items-center gap-4 max-[640px]:gap-2',
    home ? 'max-w-none px-[clamp(20px,5vw,80px)]' : 'mx-auto max-w-[var(--maxw)] px-[var(--gutter)]',
  ].join(' ');
  const brandCls = [
    'inline-flex items-center gap-2.5 whitespace-nowrap font-[family-name:var(--font-display)] text-[1.6rem] font-normal no-underline max-[400px]:text-[1.3rem]',
    overHero ? 'text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.35)]' : 'text-espresso',
  ].join(' ');
  const linkCls = [
    'rounded-[var(--r-sm)] px-4 py-2.5 font-bold no-underline max-[640px]:hidden',
    overHero
      ? 'text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.35)] hover:bg-[rgba(255,255,255,0.18)] aria-[current=page]:bg-[rgba(255,255,255,0.18)]'
      : 'hover:bg-ivory-2 hover:text-espresso aria-[current=page]:bg-ivory-2 aria-[current=page]:text-espresso',
  ].join(' ');
  const panelLinkCls =
    'block border-b border-[var(--border)] px-1 py-3.5 text-[1.1rem] font-bold text-espresso no-underline last:border-b-0 aria-[current=page]:text-caramel';

  return (
    <header className={headerCls}>
      <div className={innerCls}>
        <Link href="/" className={brandCls} aria-label={`${name} home`}>
          <BrandMark />
          <span>{name}</span>
        </Link>
        <nav className="ml-auto flex items-center gap-[clamp(10px,1.6vw,28px)]" aria-label="Main">
          <Link href="/menu" aria-current={cur('/menu')} className={linkCls}>
            Menu
          </Link>
          <Link href="/about" aria-current={cur('/about')} className={linkCls}>
            About us
          </Link>
          <Link href="/track" aria-current={cur('/track')} className={linkCls}>
            Track order
          </Link>
          <Link href="/account" aria-current={cur('/account')} className={linkCls}>
            Account
          </Link>
          <button
            type="button"
            className={`hidden size-11 cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent text-[1.4rem] max-[640px]:inline-grid ${overHero ? 'text-white' : 'text-inherit'}`}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span>
          </button>
          {showActive && (
            <Link
              href={`/track/${active.token}`}
              className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-3.5 font-bold no-underline max-[400px]:px-2.5 ${overHero ? 'border-[rgba(255,255,255,0.75)] text-white hover:bg-[rgba(255,255,255,0.18)]' : 'border-espresso text-espresso hover:bg-ivory-2'}`}
              aria-label={`Your order ${active.orderNumber} is in progress. Track it`}
            >
              <span className="size-2 rounded-full bg-sage motion-safe:animate-pulse" aria-hidden="true" />
              <span className="max-[400px]:hidden">Your order</span>
              <span className="hidden max-[400px]:inline">Order</span>
              <span className="tnum font-semibold max-[900px]:hidden">{active.orderNumber}</span>
            </Link>
          )}
          <Link href="/checkout" className="btn primary sm relative" aria-label={`Cart, ${ready ? count : 0} items`}>
            <Icon name="cart" size={18} />
            <span className="inline-grid h-[22px] min-w-[22px] place-items-center rounded-full bg-[var(--caramel)] px-1.5 text-[0.8rem] text-espresso" aria-hidden="true">
              {ready ? count : 0}
            </span>
          </Link>
        </nav>
      </div>
      {menuOpen && (
        <nav
          id="mobile-nav"
          className="absolute inset-x-0 top-full hidden border-b border-[var(--border)] bg-ivory px-[var(--gutter)] pb-3.5 pt-2 shadow-[0_12px_28px_rgba(53,37,31,0.14)] max-[640px]:grid"
          aria-label="Mobile"
        >
          <Link href="/menu" aria-current={cur('/menu')} className={panelLinkCls}>
            Menu
          </Link>
          <Link href="/about" aria-current={cur('/about')} className={panelLinkCls}>
            About us
          </Link>
          <Link href="/track" aria-current={cur('/track')} className={panelLinkCls}>
            Track an order
          </Link>
          <Link href="/account" aria-current={cur('/account')} className={panelLinkCls}>
            Account
          </Link>
          <Link href="/help" className={panelLinkCls}>
            Help
          </Link>
        </nav>
      )}
    </header>
  );
}
