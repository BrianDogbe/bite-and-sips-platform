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

export function DishCard({ item, onOpen, best }: { item: ClientMenuItem; onOpen: (i: ClientMenuItem) => void; best?: boolean }) {
  const initials = item.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  return (
    <button type="button" className="dish" onClick={() => onOpen(item)} aria-label={`${item.name}, ${fromPrice(item)}${item.orderable ? '' : ', unavailable'}`}>
      <div className="dish-img">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt={item.imageAlt ?? ''} fill sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 300px" />
        ) : (
          <div className="dish-noimg" aria-hidden="true">
            {initials}
          </div>
        )}
        {item.orderable && best && <span className="dish-badge pop">Popular</span>}
        {!item.orderable && <span className="soldout">{item.unavailableReason === 'sold out' || !item.unavailableReason ? 'Sold out' : 'Unavailable'}</span>}
      </div>
      <div className="dish-body">
        <span className="dish-name">{item.name}</span>
        {item.description && <span className="dish-desc">{item.description}</span>}
        <span className="price">{fromPrice(item)}</span>
        {item.orderable ? (
          <span className="dish-btn" aria-hidden="true">
            <Icon name="cart" size={18} /> Add to cart
          </span>
        ) : (
          <span className="dish-btn off" aria-hidden="true">
            Unavailable
          </span>
        )}
      </div>
    </button>
  );
}
