'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DishCard } from './DishCard';
import { ItemSheet } from './ItemSheet';
import { Icon } from '../Icon';
import { useCart } from '@/lib/cart';
import { formatGHS } from '@/lib/money';
import type { ClientCategory, ClientMenuItem } from './types';

const CHIP =
  'flex-none cursor-pointer whitespace-nowrap rounded-full border-[1.5px] border-[var(--border)] bg-white px-[18px] py-[9px] font-[family-name:var(--font-body)] text-base font-bold leading-normal text-espresso hover:border-espresso aria-pressed:border-espresso aria-pressed:bg-espresso aria-pressed:text-white';

export function MenuBrowser({ categories, items, bestsellerIds, maxQty, initialItem }: { categories: ClientCategory[]; items: ClientMenuItem[]; bestsellerIds: number[]; maxQty: number; initialItem?: string | null }) {
  const [cat, setCat] = useState<number | 'all'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<ClientMenuItem | null>(null);
  const { count, estimatePesewas, ready } = useCart();

  useEffect(() => {
    if (initialItem) {
      const it = items.find((i) => i.slug === initialItem);
      if (it) setOpen(it);
    }
  }, [initialItem, items]);

  // links like /menu#cat-5 open that category
  useEffect(() => {
    const m = /^#cat-(\d+)$/.exec(window.location.hash);
    if (m && categories.some((c) => c.id === Number(m[1]))) setCat(Number(m[1]));
  }, [categories]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rank = new Map(categories.map((c, n) => [c.id, n]));
    return items
      .filter((i) => (cat === 'all' || i.categoryId === cat) && (!needle || i.name.toLowerCase().includes(needle) || i.description.toLowerCase().includes(needle)))
      .map((i, n) => ({ i, n }))
      .sort((a, b) => (rank.get(a.i.categoryId) ?? 99) - (rank.get(b.i.categoryId) ?? 99) || a.n - b.n)
      .map((x) => x.i);
  }, [items, q, cat, categories]);

  const best = new Set(bestsellerIds);

  return (
    <>
      <div className="flex flex-col flex-wrap items-center gap-3.5 pt-[clamp(64px,9vw,112px)]">
        <label className="relative w-full max-w-[560px] flex-none">
          <span className="sr-only">Search the menu</span>
          <span className="absolute left-[13px] top-[13px] text-muted">
            <Icon name="search" size={18} />
          </span>
          <input className="input bg-white pl-10" type="search" placeholder="Search dishes and drinks" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {items.length > 0 && (
        <nav className="sticky top-[65px] z-20 mx-[calc(clamp(20px,5vw,80px)*-1)] mt-[clamp(28px,4vw,44px)] border-b border-[var(--border)] bg-[rgba(247,242,233,0.96)] px-[clamp(20px,5vw,80px)] py-2.5 backdrop-blur-sm" aria-label="Menu categories">
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto [scrollbar-width:none] [justify-content:safe_center]">
            <button type="button" className={CHIP} aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
              All
            </button>
            {categories.map((c) => (
              <button key={c.id} type="button" className={CHIP} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        </nav>
      )}

      <p className="sr-only" aria-live="polite">
        {filtered.length} dishes shown
      </p>
      {items.length === 0 ? (
        <div className="empty panel">
          <h3>The menu is being prepared</h3>
          <p>Check back soon — we haven’t published any dishes yet.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <h3>No dishes match</h3>
          <p>Try a different search or category.</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setQ('');
              setCat('all');
            }}
          >
            Show everything
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] items-stretch gap-6 pt-[clamp(40px,6vw,72px)] max-[780px]:gap-4">
          {filtered.map((i) => (
            <DishCard key={i.id} item={i} onOpen={setOpen} best={best.has(i.id)} />
          ))}
        </div>
      )}
      <ItemSheet item={open} onClose={() => setOpen(null)} maxQty={maxQty} />
      {ready && count > 0 && (
        <div className="fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-[25] hidden max-[860px]:block">
          <Link href="/checkout" className="btn primary lg block">
            <Icon name="cart" /> View order ({count}), {formatGHS(estimatePesewas)}
          </Link>
        </div>
      )}
    </>
  );
}
