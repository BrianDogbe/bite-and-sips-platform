'use client';
import Image from 'next/image';
import { Icon } from '../Icon';
import { formatGHS } from '@/lib/money';
import type { ClientMenuItem } from './types';

export function fromPrice(item: ClientMenuItem) {
  if (item.variants.length) {
    const min = Math.min(...item.variants.filter((v) => v.isAvailable).map((v) => v.pricePesewas).concat(item.variants.map((v) => v.pricePesewas)));
    return formatGHS(min);
  }
  return formatGHS(item.basePricePesewas);
}

const TAG_LABELS: Record<string, string> = { vegetarian: 'Vegetarian', vegan: 'Vegan', spicy: 'Spicy', gluten_free: 'Gluten-free', halal: 'Halal' };
export const tagLabel = (t: string) => TAG_LABELS[t] ?? t;

const BTN = 'mt-1.5 flex min-h-[42px] items-center justify-center gap-2 rounded-xl font-extrabold';

export function DishCard({ item, onOpen, best }: { item: ClientMenuItem; onOpen: (i: ClientMenuItem) => void; best?: boolean }) {
  const initials = item.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  return (
    <button type="button" className="group flex size-full h-full cursor-pointer flex-col overflow-hidden rounded-[18px] border-0 bg-[var(--caramel)] p-0 text-left text-espresso [font:inherit] [overflow-wrap:anywhere]" onClick={() => onOpen(item)} aria-label={`${item.name}, ${fromPrice(item)}${item.orderable ? '' : ', unavailable'}`}>
      <div className="relative aspect-[3/2] flex-none overflow-hidden bg-[var(--espresso-2)]">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt={item.imageAlt ?? ''} fill sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 300px" className="object-cover" />
        ) : (
          <div className="grid size-full place-items-center bg-[radial-gradient(circle_at_30%_30%,var(--espresso-2),var(--espresso))] font-[family-name:var(--font-display)] text-[3.4rem] font-normal tracking-[-0.04em] text-[var(--caramel)]" aria-hidden="true">
            {initials}
          </div>
        )}
        {item.orderable && best && <span className="absolute left-3.5 top-3.5 rounded-lg bg-espresso px-[11px] py-1 text-[0.72rem] font-extrabold uppercase tracking-[0.1em] text-ivory">Popular</span>}
        {!item.orderable && <span className="absolute bottom-2.5 right-2.5 rounded-full bg-white px-2.5 py-1 text-[0.8rem] font-bold text-espresso">{item.unavailableReason === 'sold out' || !item.unavailableReason ? 'Sold out' : 'Unavailable'}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-[18px] pb-[18px] pt-4">
        <span className="line-clamp-2 font-[family-name:var(--font-display)] text-[1.4rem] font-normal leading-[1.15] text-espresso">{item.name}</span>
        {item.description && <span className="line-clamp-2 text-[0.9rem] leading-[1.4] text-espresso">{item.description}</span>}
        <span className="mt-auto block pt-1.5 text-[1.25rem] font-extrabold tabular-nums text-espresso">{fromPrice(item)}</span>
        {item.orderable ? (
          <span className={`${BTN} bg-espresso text-ivory transition-[filter] duration-200 group-hover:brightness-[1.08] motion-reduce:transition-none`} aria-hidden="true">
            <Icon name="cart" size={18} /> Add to cart
          </span>
        ) : (
          <span className={`${BTN} bg-[rgba(53,37,31,0.15)] text-[rgba(53,37,31,0.7)]`} aria-hidden="true">
            Unavailable
          </span>
        )}
      </div>
    </button>
  );
}
