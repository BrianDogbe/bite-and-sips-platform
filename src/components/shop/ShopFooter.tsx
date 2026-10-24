import Link from 'next/link';
import { BrandMark } from '../BrandMark';
import { HoursSummary } from './HoursList';
import type { getStorefront, getMenuForStorefront } from '@/server/storefront';

type Storefront = Awaited<ReturnType<typeof getStorefront>>;
type Menu = Awaited<ReturnType<typeof getMenuForStorefront>>;

const inner = 'w-full px-[clamp(20px,5vw,80px)]';
const para = 'm-0 mb-3.5 leading-[1.6] text-[#e6ddcf]';
const h3 =
  "mb-[30px] mt-0 font-[family-name:var(--font-body)] text-[1.15rem] font-extrabold text-white after:mt-2 after:block after:h-[3px] after:w-11 after:bg-[repeating-linear-gradient(90deg,var(--caramel)_0_12px,transparent_12px_16px)] after:content-['']";
const list = 'm-0 grid list-none gap-1 p-0';
const contactList = 'm-0 grid list-none gap-3.5 p-0';
const link =
  "inline-flex min-h-11 items-center text-[#e6ddcf] no-underline hover:text-[var(--caramel)] before:mr-2.5 before:inline-block before:text-[#c9bfb2] before:content-['→'] hover:before:text-[var(--caramel)]";
const plain = 'text-[#e6ddcf] no-underline hover:text-[var(--caramel)]';
const soc =
  'grid size-11 place-items-center rounded-full bg-white text-[0.95rem] text-espresso no-underline hover:bg-[var(--caramel)] hover:text-espresso';
const ico = 'grid size-9 flex-none place-items-center rounded-full bg-[var(--caramel)] text-espresso';

export function ShopFooter({ sf, menu }: { sf: Storefront; menu: Menu }) {
  const r = sf.restaurant;
  return (
    <footer className="bg-espresso pt-[clamp(72px,9vw,120px)] text-[#e6ddcf]">

        <div className={inner}>
          <div className="grid grid-cols-1 gap-[clamp(40px,5vw,80px)] pb-[clamp(56px,7vw,96px)] min-[561px]:grid-cols-2 min-[1001px]:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
            <div>
              <div className="mb-5 flex items-center gap-2.5 font-[family-name:var(--font-display)] text-[2.3rem] text-white">
                <BrandMark light /> <span>{r.name}</span>
              </div>
              <p className={para}>{r.tagline || 'Good food. Good mood.'}</p>
              <p className={`${para} max-w-[34ch] text-[0.92rem]`}>Sandwiches, shawarma, salads, combos and drinks, made fresh. Order for pickup or delivery.</p>
              <div className="mt-6 flex gap-3">
                {r.social.instagram && (
                  <a href={r.social.instagram} className={soc} rel="noopener noreferrer" target="_blank" aria-label="Instagram">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
                    </svg>
                  </a>
                )}
                {r.social.facebook && (
                  <a href={r.social.facebook} className={soc} rel="noopener noreferrer" target="_blank" aria-label="Facebook">
                    <b aria-hidden="true">f</b>
                  </a>
                )}
                {r.social.tiktok && (
                  <a href={r.social.tiktok} className={soc} rel="noopener noreferrer" target="_blank" aria-label="TikTok">
                    <b aria-hidden="true">♪</b>
                  </a>
                )}
                {r.whatsapp && (
                  <a className={soc} href={`https://wa.me/${r.whatsapp.replace(/[^\d]/g, '')}`} rel="noopener noreferrer" target="_blank" aria-label="WhatsApp">
                    <b aria-hidden="true">W</b>
                  </a>
                )}
              </div>
            </div>

            <div>
              <h3 className={h3}>Our Menu</h3>
              <ul className={list}>
                {menu.categories.map((c) => (
                  <li key={c.id}>
                    <Link className={link} href={`/menu#cat-${c.id}`}>{c.name}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className={h3}>Useful Links</h3>
              <ul className={list}>
                <li>
                  <Link className={link} href="/about">About us</Link>
                </li>
                <li>
                  <Link className={link} href="/track">Track an order</Link>
                </li>
                <li>
                  <Link className={link} href="/account">My account</Link>
                </li>
                <li>
                  <Link className={link} href="/help">Get help with an order</Link>
                </li>
                <li>
                  <Link className={link} href="/policies">Terms, privacy and refunds</Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className={h3}>Contact Us</h3>
              <ul className={contactList}>
                {r.phone && (
                  <li className="flex items-start gap-4 text-base leading-[1.45]">
                    <span className={ico} aria-hidden="true">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.6 3.6a1 1 0 0 1-.25 1Z" /></svg>
                    </span>
                    <a className={plain} href={`tel:${r.phone.replace(/\s/g, '')}`}>{r.phone}</a>
                  </li>
                )}
                {r.email && (
                  <li className="flex items-start gap-4 text-base leading-[1.45]">
                    <span className={ico} aria-hidden="true">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                    </span>
                    <a className={plain} href={`mailto:${r.email}`}>{r.email}</a>
                  </li>
                )}
                <li className="flex items-start gap-4 text-base leading-[1.45]">
                  <span className={ico} aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" /></svg>
                  </span>
                  <span>{r.addressLine ? [r.addressLine, r.city].filter(Boolean).join(', ') : 'Address coming soon'}</span>
                </li>
                <li className="flex items-start gap-4 text-base leading-[1.45]">
                  <span className={ico} aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                  </span>
                  <span className="m-0 grid gap-0.5">
                    <HoursSummary hours={sf.hours} />
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="bg-[var(--espresso-2)] py-[26px] text-[0.9rem]">
          <div className={`${inner} flex flex-wrap items-center justify-between gap-x-6 gap-y-3`}>
            <span>
              © {new Date().getFullYear()} {r.name}. All rights reserved.
            </span>
          </div>
        </div>
    </footer>
  );
}
