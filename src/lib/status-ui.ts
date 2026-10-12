import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  KITCHEN_STATUS_LABELS,
  FULFILLMENT_STATUS_LABELS,
  type OrderStatus,
  type PaymentStatus,
  type KitchenStatus,
} from './states';

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

export function orderTone(s: string): Tone {
  return ({ pending_payment: 'warn', placed: 'info', in_progress: 'info', completed: 'ok', cancelled: 'neutral' } as Record<string, Tone>)[s] ?? 'neutral';
}
export function paymentTone(s: string): Tone {
  if (['paid', 'cash_collected'].includes(s)) return 'ok';
  if (['failed', 'reconciliation_required'].includes(s)) return 'danger';
  if (['pending', 'cash_due', 'refund_pending', 'unpaid'].includes(s)) return 'warn';
  return 'neutral';
}
export function kitchenTone(s: string): Tone {
  return ({ new: 'info', accepted: 'info', preparing: 'warn', ready: 'ok', handed_off: 'neutral', cancelled: 'neutral', not_sent: 'neutral' } as Record<string, Tone>)[s] ?? 'neutral';
}
export function fulfillmentTone(s: string): Tone {
  if (['delivered', 'collected', 'ready_for_pickup'].includes(s)) return 'ok';
  if (['failed', 'returned'].includes(s)) return 'danger';
  if (['unassigned', 'requested'].includes(s)) return 'warn';
  if (s === 'cancelled' || s === 'pending') return 'neutral';
  return 'info';
}
export const labelOrder = (s: string) => ORDER_STATUS_LABELS[s as OrderStatus] ?? s;
export const labelPayment = (s: string) => PAYMENT_STATUS_LABELS[s as PaymentStatus] ?? s;
export const labelKitchen = (s: string) => KITCHEN_STATUS_LABELS[s as KitchenStatus] ?? s;
export const labelFulfillment = (s: string) => FULFILLMENT_STATUS_LABELS[s] ?? s;
