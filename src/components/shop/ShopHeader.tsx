'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BrandMark } from '../BrandMark';
import { Icon } from '../Icon';
import { useCart } from '@/lib/cart';

export function ShopHeader({ name }: { name: string }) {
  const path = usePathname();
  const { count, ready } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const home = path === '/' || path === '/menu';
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
  return (
    <header className={`shop-header${home ? ' on-hero' : ''}${scrolled ? ' scrolled' : ''}`}>
      <div className="wrap">
        <Link href="/" className="brand" aria-label={`${name} home`}>
          <BrandMark />
          <span>{name}</span>
        </Link>
        <nav className="shop-nav" aria-label="Main">
          <Link href="/menu" aria-current={cur('/menu')}>
            Menu
          </Link>
          <Link href="/about" aria-current={cur('/about')} className="hide-sm">
            About us
          </Link>
          <Link href="/track" aria-current={cur('/track')} className="hide-sm">
            Track order
          </Link>
          <Link href="/account" aria-current={cur('/account')} className="hide-sm">
            Account
          </Link>
          <button type="button" className="nav-toggle" aria-expanded={menuOpen} aria-controls="mobile-nav" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen((o) => !o)}>
            <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span>
          </button>
          <Link href="/checkout" className="btn primary sm cart-btn" aria-label={`Cart, ${ready ? count : 0} items`}>
            <Icon name="cart" size={18} />
            <span className="cart-count" aria-hidden="true">
              {ready ? count : 0}
            </span>
          </Link>
        </nav>
      </div>
      {menuOpen && (
        <nav id="mobile-nav" className="nav-panel" aria-label="Mobile">
          <Link href="/menu" aria-current={cur('/menu')}>
            Menu
          </Link>
          <Link href="/about" aria-current={cur('/about')}>
            About us
          </Link>
          <Link href="/track" aria-current={cur('/track')}>
            Track an order
          </Link>
          <Link href="/account" aria-current={cur('/account')}>
            Account
          </Link>
          <Link href="/help">Help</Link>
        </nav>
      )}
    </header>
  );
}
