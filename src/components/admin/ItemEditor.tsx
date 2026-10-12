'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { parseCedisToPesewas, pesewasToCedisString } from '@/lib/money';
import { saveItemAction } from '@/app/admin/(portal)/menu/actions';
import type { MenuItem } from '@/server/menu';

type Money = string; // cedis as typed
interface V {
  id?: number;
  name: string;
  price: Money;
  isDefault: boolean;
  isAvailable: boolean;
}
interface M {
  id?: number;
  name: string;
  price: Money;
  isAvailable: boolean;
}
interface G {
  id?: number;
  name: string;
  minSelect: number;
  maxSelect: number;
  modifiers: M[];
}
const TAGS = [
  ['vegetarian', 'Vegetarian'],
  ['vegan', 'Vegan'],
  ['spicy', 'Spicy'],
  ['gluten_free', 'Gluten-free'],
  ['halal', 'Halal'],
] as const;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const c = (p: number) => pesewasToCedisString(p);

export function ItemEditor({ categories, item }: { categories: { id: number; name: string }[]; item: MenuItem | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [s, setS] = useState({
    categoryId: item?.categoryId ?? categories[0]?.id,
    name: item?.name ?? '',
    description: item?.description ?? '',
    imageUrl: item?.imageUrl ?? '',
    imageAlt: item?.imageAlt ?? '',
    basePrice: item ? c(item.basePricePesewas) : '',
    prepMinutes: item?.prepMinutes ?? 15,
    isAvailable: item?.isAvailable ?? true,
    isFeatured: item?.isFeatured ?? false,
    dietaryTags: item?.dietaryTags ?? [],
    allergens: (item?.allergens ?? []).join(', '),
    allergensVerified: item?.allergensVerified ?? false,
    availableDays: item?.availableDays ?? [],
    availableFrom: item?.availableFrom ?? '',
    availableUntil: item?.availableUntil ?? '',
    sortOrder: item?.sortOrder ?? 0,
  });
  const [variants, setVariants] = useState<V[]>((item?.variants ?? []).map((v) => ({ id: v.id, name: v.name, price: c(v.pricePesewas), isDefault: v.isDefault, isAvailable: v.isAvailable })));
  const [groups, setGroups] = useState<G[]>(
    (item?.modifierGroups ?? []).map((g) => ({ id: g.id, name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect, modifiers: g.modifiers.map((m) => ({ id: m.id, name: m.name, price: c(m.pricePesewas), isAvailable: m.isAvailable })) })),
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const r = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? 'Upload failed');
      setS((p) => ({ ...p, imageUrl: j.url }));
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setUploading(false);
    }
  }

  function save() {
    setMsg(null);
    const bad: string[] = [];
    const money = (v: string, label: string) => {
      const p = parseCedisToPesewas(v || '0');
      if (p == null) bad.push(`${label}: enter an amount like 45.00`);
      return p ?? 0;
    };
    const payload = {
      id: item?.id,
      categoryId: s.categoryId,
      name: s.name,
      description: s.description,
      imageUrl: s.imageUrl || null,
      imageAlt: s.imageAlt || null,
      basePricePesewas: variants.length ? 0 : money(s.basePrice, 'Price'),
      prepMinutes: Number(s.prepMinutes),
      isAvailable: s.isAvailable,
      isFeatured: s.isFeatured,
      dietaryTags: s.dietaryTags,
      allergens: s.allergens.split(',').map((a) => a.trim()).filter(Boolean),
      allergensVerified: s.allergensVerified,
      availableDays: s.availableDays.length ? s.availableDays : null,
      availableFrom: s.availableFrom || null,
      availableUntil: s.availableUntil || null,
      sortOrder: Number(s.sortOrder) || 0,
      variants: variants.map((v) => ({ id: v.id, name: v.name, pricePesewas: money(v.price, `Size ${v.name || ''}`), isDefault: v.isDefault, isAvailable: v.isAvailable })),
      modifierGroups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        minSelect: Number(g.minSelect),
        maxSelect: Number(g.maxSelect),
        modifiers: g.modifiers.map((m) => ({ id: m.id, name: m.name, pricePesewas: money(m.price, `Option ${m.name || ''}`), isAvailable: m.isAvailable })),
      })),
    };
    if (bad.length) {
      setMsg({ ok: false, text: bad.join('. ') });
      return;
    }
    start(async () => {
      const r = await saveItemAction(payload);
      if (!r.ok) {
        const fe = r.fieldErrors ? Object.entries(r.fieldErrors).map(([k, v]) => `${k}: ${(v ?? []).join(', ')}`).join('; ') : '';
        setMsg({ ok: false, text: `${r.error}${fe ? ` (${fe})` : ''}` });
      } else {
        setMsg({ ok: true, text: r.message ?? 'Saved.' });
        if (!item && r.data?.id) router.push(`/admin/menu/${r.data.id}`);
        else router.refresh();
      }
    });
  }

  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((p) => ({ ...p, [k]: v }));

  return (
    <div className="two-col">
      <div className="stack" style={{ ['--stack' as string]: '18px' }}>
        <section className="panel stack">
          <h2 style={{ fontSize: '1.15rem' }}>Details</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="i-name">Name</label>
              <input id="i-name" className="input" value={s.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
            </div>
            <div className="field">
              <label htmlFor="i-cat">Category</label>
              <select id="i-cat" className="select" value={s.categoryId} onChange={(e) => set('categoryId', Number(e.target.value))}>
                {categories.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="i-desc">Description</label>
            <textarea id="i-desc" className="textarea" value={s.description} onChange={(e) => set('description', e.target.value)} maxLength={600} />
          </div>
          <div className="grid-2">
            {variants.length === 0 && (
              <div className="field">
                <label htmlFor="i-price">Price (GH₵)</label>
                <input id="i-price" className="input" inputMode="decimal" value={s.basePrice} onChange={(e) => set('basePrice', e.target.value)} placeholder="45.00" />
              </div>
            )}
            <div className="field">
              <label htmlFor="i-prep">Preparation time (minutes)</label>
              <input id="i-prep" className="input" type="number" min={0} max={240} value={s.prepMinutes} onChange={(e) => set('prepMinutes', Number(e.target.value))} />
              <span className="hint">Used to calculate the earliest pickup time.</span>
            </div>
            <div className="field">
              <label htmlFor="i-sort">Position in category</label>
              <input id="i-sort" className="input" type="number" min={0} value={s.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value))} />
            </div>
          </div>
          <div className="row">
            <label className="check">
              <input type="checkbox" checked={s.isAvailable} onChange={(e) => set('isAvailable', e.target.checked)} /> Available to order
            </label>
            <label className="check">
              <input type="checkbox" checked={s.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} /> Feature on the homepage
            </label>
          </div>
        </section>

        <section className="panel stack">
          <div className="row between">
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Sizes</h2>
            <button type="button" className="btn sm" onClick={() => setVariants((v) => [...v, { name: '', price: '', isDefault: v.length === 0, isAvailable: true }])}>
              Add size
            </button>
          </div>
          <p className="hint" style={{ margin: 0 }}>Optional. With sizes, the customer must pick one and its price replaces the single price.</p>
          {variants.map((v, i) => (
            <div key={i} className="row">
              <input className="input grow" placeholder="Size name, e.g. Large" value={v.name} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Size name" />
              <input className="input" style={{ width: 120 }} placeholder="GH₵" inputMode="decimal" value={v.price} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} aria-label="Size price" />
              <label className="check small">
                <input type="radio" name="defvar" checked={v.isDefault} onChange={() => setVariants((vs) => vs.map((x, j) => ({ ...x, isDefault: j === i })))} /> Default
              </label>
              <label className="check small">
                <input type="checkbox" checked={v.isAvailable} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, isAvailable: e.target.checked } : x)))} /> Available
              </label>
              <button type="button" className="btn sm ghost" onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
        </section>

        <section className="panel stack">
          <div className="row between">
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Options and extras</h2>
            <button type="button" className="btn sm" onClick={() => setGroups((g) => [...g, { name: '', minSelect: 0, maxSelect: 1, modifiers: [{ name: '', price: '0', isAvailable: true }] }])}>
              Add option group
            </button>
          </div>
          <p className="hint" style={{ margin: 0 }}>E.g. “Choose your protein” (min 1, max 1) or “Extras” (min 0, max 3).</p>
          {groups.map((g, gi) => (
            <div key={gi} className="panel tight" style={{ background: 'var(--ivory)' }}>
              <div className="row">
                <input className="input grow" placeholder="Group name" value={g.name} onChange={(e) => setGroups((gs) => gs.map((x, j) => (j === gi ? { ...x, name: e.target.value } : x)))} aria-label="Group name" />
                <label className="small">
                  Min{' '}
                  <input className="input" type="number" min={0} style={{ width: 70 }} value={g.minSelect} onChange={(e) => setGroups((gs) => gs.map((x, j) => (j === gi ? { ...x, minSelect: Number(e.target.value) } : x)))} />
                </label>
                <label className="small">
                  Max{' '}
                  <input className="input" type="number" min={1} style={{ width: 70 }} value={g.maxSelect} onChange={(e) => setGroups((gs) => gs.map((x, j) => (j === gi ? { ...x, maxSelect: Number(e.target.value) } : x)))} />
                </label>
                <button type="button" className="btn sm ghost" onClick={() => setGroups((gs) => gs.filter((_, j) => j !== gi))}>
                  Remove group
                </button>
              </div>
              {g.modifiers.map((m, mi) => (
                <div key={mi} className="row" style={{ marginTop: 8, paddingLeft: 12 }}>
                  <input className="input grow" placeholder="Option name" value={m.name} onChange={(e) => setGroups((gs) => gs.map((x, j) => (j === gi ? { ...x, modifiers: x.modifiers.map((y, k) => (k === mi ? { ...y, name: e.target.value } : y)) } : x)))} aria-label="Option name" />
                  <input className="input" style={{ width: 110 }} placeholder="+GH₵" inputMode="decimal" value={m.price} onChange={(e) => setGroups((gs) => gs.map((x, j) => (j === gi ? { ...x, modifiers: x.modifiers.map((y, k) => (k === mi ? { ...y, price: e.target.value } : y)) } : x)))} aria-label="Extra price" />
                  <label className="check small">
                    <input type="checkbox" checked={m.isAvailable} onChange={(e) => setGroups((gs) => gs.map((x, j) => (j === gi ? { ...x, modifiers: x.modifiers.map((y, k) => (k === mi ? { ...y, isAvailable: e.target.checked } : y)) } : x)))} /> Available
                  </label>
                  <button type="button" className="btn sm ghost" onClick={() => setGroups((gs) => gs.map((x, j) => (j === gi ? { ...x, modifiers: x.modifiers.filter((_, k) => k !== mi) } : x)))}>
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className="linkish" style={{ marginTop: 8, marginLeft: 12 }} onClick={() => setGroups((gs) => gs.map((x, j) => (j === gi ? { ...x, modifiers: [...x.modifiers, { name: '', price: '0', isAvailable: true }] } : x)))}>
                Add option
              </button>
            </div>
          ))}
        </section>
      </div>

      <aside className="stack" style={{ ['--stack' as string]: '18px' }}>
        <section className="panel stack">
          <h2 style={{ fontSize: '1.15rem' }}>Photo</h2>
          {s.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.imageUrl} alt={s.imageAlt || ''} style={{ borderRadius: 10, aspectRatio: '4/3', objectFit: 'cover', width: '100%' }} />
          ) : (
            <p className="muted small">No photo. The menu shows a simple placeholder instead.</p>
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} aria-label="Upload photo" disabled={uploading} />
          {uploading && <p className="small">Uploading…</p>}
          <div className="field">
            <label htmlFor="i-alt">Describe the photo (for screen readers)</label>
            <input id="i-alt" className="input" value={s.imageAlt} onChange={(e) => set('imageAlt', e.target.value)} maxLength={150} />
          </div>
          {s.imageUrl && (
            <button type="button" className="linkish" onClick={() => set('imageUrl', '')}>
              Remove photo
            </button>
          )}
        </section>
        <section className="panel stack">
          <h2 style={{ fontSize: '1.15rem' }}>Dietary and allergens</h2>
          <div className="row">
            {TAGS.map(([k, l]) => (
              <label key={k} className="check small">
                <input type="checkbox" checked={s.dietaryTags.includes(k)} onChange={(e) => set('dietaryTags', e.target.checked ? [...s.dietaryTags, k] : s.dietaryTags.filter((t) => t !== k))} /> {l}
              </label>
            ))}
          </div>
          <div className="field">
            <label htmlFor="i-all">Allergens (comma separated)</label>
            <input id="i-all" className="input" value={s.allergens} onChange={(e) => set('allergens', e.target.value)} placeholder="e.g. peanuts, fish, egg" />
          </div>
          <label className="check small">
            <input type="checkbox" checked={s.allergensVerified} onChange={(e) => set('allergensVerified', e.target.checked)} /> I’ve checked this allergen list with the kitchen (only verified lists are shown to customers)
          </label>
        </section>
        <section className="panel stack">
          <h2 style={{ fontSize: '1.15rem' }}>Serving times (optional)</h2>
          <div className="row">
            {DAYS.map((d, i) => (
              <label key={d} className="check small">
                <input type="checkbox" checked={s.availableDays.includes(i)} onChange={(e) => set('availableDays', e.target.checked ? [...s.availableDays, i] : s.availableDays.filter((x) => x !== i))} /> {d}
              </label>
            ))}
          </div>
          <p className="hint" style={{ margin: 0 }}>Leave all days unticked to serve every day.</p>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="i-from">From</label>
              <input id="i-from" type="time" className="input" value={s.availableFrom} onChange={(e) => set('availableFrom', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="i-until">Until</label>
              <input id="i-until" type="time" className="input" value={s.availableUntil} onChange={(e) => set('availableUntil', e.target.value)} />
            </div>
          </div>
        </section>
        <section className="panel stack" style={{ position: 'sticky', bottom: 12 }}>
          {msg && (
            <p className={`alert ${msg.ok ? 'ok' : 'error'}`} role={msg.ok ? 'status' : 'alert'}>
              {msg.text}
            </p>
          )}
          <button className="btn primary lg block" onClick={save} disabled={pending || uploading}>
            {pending ? 'Saving…' : item ? 'Save changes' : 'Create dish'}
          </button>
        </section>
      </aside>
    </div>
  );
}
