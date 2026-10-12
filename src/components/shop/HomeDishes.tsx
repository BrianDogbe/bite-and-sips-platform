'use client';
import { useState } from 'react';
import { DishCard } from './DishCard';
import { ItemSheet } from './ItemSheet';
import type { ClientMenuItem } from './types';

export function HomeDishes({ items, bestIds, maxQty }: { items: ClientMenuItem[]; bestIds: number[]; maxQty: number }) {
  const [open, setOpen] = useState<ClientMenuItem | null>(null);
  if (!items.length) {
    return (
      <div className="empty panel">
        <h3>The menu is coming soon</h3>
        <p>We haven’t published any dishes yet.</p>
      </div>
    );
  }
  return (
    <>
      <div className="dish-grid">
        {items.map((i) => (
          <DishCard key={i.id} item={i} onOpen={setOpen} best={bestIds.includes(i.id)} />
        ))}
      </div>
      <ItemSheet item={open} onClose={() => setOpen(null)} maxQty={maxQty} />
    </>
  );
}
