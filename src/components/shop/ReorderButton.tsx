'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cart';
import type { ClientMenuItem } from './types';

/** Re-adds a previous order's items to the cart using CURRENT menu prices and availability. */
export function ReorderButton({ orderId }: { orderId: string }) {
  const cart = useCart();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn sm leaf"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const [lr, mr] = await Promise.all([fetch(`/api/account/reorder/${orderId}`), fetch('/api/menu')]);
            const { lines } = (await lr.json()) as { lines: { menuItemId: number; variantId: number | null; modifierIds: number[]; quantity: number; instructions: string | null }[] };
            const menu = (await mr.json()) as { items: ClientMenuItem[] };
            let skipped = 0;
            for (const l of lines) {
              const it = menu.items.find((m) => m.id === l.menuItemId);
              const v = it?.variants.find((x) => x.id === l.variantId) ?? null;
              const mods = it?.modifierGroups.flatMap((g) => g.modifiers).filter((m) => l.modifierIds.includes(m.id)) ?? [];
              if (!it || !it.orderable || (it.variants.length && (!v || !v.isAvailable)) || mods.length !== l.modifierIds.length || mods.some((m) => !m.isAvailable)) {
                skipped++;
                continue;
              }
              cart.add({
                menuItemId: it.id,
                variantId: v?.id ?? null,
                modifierIds: l.modifierIds,
                quantity: l.quantity,
                instructions: l.instructions,
                name: it.name,
                variantName: v?.name ?? null,
                modifierNames: mods.map((m) => m.name),
                unitPricePesewas: (v ? v.pricePesewas : it.basePricePesewas) + mods.reduce((s, m) => s + m.pricePesewas, 0),
                imageUrl: it.imageUrl,
              });
            }
            if (skipped === lines.length) setMsg('None of these items are available right now.');
            else router.push('/checkout');
            if (skipped && skipped < lines.length) setMsg(`${skipped} item(s) are no longer available and were left out.`);
          } catch {
            setMsg('Couldn’t load that order. Try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        Reorder
      </button>
      {msg && <span className="hint" role="status"> {msg}</span>}
    </>
  );
}
