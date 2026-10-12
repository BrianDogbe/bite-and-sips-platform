import Link from 'next/link';
import { CartProvider } from '@/lib/cart';
import { ShopHeader } from '@/components/shop/ShopHeader';
import { getStorefront, getMenuForStorefront } from '@/server/storefront';
import { BrandMark } from '@/components/BrandMark';
import { HoursSummary } from '@/components/shop/HoursList';

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
      <footer className="shop-footer">
        <div className="wrap">
          <div className="foot-cols">
            <div className="foot-brand">
              <div className="foot-logo">
                <BrandMark light /> <span>{r.name}</span>
              </div>
              <p>{r.tagline || 'Good food. Good mood.'}</p>
              <p className="foot-blurb">Sandwiches, shawarma, salads, combos and drinks, made fresh. Order for pickup or delivery.</p>
              <div className="foot-social">
                {r.social.instagram && (
                  <a href={r.social.instagram} rel="noopener noreferrer" target="_blank" aria-label="Instagram">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
                    </svg>
                  </a>
                )}
                {r.social.facebook && (
                  <a href={r.social.facebook} rel="noopener noreferrer" target="_blank" aria-label="Facebook">
                    <b aria-hidden="true">f</b>
                  </a>
                )}
                {r.social.tiktok && (
                  <a href={r.social.tiktok} rel="noopener noreferrer" target="_blank" aria-label="TikTok">
                    <b aria-hidden="true">♪</b>
                  </a>
                )}
                {r.whatsapp && (
                  <a href={`https://wa.me/${r.whatsapp.replace(/[^\d]/g, '')}`} rel="noopener noreferrer" target="_blank" aria-label="WhatsApp">
                    <b aria-hidden="true">W</b>
                  </a>
                )}
              </div>
            </div>

            <div>
              <h3>Our Menu</h3>
              <ul className="foot-links">
                {menu.categories.map((c) => (
                  <li key={c.id}>
                    <Link href={`/menu#cat-${c.id}`}>{c.name}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3>Useful Links</h3>
              <ul className="foot-links">
                <li>
                  <Link href="/about">About us</Link>
                </li>
                <li>
                  <Link href="/track">Track an order</Link>
                </li>
                <li>
                  <Link href="/account">My account</Link>
                </li>
                <li>
                  <Link href="/help">Get help with an order</Link>
                </li>
                <li>
                  <Link href="/policies">Terms, privacy and refunds</Link>
                </li>
              </ul>
            </div>

            <div>
              <h3>Contact Us</h3>
              <ul className="foot-contact">
                {r.phone && (
                  <li>
                    <span className="foot-ico" aria-hidden="true">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.6 3.6a1 1 0 0 1-.25 1Z" /></svg>
                    </span>
                    <a href={`tel:${r.phone.replace(/\s/g, '')}`}>{r.phone}</a>
                  </li>
                )}
                {r.email && (
                  <li>
                    <span className="foot-ico" aria-hidden="true">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                    </span>
                    <a href={`mailto:${r.email}`}>{r.email}</a>
                  </li>
                )}
                <li>
                  <span className="foot-ico" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" /></svg>
                  </span>
                  <span>{r.addressLine ? [r.addressLine, r.city].filter(Boolean).join(', ') : 'Address coming soon'}</span>
                </li>
                <li>
                  <span className="foot-ico" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                  </span>
                  <span className="hours-block">
                    <HoursSummary hours={sf.hours} />
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="foot-bar">
          <div className="wrap foot-bar-in">
            <span>
              © {new Date().getFullYear()} {r.name}. All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </CartProvider>
  );
}
