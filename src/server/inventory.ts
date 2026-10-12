import 'server-only';
import { sql, tx, type Db } from './db';
import { conflict, invalid, notFound } from './errors';
import { audit, type Actor } from './audit';
import { requirePerm } from './auth/guard';
import type { SessionUser } from './auth/sessions';

/**
 * Inventory foundation. Quantities are RECORDED (system) quantities derived from movements;
 * they are estimates until reconciled with a physical count (kind = 'count').
 * Every change is a movement row; the item quantity is updated in the same transaction
 * under a row lock so concurrent orders cannot corrupt stock.
 */

export const UNITS = ['g', 'kg', 'ml', 'l', 'pcs', 'pack', 'crate', 'bag'] as const;
export type MovementKind = 'receipt' | 'adjustment' | 'wastage' | 'sale' | 'sale_reversal' | 'count';

export interface StockItem {
  id: number;
  name: string;
  unit: (typeof UNITS)[number];
  quantity: string; // NUMERIC as string
  reorderLevel: string;
  costPerUnitPesewas: number | null;
  supplierId: number | null;
  supplierName?: string | null;
  allowNegative: boolean;
  isActive: boolean;
  lastCountedAt: Date | null;
}

export async function listStock(db: Db = sql) {
  return db<(StockItem & { isLow: boolean })[]>`
    select s.*, sp.name as supplier_name, (s.quantity <= s.reorder_level) as is_low
    from stock_items s left join suppliers sp on sp.id = s.supplier_id
    where s.is_active order by (s.quantity <= s.reorder_level) desc, s.name`;
}

export async function lowStock(db: Db = sql) {
  return db<{ id: number; name: string; quantity: string; reorderLevel: string; unit: string }[]>`
    select id, name, quantity, reorder_level, unit from stock_items
    where is_active and quantity <= reorder_level order by name`;
}

export async function createStockItem(
  user: SessionUser | null,
  input: { name: string; unit: string; reorderLevel: number; costPerUnitPesewas?: number | null; supplierId?: number | null; allowNegative?: boolean },
  db: Db = sql,
) {
  requirePerm(user, 'inventory.manage');
  if (!UNITS.includes(input.unit as never)) throw invalid('Unknown unit.');
  if (!input.name.trim()) throw invalid('Name is required.');
  if (!(input.reorderLevel >= 0)) throw invalid('Reorder level must be zero or more.');
  return tx(async (t) => {
    const [row] = await t<{ id: number }[]>`
      insert into stock_items (name, unit, reorder_level, cost_per_unit_pesewas, supplier_id, allow_negative)
      values (${input.name.trim()}, ${input.unit}, ${input.reorderLevel}, ${input.costPerUnitPesewas ?? null}, ${input.supplierId ?? null}, ${input.allowNegative ?? false})
      returning id`;
    await audit(t, { userId: user!.id, label: 'staff' }, 'inventory.item_created', 'stock_item', row.id, { name: input.name });
    return row.id;
  }, db);
}

/**
 * Apply a stock movement. `delta` is signed (receipts positive, wastage negative, …).
 * For kind 'count', pass the counted quantity as `countedQuantity` instead of delta.
 */
export async function applyMovement(
  t: Db,
  actor: Actor,
  m: {
    stockItemId: number;
    kind: MovementKind;
    delta?: number;
    countedQuantity?: number;
    reason?: string | null;
    orderId?: string | null;
    unitCostPesewas?: number | null;
    supplierId?: number | null;
    allowNegativeOverride?: boolean;
  },
) {
  const rows = await t<{ id: number; name: string; quantity: string; allowNegative: boolean }[]>`
    select id, name, quantity, allow_negative from stock_items where id = ${m.stockItemId} for update`;
  const item = rows[0];
  if (!item) throw notFound('Stock item');
  const current = Number(item.quantity);
  let delta: number;
  if (m.kind === 'count') {
    if (m.countedQuantity == null || !(m.countedQuantity >= 0)) throw invalid('Counted quantity must be zero or more.');
    delta = round3(m.countedQuantity - current);
  } else {
    if (m.delta == null || !Number.isFinite(m.delta) || m.delta === 0) throw invalid('Quantity must be a non-zero number.');
    delta = round3(m.delta);
    if ((m.kind === 'receipt' || m.kind === 'sale_reversal') && delta < 0) throw invalid('Receipts must be positive.');
    if ((m.kind === 'wastage' || m.kind === 'sale') && delta > 0) throw invalid('Wastage/sales reduce stock.');
  }
  const after = round3(current + delta);
  if (after < 0 && !item.allowNegative && !m.allowNegativeOverride) {
    throw conflict(`Not enough recorded stock of ${item.name} (recorded ${current}).`, { code: 'insufficient_stock', stockItemId: item.id });
  }
  await t`
    update stock_items set quantity = ${after}, updated_at = now(),
      last_counted_at = case when ${m.kind} = 'count' then now() else last_counted_at end,
      cost_per_unit_pesewas = coalesce(${m.kind === 'receipt' ? (m.unitCostPesewas ?? null) : null}, cost_per_unit_pesewas)
    where id = ${item.id}`;
  await t`
    insert into stock_movements (stock_item_id, kind, quantity_delta, quantity_after, unit_cost_pesewas, reason, order_id, supplier_id, created_by)
    values (${item.id}, ${m.kind}, ${delta}, ${after}, ${m.unitCostPesewas ?? null}, ${m.reason ?? null}, ${m.orderId ?? null}, ${m.supplierId ?? null}, ${actor.userId})`;
  return { quantityAfter: after, delta };
}

