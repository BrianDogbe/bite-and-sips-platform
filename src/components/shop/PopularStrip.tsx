'use client';
import Image from 'next/image';
import { useState } from 'react';
import { fromPrice } from './DishCard';
import { ItemSheet } from './ItemSheet';
import type { ClientMenuItem } from './types';

/**
 * A short row of dishes on the home page. `popular` marks real best sellers (from completed orders);
 * the rest are the owner's featured picks, and the heading says so instead of passing them off as sales.
 */
export function PopularStrip({ heading, items, maxQty }: { heading: string; items: { item: ClientMenuItem; popular: boolean }[]; maxQty: number }) {
  const [open, setOpen] = useState<ClientMenuItem | null>(null);
  const mixed = items.some((i) => i.popular) && items.some((i) => !i.popular);
  return (
    <>
      <h2 id="popular-title" className="m-0 mb-3 font-[family-name:var(--font-body)] text-[1.05rem] font-extrabold text-espresso">
        {heading}
      </h2>
      <ul className="m-0 grid list-none gap-2.5 p-0 min-[600px]:grid-cols-2 min-[1001px]:grid-cols-4">
        {items.map(({ item, popular }) => (
          <li key={item.id} className="min-w-0">
            <button
              type="button"
              className="group flex min-h-[76px] w-full cursor-pointer items-center gap-3.5 rounded-2xl border border-[var(--line)] bg-white p-2 pr-4 text-left text-espresso transition-[border-color,box-shadow] duration-200 [font-family:inherit] hover:border-espresso hover:shadow-[0_6px_18px_rgba(53,37,31,0.12)] focus-visible:shadow-[var(--focus)] focus-visible:outline-none motion-reduce:transition-none"
              onClick={() => setOpen(item)}
              aria-label={`${item.name}, ${fromPrice(item)}${popular && mixed ? ', popular' : ''}. Choose options`}
            >
              <span className="relative size-[60px] flex-none overflow-hidden rounded-xl bg-ivory-2">
                {item.imageUrl ? (
                  <Image src={item.imageUrl} alt="" fill sizes="60px" className="object-cover" />
                ) : (
                  <span className="grid size-full place-items-center bg-espresso font-[family-name:var(--font-display)] text-[1.5rem] text-[var(--caramel)]" aria-hidden="true">
                    {item.name.slice(0, 1)}
                  </span>
                )}
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="line-clamp-2 text-[0.98rem] font-bold leading-[1.25]">{item.name}</span>
                <span className="flex items-center gap-2 text-[0.92rem] tabular-nums text-muted">
                  {item.variants.length > 1 ? `from ${fromPrice(item)}` : fromPrice(item)}
                  {popular && mixed && <span className="rounded-md bg-caramel-tint px-1.5 py-px text-[0.78rem] font-extrabold text-caramel">Popular</span>}
                </span>
              </span>
              <span className="grid size-8 flex-none place-items-center rounded-full bg-espresso text-white transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <ItemSheet item={open} onClose={() => setOpen(null)} maxQty={maxQty} />
    </>
  );
}
