'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/server/auth/current';
import { runAction, str, bool } from '@/server/action';
import { createStockItem, recordMovement } from '@/server/inventory';
import { parseCedisToPesewas } from '@/lib/money';
import { invalid } from '@/server/errors';
import { sql } from '@/server/db';
import { requirePerm } from '@/server/auth/guard';
import type { ActionResult } from '@/lib/action-result';

const num = (fd: FormData, k: string) => {
  const v = Number(str(fd, k));
  return Number.isFinite(v) ? v : NaN;
};

export async function createStockAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const cost = str(fd, 'cost') ? parseCedisToPesewas(str(fd, 'cost')) : null;
    await createStockItem(await getCurrentUser(), {
      name: str(fd, 'name'),
      unit: str(fd, 'unit'),
      reorderLevel: num(fd, 'reorderLevel') || 0,
      costPerUnitPesewas: cost,
      supplierId: str(fd, 'supplierId') ? Number(str(fd, 'supplierId')) : null,
      allowNegative: bool(fd, 'allowNegative'),
    });
    revalidatePath('/admin/inventory');
  }, 'Stock item added.');
}

export async function movementAction(stockItemId: number, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const kind = str(fd, 'kind') as 'receipt' | 'adjustment' | 'wastage' | 'count' | 'sale_reversal';
    if (!['receipt', 'adjustment', 'wastage', 'count', 'sale_reversal'].includes(kind)) throw invalid('Choose a movement type.');
    const qty = num(fd, 'quantity');
    if (!Number.isFinite(qty)) throw invalid('Enter a quantity.');
    const cost = str(fd, 'cost') ? parseCedisToPesewas(str(fd, 'cost')) : null;
    await recordMovement(await getCurrentUser(), {
      stockItemId,
      kind,
      delta: kind === 'count' ? undefined : kind === 'wastage' ? -Math.abs(qty) : kind === 'adjustment' ? qty : Math.abs(qty),
      countedQuantity: kind === 'count' ? qty : undefined,
      reason: str(fd, 'reason') || null,
      unitCostPesewas: cost,
      supplierId: str(fd, 'supplierId') ? Number(str(fd, 'supplierId')) : null,
    });
    revalidatePath('/admin/inventory');
    revalidatePath(`/admin/inventory/${stockItemId}`);
  }, 'Recorded.');
}

export async function supplierAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    requirePerm(await getCurrentUser(), 'inventory.manage');
    if (!str(fd, 'name')) throw invalid('Supplier name is required.');
    await sql`insert into suppliers (name, phone, email, notes) values (${str(fd, 'name')}, ${str(fd, 'phone') || null}, ${str(fd, 'email') || null}, ${str(fd, 'notes') || null})`;
    revalidatePath('/admin/inventory');
  }, 'Supplier added.');
}
