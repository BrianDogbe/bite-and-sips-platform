'use client';
import { useState, useTransition } from 'react';
import { saveRecipeAction } from '@/app/admin/(portal)/menu/actions';

interface Line {
  stockItemId: number;
  variantId: number | null;
  quantity: number;
}

export function RecipeEditor({ menuItemId, variants, stock, initial }: { menuItemId: number; variants: { id: number; name: string }[]; stock: { id: number; name: string; unit: string }[]; initial: Line[] }) {
  const [lines, setLines] = useState<Line[]>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!stock.length) return <p className="dsp-empty">Add stock items in Inventory first.</p>;
  return (
    <div className="ie-rows">
      {lines.map((l, i) => (
        <div key={i} className="ie-row ie-recipe">
          <select className="select" value={l.stockItemId} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, stockItemId: Number(e.target.value) } : x)))} aria-label="Ingredient">
            {stock.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.unit})
              </option>
            ))}
          </select>
          <input className="input" type="number" step="0.001" min="0" value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))} aria-label="Quantity per portion" />
          {variants.length > 0 && (
            <select className="select" value={l.variantId ?? ''} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, variantId: e.target.value ? Number(e.target.value) : null } : x)))} aria-label="Applies to size">
              <option value="">All sizes</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} only
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn sm ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn sm" onClick={() => setLines((ls) => [...ls, { stockItemId: stock[0].id, variantId: null, quantity: 1 }])}>
          Add ingredient
        </button>
        <button
          type="button"
          className="btn sm leaf"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveRecipeAction(menuItemId, lines);
              setMsg(r.ok ? { ok: true, text: r.message ?? 'Saved' } : { ok: false, text: r.error });
            })
          }
        >
          Save recipe
        </button>
      </div>
      {msg && <p className={`small`} style={{ color: msg.ok ? 'var(--ok)' : 'var(--danger)', fontWeight: 700 }} role="status">{msg.text}</p>}
    </div>
  );
}
