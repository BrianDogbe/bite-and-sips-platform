'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Client-side cart. Persisted in localStorage purely as a convenience between page views —
 * it is NOT authoritative: prices shown here are estimates and every total is recomputed by
 * the server (/api/quote, /api/orders) from database prices.
 */
export interface CartLine {
  key: string;
  menuItemId: number;
  variantId: number | null;
  modifierIds: number[];
  quantity: number;
  instructions: string | null;
  // display snapshot (estimate only)
  name: string;
  variantName: string | null;
  modifierNames: string[];
  unitPricePesewas: number;
  imageUrl: string | null;
}

interface CartCtx {
  lines: CartLine[];
  count: number;
  estimatePesewas: number;
  ready: boolean;
  add(line: Omit<CartLine, 'key'>): void;
  update(key: string, patch: Partial<Pick<CartLine, 'quantity' | 'instructions' | 'variantId' | 'modifierIds' | 'variantName' | 'modifierNames' | 'unitPricePesewas'>>): void;
  remove(key: string): void;
  clear(): void;
  replaceAll(lines: Omit<CartLine, 'key'>[]): void;
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = 'bs_cart_v1';

function lineKey(l: Pick<CartLine, 'menuItemId' | 'variantId' | 'modifierIds' | 'instructions'>) {
  return [l.menuItemId, l.variantId ?? 0, [...l.modifierIds].sort((a, b) => a - b).join('.'), (l.instructions ?? '').trim().toLowerCase()].join('|');
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartLine[];
        if (Array.isArray(parsed)) setLines(parsed.filter((l) => l && typeof l.menuItemId === 'number' && l.quantity > 0).slice(0, 30));
      }
    } catch {
      /* storage unavailable — cart stays in memory */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [lines, ready]);

  const add = useCallback((l: Omit<CartLine, 'key'>) => {
    setLines((prev) => {
      const key = lineKey(l);
      const existing = prev.find((p) => p.key === key);
      if (existing) return prev.map((p) => (p.key === key ? { ...p, quantity: Math.min(50, p.quantity + l.quantity) } : p));
      return [...prev, { ...l, key }].slice(0, 30);
    });
  }, []);
  const update = useCallback<CartCtx['update']>((key, patch) => {
    setLines((prev) =>
      prev
        .map((p) => {
          if (p.key !== key) return p;
          const next = { ...p, ...patch };
          return { ...next, key: lineKey(next) };
        })
        .filter((p) => p.quantity > 0),
    );
  }, []);
  const remove = useCallback((key: string) => setLines((prev) => prev.filter((p) => p.key !== key)), []);
  const clear = useCallback(() => setLines([]), []);
  const replaceAll = useCallback((ls: Omit<CartLine, 'key'>[]) => setLines(ls.map((l) => ({ ...l, key: lineKey(l) }))), []);

  const value = useMemo<CartCtx>(
    () => ({
      lines,
      ready,
      count: lines.reduce((s, l) => s + l.quantity, 0),
      estimatePesewas: lines.reduce((s, l) => s + l.unitPricePesewas * l.quantity, 0),
      add,
      update,
      remove,
      clear,
      replaceAll,
    }),
    [lines, ready, add, update, remove, clear, replaceAll],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be used inside CartProvider');
  return c;
}

/** Stable random key for an idempotent checkout attempt. */
export function newIdempotencyKey() {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
