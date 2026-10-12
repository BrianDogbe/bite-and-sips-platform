# Order lifecycle

Source of truth: `src/lib/states.ts` (transition tables) enforced by `src/server/orders/core.ts`.

## Four separate state machines
| Machine | States |
|---|---|
| Order | `pending_payment → placed → in_progress → completed`, or `→ cancelled` |
| Payment | `unpaid → pending → paid` · `failed` (retry allowed) · `cash_due → cash_collected` · `refund_pending → partially_refunded / refunded` · `reconciliation_required` |
| Kitchen | `not_sent → new → accepted → preparing → ready → handed_off` (`ready → preparing` = recall), `→ cancelled` |
| Fulfilment (pickup) | `pending → ready_for_pickup → collected` |
| Fulfilment (delivery) | `pending → unassigned → (requested) → assigned → accepted → at_restaurant → picked_up → on_the_way → arrived → delivered` · `failed → returned / unassigned (reattempt)` |

Customers see a simplified timeline derived from these (`customerStage`).

## Main paths
- **Online:** order created `pending_payment` (kitchen slot reserved, payment window e.g. 20 min) → payment verified with the provider → `placed`, kitchen `new` (or `accepted` if auto-accept), delivery enters dispatch as `unassigned`.
- **Cash (if enabled):** placed immediately with payment `cash_due`. Pickup can't be handed over and delivery can't be completed until cash is recorded.
- **Kitchen:** accept (optional) → start (order `in_progress`, optional recipe stock deduction) → ready (pickup: customer notified).
- **Pickup completion:** staff confirm handoff → order `completed`.
- **Delivery completion:** rider picks up (requires kitchen ready) → kitchen `handed_off` → PIN verified (or authorised dispatcher override with reason) → `completed`.

## Exceptions and recovery
| Situation | Handling |
|---|---|
| Failed payment | Payment `failed`, customer can retry from tracking page until the window ends |
| Pending payment (MoMo prompt open) | Not treated as paid; re-verified before a new attempt; open prompt is resumed rather than creating a second charge |
| Duplicate webhook | Deduped by `webhook_events`; reprocessing is idempotent |
| Webhook missed | Jobs re-verify pending attempts every run; the payment-return page also verifies |
| Amount/currency mismatch | Never marked paid; `reconciliation_required` + attention flag |
| Second successful payment | Flagged “duplicate payment — refund the extra charge” |
| Payment after expiry/cancellation | Recorded, flagged for refund, not sent to the kitchen |
| Unpaid after window | Provider re-checked; still pending gets 15 min grace; then cancelled, slot released |
| Unavailable item / full slot | Rejected at checkout with a specific message; slot capacity enforced under lock |
| Kitchen delay | Late indicators in kitchen + admin; staff can raise an alert (flags order) |
| Customer cancellation | Allowed before the kitchen starts (policy setting); paid orders get an automatic full refund request |
| Restaurant cancellation | `orders.cancel` permission + reason; paid orders flagged for refund decision; ingredients not auto-restored |
| Refunds | Requested → provider pending → processed only when provider confirms (webhook / sync) |
| No riders online | Order stays `unassigned` (highlighted); assign anyway with explicit override, or book a partner |
| Partner rejection / timeout | Rejected → back to dispatch + attention. Timeout → booking `unknown`; no rebooking until reconciled (ask partner or confirm manually) |
| Failed delivery | Rider/dispatcher records reason → attention + customer notified → reattempt or mark returned; refund via order page |
| Lost connectivity / stale GPS | Screens show staleness; locations older than the threshold are labelled as possibly out of date; nothing is invented |
| Wrong PIN | Limited attempts, then locked; dispatcher override with written reason (audited) |
