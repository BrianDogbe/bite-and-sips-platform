/**
 * State models. Order lifecycle, payment, kitchen and fulfillment are tracked separately:
 * a paid order can still be waiting for the kitchen, a ready order can still be waiting for a
 * rider, and a delivery can fail after the food was prepared.
 *
 * These tables are the single source of truth for which transitions are legal; the server
 * services enforce them (and use optimistic version checks to stop concurrent conflicts).
 * Safe to import on client and server (labels are used by the UI).
 */

export const ORDER_STATUSES = ['pending_payment', 'placed', 'in_progress', 'completed', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'unpaid',
  'pending',
  'paid',
  'failed',
  'cash_due',
  'cash_collected',
  'refund_pending',
  'partially_refunded',
  'refunded',
  'reconciliation_required',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const KITCHEN_STATUSES = ['not_sent', 'new', 'accepted', 'preparing', 'ready', 'handed_off', 'cancelled'] as const;
export type KitchenStatus = (typeof KITCHEN_STATUSES)[number];

export const PICKUP_STATUSES = ['pending', 'ready_for_pickup', 'collected', 'cancelled'] as const;
export const DELIVERY_STATUSES = [
  'pending', // waiting for payment / kitchen — not yet in dispatch
  'unassigned', // in dispatch, no rider / provider yet
  'requested', // third-party booking requested, awaiting provider acceptance
  'assigned', // offered to an in-house rider / provider courier assigned
  'accepted', // rider accepted
  'at_restaurant',
  'picked_up',
  'on_the_way',
  'arrived',
  'delivered',
  'failed',
  'returned',
  'cancelled',
] as const;
export type PickupStatus = (typeof PICKUP_STATUSES)[number];
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export type FulfillmentStatus = PickupStatus | DeliveryStatus;

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['placed', 'cancelled'],
  placed: ['in_progress', 'cancelled', 'completed'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const KITCHEN_TRANSITIONS: Record<KitchenStatus, KitchenStatus[]> = {
  not_sent: ['new', 'accepted', 'cancelled'],
  new: ['accepted', 'preparing', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['handed_off', 'preparing', 'cancelled'], // ready -> preparing = "recall" (e.g. item remade)
  handed_off: [],
  cancelled: [],
};

export const PICKUP_TRANSITIONS: Record<PickupStatus, PickupStatus[]> = {
  pending: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['collected', 'pending', 'cancelled'],
  collected: [],
  cancelled: [],
};

export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending: ['unassigned', 'cancelled'],
  unassigned: ['assigned', 'requested', 'cancelled'],
  requested: ['assigned', 'unassigned', 'cancelled', 'failed'],
  assigned: ['accepted', 'unassigned', 'picked_up', 'cancelled'],
  accepted: ['at_restaurant', 'picked_up', 'unassigned', 'cancelled'],
  at_restaurant: ['picked_up', 'unassigned', 'cancelled'],
  picked_up: ['on_the_way', 'arrived', 'delivered', 'failed'],
  on_the_way: ['arrived', 'delivered', 'failed'],
  arrived: ['delivered', 'failed'],
  delivered: [],
  failed: ['returned', 'unassigned', 'delivered'], // reattempt, or delivered after authorised exception
  returned: ['unassigned', 'cancelled'],
  cancelled: [],
};

export function canTransition<S extends string>(table: Record<S, S[]>, from: S, to: S): boolean {
  return (table[from] ?? []).includes(to);
}

export const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = ['assigned', 'accepted', 'at_restaurant', 'picked_up', 'on_the_way', 'arrived'];
/** Rider location may be shown to the customer only in these states. */
export const LOCATION_SHARING_STATUSES: DeliveryStatus[] = ['picked_up', 'on_the_way', 'arrived'];

// ---------------------------------------------------------------------------
// Customer-facing timeline
// ---------------------------------------------------------------------------

export type CustomerStage =
  | 'awaiting_payment'
  | 'received'
  | 'confirmed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'waiting_for_rider'
  | 'rider_assigned'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'attention';

export const CUSTOMER_STAGE_LABELS: Record<CustomerStage, string> = {
  awaiting_payment: 'Awaiting payment',
  received: 'Order received',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready for pickup',
  waiting_for_rider: 'Waiting for a rider',
  rider_assigned: 'Rider assigned',
  picked_up: 'Picked up',
  on_the_way: 'On the way',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  attention: 'Needs attention',
};

export function customerStage(o: {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  kitchenStatus: KitchenStatus;
  fulfillmentType: 'pickup' | 'delivery';
  fulfillmentStatus: FulfillmentStatus;
}): CustomerStage {
  if (o.status === 'cancelled') return 'cancelled';
  if (o.status === 'pending_payment') return 'awaiting_payment';
  if (o.fulfillmentType === 'pickup') {
    if (o.status === 'completed' || o.fulfillmentStatus === 'collected') return 'completed';
    if (o.fulfillmentStatus === 'ready_for_pickup' || o.kitchenStatus === 'ready') return 'ready_for_pickup';
  } else {
    const f = o.fulfillmentStatus as DeliveryStatus;
    if (f === 'delivered' || o.status === 'completed') return 'delivered';
    if (f === 'failed' || f === 'returned') return 'attention';
    if (f === 'on_the_way' || f === 'arrived') return 'on_the_way';
    if (f === 'picked_up') return 'picked_up';
    if (f === 'assigned' || f === 'accepted' || f === 'at_restaurant') {
      return o.kitchenStatus === 'preparing' || o.kitchenStatus === 'new' || o.kitchenStatus === 'accepted' ? 'preparing' : 'rider_assigned';
    }
    if (o.kitchenStatus === 'ready') return 'waiting_for_rider';
  }
  if (o.kitchenStatus === 'preparing') return 'preparing';
  if (o.kitchenStatus === 'accepted') return 'confirmed';
  return 'received';
}

export function customerTimeline(fulfillmentType: 'pickup' | 'delivery', paymentMethod: 'online' | 'cash'): CustomerStage[] {
  const head: CustomerStage[] = paymentMethod === 'online' ? ['awaiting_payment', 'received'] : ['received'];
  return fulfillmentType === 'pickup'
    ? [...head, 'confirmed', 'preparing', 'ready_for_pickup', 'completed']
    : [...head, 'confirmed', 'preparing', 'rider_assigned', 'picked_up', 'on_the_way', 'delivered'];
}

// ---------------------------------------------------------------------------
// Staff labels
// ---------------------------------------------------------------------------
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  placed: 'Placed',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  pending: 'Payment pending',
  paid: 'Paid',
  failed: 'Payment failed',
  cash_due: 'Cash due',
  cash_collected: 'Cash collected',
  refund_pending: 'Refund pending',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
  reconciliation_required: 'Needs reconciliation',
};
export const KITCHEN_STATUS_LABELS: Record<KitchenStatus, string> = {
  not_sent: 'Not sent',
  new: 'New',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  handed_off: 'Handed off',
  cancelled: 'Cancelled',
};
export const FULFILLMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  ready_for_pickup: 'Ready for pickup',
  collected: 'Collected',
  unassigned: 'Awaiting assignment',
  requested: 'Requested from partner',
  assigned: 'Assigned',
  accepted: 'Rider accepted',
  at_restaurant: 'Rider at restaurant',
  picked_up: 'Picked up',
  on_the_way: 'On the way',
  arrived: 'Arrived',
  delivered: 'Delivered',
  failed: 'Delivery failed',
  returned: 'Returned',
  cancelled: 'Cancelled',
};
