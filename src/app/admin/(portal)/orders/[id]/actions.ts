'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/server/auth/current';
import { runAction, str, int } from '@/server/action';
import { addInternalNote, staffCancelOrder, recordCashCollected, markPickupCollected, kitchenAction } from '@/server/orders/lifecycle';
import { requestRefund, verifyReference, syncRefund } from '@/server/payments/service';
import { clearOrderAttention } from '@/server/ops';
import { parseCedisToPesewas } from '@/lib/money';
import { invalid } from '@/server/errors';
import { requirePerm, actorOf } from '@/server/auth/guard';
import type { ActionResult } from '@/lib/action-result';

const done = (id: string) => revalidatePath(`/admin/orders/${id}`);

export async function noteAction(id: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await addInternalNote(await getCurrentUser(), id, str(fd, 'note'));
    done(id);
  }, 'Note added.');
}

export async function cancelAction(id: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const r = await staffCancelOrder(await getCurrentUser(), id, str(fd, 'reason'));
    done(id);
    return r.needsRefund ? { refundNeeded: true } : undefined;
  }, 'Order cancelled. If the customer paid, issue the refund below.');
}

export async function refundAction(id: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const amount = parseCedisToPesewas(str(fd, 'amount'));
    if (amount == null || amount <= 0) throw invalid('Enter a valid amount in cedis, e.g. 25.00');
    const r = await requestRefund(await getCurrentUser(), { orderId: id, amountPesewas: amount, reason: str(fd, 'reason'), idempotencyKey: str(fd, 'key') });
    done(id);
    return r;
  }, 'Refund requested. It will show as processed once the payment provider confirms it.');
}

export async function cashAction(id: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const amount = int(fd, 'amount');
    await recordCashCollected(await getCurrentUser(), id, amount ?? NaN);
    done(id);
  }, 'Cash recorded.');
}

export async function collectedAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await markPickupCollected(await getCurrentUser(), id);
    done(id);
  }, 'Marked as collected.');
}

export async function kitchenAdminAction(id: string, action: 'accept' | 'start' | 'ready' | 'recall'): Promise<ActionResult> {
  return runAction(async () => {
    await kitchenAction(await getCurrentUser(), id, action);
    done(id);
  }, 'Kitchen status updated.');
}

export async function clearAttentionAction(id: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await clearOrderAttention(await getCurrentUser(), id, str(fd, 'note'));
    done(id);
  }, 'Cleared.');
}

export async function reverifyPaymentAction(id: string, reference: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = requirePerm(await getCurrentUser(), 'payments.view');
    const r = await verifyReference(reference, actorOf(user));
    done(id);
    return r;
  }, 'Checked with the payment provider.');
}

export async function syncRefundAction(id: string, refundId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = requirePerm(await getCurrentUser(), 'payments.refund');
    await syncRefund(refundId, actorOf(user));
    done(id);
  }, 'Refund status checked.');
}