export async function recordMovement(
  user: SessionUser | null,
  m: Parameters<typeof applyMovement>[2],
  db: Db = sql,
) {
  requirePerm(user, 'inventory.manage');
  if (m.kind === 'sale') throw invalid('Sales are recorded automatically from orders.');
  if (m.kind !== 'receipt' && m.kind !== 'count' && !m.reason?.trim()) throw invalid('Please give a reason.');
  return tx(async (t) => {
    const actor = { userId: user!.id, label: 'staff' };
    const r = await applyMovement(t, actor, m);
    await audit(t, actor, `inventory.${m.kind}`, 'stock_item', m.stockItemId, { delta: r.delta, after: r.quantityAfter, reason: m.reason ?? null });
    return r;
  }, db);
}

/**
 * Deduct recipe ingredients for an order. Called inside the kitchen "start preparing" transaction
 * when automatic deduction is enabled. Ingredients without enough recorded stock are deducted
 * anyway (food is physically being made) but the order is not blocked; a low/negative stock alert
 * appears for reconciliation. Items with allow_negative=false are clamped at zero and the
 * shortfall is noted in the movement reason.
 */
export async function deductForOrder(t: Db, orderId: string, actor: Actor): Promise<{ lines: number; shortfalls: string[] }> {
  const already = await t<{ stockDeducted: boolean }[]>`select stock_deducted from orders where id = ${orderId} for update`;
  if (!already[0] || already[0].stockDeducted) return { lines: 0, shortfalls: [] };
  const needs = await t<{ stockItemId: number; qty: string }[]>`
    select r.stock_item_id, sum(r.quantity * oi.quantity) as qty
    from order_items oi
    join recipe_lines r on r.menu_item_id = oi.menu_item_id and (r.variant_id is null or r.variant_id = oi.variant_id)
    where oi.order_id = ${orderId}
    group by r.stock_item_id`;
  const shortfalls: string[] = [];
  for (const n of needs) {
    const want = Number(n.qty);
    const [item] = await t<{ name: string; quantity: string; allowNegative: boolean }[]>`
      select name, quantity, allow_negative from stock_items where id = ${n.stockItemId} for update`;
    const have = Number(item.quantity);
    let delta = -want;
    let reason: string | null = null;
    if (have - want < 0 && !item.allowNegative) {
      delta = -have;
      reason = `Recorded stock insufficient: needed ${want}, had ${have}. Reconcile with a physical count.`;
      shortfalls.push(item.name);
    }
    if (delta !== 0) await applyMovement(t, actor, { stockItemId: n.stockItemId, kind: 'sale', delta, orderId, reason });
    else if (want > 0) {
      shortfalls.push(item.name);
    }
  }
  await t`update orders set stock_deducted = true where id = ${orderId}`;
  return { lines: needs.length, shortfalls };
}

export async function movementsFor(stockItemId: number, db: Db = sql) {
  return db<{ id: string; kind: string; quantityDelta: string; quantityAfter: string; reason: string | null; orderId: string | null; createdAt: Date; byName: string | null }[]>`
    select m.id, m.kind, m.quantity_delta, m.quantity_after, m.reason, m.order_id, m.created_at, u.full_name as by_name
    from stock_movements m left join users u on u.id = m.created_by
    where m.stock_item_id = ${stockItemId} order by m.id desc limit 200`;
}

export async function setRecipe(
  user: SessionUser | null,
  menuItemId: number,
  lines: { stockItemId: number; quantity: number; variantId?: number | null }[],
  db: Db = sql,
) {
  requirePerm(user, 'inventory.manage');
  for (const l of lines) if (!(l.quantity > 0)) throw invalid('Recipe quantities must be greater than zero.');
  return tx(async (t) => {
    await t`delete from recipe_lines where menu_item_id = ${menuItemId}`;
    for (const l of lines) {
      await t`insert into recipe_lines (menu_item_id, variant_id, stock_item_id, quantity) values (${menuItemId}, ${l.variantId ?? null}, ${l.stockItemId}, ${l.quantity})`;
    }
    await audit(t, { userId: user!.id, label: 'staff' }, 'inventory.recipe_set', 'menu_item', menuItemId, { lines });
  }, db);
}

export async function recipeFor(menuItemId: number, db: Db = sql) {
  return db<{ id: number; stockItemId: number; variantId: number | null; quantity: string; name: string; unit: string }[]>`
    select r.id, r.stock_item_id, r.variant_id, r.quantity, s.name, s.unit
    from recipe_lines r join stock_items s on s.id = r.stock_item_id where r.menu_item_id = ${menuItemId} order by s.name`;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
