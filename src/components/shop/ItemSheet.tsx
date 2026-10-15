'use client';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatGHS } from '@/lib/money';
import { useCart } from '@/lib/cart';
import { Icon } from '../Icon';
import { DIALOG, OPTGROUP, OPT_LEGEND, OPT, QTY, QTY_BTN, QTY_OUT, PRICE } from '../ui';
import { tagLabel } from './DishCard';
import type { ClientMenuItem } from './types';

/**
 * Meal customisation sheet. Validates option rules in the browser for quick feedback; the server
 * re-validates every choice and price when the order is placed.
 */
export interface SheetInitial {
  variantId: number | null;
  modifierIds: number[];
  quantity: number;
  instructions: string | null;
}

export function ItemSheet({
  item,
  onClose,
  maxQty = 20,
  initial,
  onReplace,
}: {
  item: ClientMenuItem | null;
  onClose: () => void;
  maxQty?: number;
  /** Edit mode: pre-fill selections and call onReplace instead of adding a new line. */
  initial?: SheetInitial | null;
  onReplace?: (line: Parameters<ReturnType<typeof useCart>['add']>[0]) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { add } = useCart();
  const [variantId, setVariantId] = useState<number | null>(null);
  const [mods, setMods] = useState<Set<number>>(new Set());
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (item) {
      const def = item.variants.find((v) => v.isDefault && v.isAvailable) ?? item.variants.find((v) => v.isAvailable) ?? null;
      setVariantId(initial ? initial.variantId : def?.id ?? null);
      setMods(new Set(initial?.modifierIds ?? []));
      setQty(initial?.quantity ?? 1);
      setNote(initial?.instructions ?? '');
      setTried(false);
      setAdded(false);
      if (!d.open) d.showModal();
    } else if (d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const groupErrors = useMemo(() => {
    if (!item) return {} as Record<number, string>;
    const errs: Record<number, string> = {};
    for (const g of item.modifierGroups) {
      const n = g.modifiers.filter((m) => mods.has(m.id)).length;
      if (n < g.minSelect) errs[g.id] = g.minSelect === 1 ? 'Choose one' : `Choose at least ${g.minSelect}`;
    }
    return errs;
  }, [item, mods]);

  if (!item) return <dialog ref={ref} className={DIALOG} onClose={onClose} />;

  const variant = item.variants.find((v) => v.id === variantId) ?? null;
  const base = item.variants.length ? variant?.pricePesewas ?? 0 : item.basePricePesewas;
  const chosen = item.modifierGroups.flatMap((g) => g.modifiers.filter((m) => mods.has(m.id)));
  const unit = base + chosen.reduce((s, m) => s + m.pricePesewas, 0);
  const needsVariant = item.variants.length > 0 && !variant;
  const invalid = needsVariant || Object.keys(groupErrors).length > 0;

  function toggle(groupId: number, modId: number) {
    const g = item!.modifierGroups.find((x) => x.id === groupId)!;
    setMods((prev) => {
      const next = new Set(prev);
      if (g.maxSelect === 1) {
        for (const m of g.modifiers) next.delete(m.id);
        next.add(modId);
        return next;
      }
      if (next.has(modId)) next.delete(modId);
      else {
        const count = g.modifiers.filter((m) => next.has(m.id)).length;
        if (count >= g.maxSelect) return prev;
        next.add(modId);
      }
      return next;
    });
  }

  function submit() {
    setTried(true);
    if (invalid || !item!.orderable) return;
    const line = {
      menuItemId: item!.id,
      variantId: variant?.id ?? null,
      modifierIds: [...mods],
      quantity: qty,
      instructions: note.trim() || null,
      name: item!.name,
      variantName: variant?.name ?? null,
      modifierNames: chosen.map((m) => m.name),
      unitPricePesewas: unit,
      imageUrl: item!.imageUrl,
    };
    if (onReplace) onReplace(line);
    else add(line);
    setAdded(true);
    setTimeout(() => ref.current?.close(), 450);
  }

  return (
    <dialog ref={ref} className={DIALOG} onClose={onClose} aria-labelledby="sheet-title" onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <div className="flex max-h-[inherit] flex-col" style={{ position: 'relative' }}>
        <button type="button" className="absolute right-3 top-3 z-[2] grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-[rgba(255,255,255,0.92)]" onClick={() => ref.current?.close()} aria-label="Close">
          <Icon name="x" />
        </button>
        <div className="overflow-y-auto px-5 pb-4 pt-0">
          {item.imageUrl ? (
            <div className="-mx-5 mb-4 aspect-video overflow-hidden bg-ivory-2" style={{ position: 'relative' }}>
              <Image src={item.imageUrl} alt={item.imageAlt ?? ''} fill sizes="560px" className="object-cover" />
            </div>
          ) : (
            <div style={{ height: 56 }} />
          )}
          <h2 id="sheet-title" style={{ marginBottom: 6 }}>
            {item.name}
          </h2>
          {item.description && <p className="muted">{item.description}</p>}
          {item.dietaryTags.length > 0 && (
            <p className="row" style={{ gap: 6 }}>
              {item.dietaryTags.map((t) => (
                <span key={t} className="rounded-full bg-ivory-2 px-2 py-px text-[0.78rem] font-bold text-espresso">
                  {tagLabel(t)}
                </span>
              ))}
            </p>
          )}
          {item.allergensVerified && item.allergens.length > 0 && (
            <p className="alert warn small">
              <strong>Allergens:</strong> {item.allergens.join(', ')}
            </p>
          )}
          {!item.allergensVerified && <p className="hint">Allergy information hasn’t been confirmed for this dish. Ask us before ordering if you have an allergy.</p>}
          {!item.orderable && <p className="alert error">This dish is {item.unavailableReason ?? 'unavailable'} right now.</p>}

          {item.variants.length > 0 && (
            <fieldset className={OPTGROUP}>
              <legend className={OPT_LEGEND}>
                Size <span className="hint">Required</span>
              </legend>
              {item.variants.map((v) => (
                <label key={v.id} className={OPT}>
                  <input type="radio" name="variant" checked={variantId === v.id} disabled={!v.isAvailable} onChange={() => setVariantId(v.id)} />
                  <span className="grow">
                    {v.name}
                    {!v.isAvailable && ' (sold out)'}
                  </span>
                  <span className={PRICE}>{formatGHS(v.pricePesewas)}</span>
                </label>
              ))}
            </fieldset>
          )}

          {item.modifierGroups.filter((g) => !(g.minSelect === 0 && /^extras?$/i.test(g.name.trim()))).map((g) => {
            const single = g.maxSelect === 1;
            const count = g.modifiers.filter((m) => mods.has(m.id)).length;
            const rule = g.minSelect > 0 ? (single ? 'Required' : `Choose ${g.minSelect}–${g.maxSelect}`) : single ? 'Optional' : `Up to ${g.maxSelect}`;
            return (
              <fieldset key={g.id} className={OPTGROUP} aria-describedby={tried && groupErrors[g.id] ? `ge-${g.id}` : undefined}>
                <legend className={OPT_LEGEND}>
                  {g.name} <span className="hint">{rule}</span>
                </legend>
                {g.modifiers.map((m) => (
                  <label key={m.id} className={OPT}>
                    <input
                      type={single ? 'radio' : 'checkbox'}
                      name={`g-${g.id}`}
                      checked={mods.has(m.id)}
                      disabled={!m.isAvailable || (!single && !mods.has(m.id) && count >= g.maxSelect)}
                      onChange={() => (single || !mods.has(m.id) ? toggle(g.id, m.id) : setMods((p) => new Set([...p].filter((x) => x !== m.id))))}
                    />
                    <span className="grow">
                      {m.name}
                      {!m.isAvailable && ' (unavailable)'}
                    </span>
                    {m.pricePesewas > 0 && <span className={PRICE}>+{formatGHS(m.pricePesewas)}</span>}
                  </label>
                ))}
                {tried && groupErrors[g.id] && (
                  <p id={`ge-${g.id}`} className="field-error">
                    {groupErrors[g.id]}
                  </p>
                )}
              </fieldset>
            );
          })}

          <div className="field" style={{ marginTop: 18 }}>
            <label htmlFor="item-note">Extras or special instructions</label>
            <textarea id="item-note" className="textarea" maxLength={200} placeholder="e.g. extra sauce, less pepper, no onions" value={note} onChange={(e) => setNote(e.target.value)} />
            <span className="hint">{200 - note.length} characters left</span>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-line px-5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3.5">
          <div className={QTY} role="group" aria-label="Quantity">
            <button type="button" className={QTY_BTN} onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">
              <Icon name="minus" size={18} />
            </button>
            <output className={QTY_OUT} aria-live="polite">{qty}</output>
            <button type="button" className={QTY_BTN} onClick={() => setQty((q) => Math.min(maxQty, q + 1))} aria-label="Increase quantity">
              <Icon name="plus" size={18} />
            </button>
          </div>
          <button type="button" className="btn primary lg grow" onClick={submit} disabled={!item.orderable}>
            {added ? (
              <>
                <Icon name="check" /> {onReplace ? 'Updated' : 'Added'}
              </>
            ) : (
              <>{onReplace ? 'Update' : 'Add'} for {formatGHS(unit * qty)}</>
            )}
          </button>
        </div>
        {tried && invalid && (
          <p className="field-error" role="alert" style={{ padding: '0 20px 12px' }}>
            Please complete the required choices above.
          </p>
        )}
      </div>
    </dialog>
  );
}
