# Payments

## Providers
| `PAYMENT_PROVIDER` | Use |
|---|---|
| `mock` | Development and demos. Simulated hosted page at `/pay/mock/<reference>`, signed webhooks into the real handler. Orders are flagged `is_test` and excluded from reports. **Refuses to start in production.** |
| `paystack` | Paystack (Ghana): Mobile Money and cards, currency GHS, amounts sent in pesewas |
| `none` | No online payment (use cash on pickup/delivery from Admin → Settings) |

Hubtel was considered as an alternative. Paystack was chosen as the first adapter because it has a documented hosted checkout, HMAC-signed webhooks, a verify endpoint and a refunds API that suit this lifecycle. A Hubtel adapter can be added behind the same `PaymentProvider` interface (`src/server/payments/provider.ts`).

## Lifecycle (server-authoritative)
1. Checkout posts the cart. The server re-prices it and creates the order (`pending_payment`) plus a `payment_attempts` row with a unique reference.
2. `POST /transaction/initialize` is sent with `email`, `amount` (pesewas), `currency: GHS`, `reference`, `callback_url`, and `channels: [mobile_money, card]`. The customer is redirected to Paystack.
3. Paystack sends `charge.success` to **`https://<your-domain>/api/payments/paystack/webhook`**. The server checks the `x-paystack-signature` header (HMAC-SHA512 of the raw body with your secret key), dedupes the event, then calls `GET /transaction/verify/:reference`. The webhook body alone is never trusted.
4. The order is marked paid only if the status is `success`, the amount equals the order total and the currency is GHS. It then goes to the kitchen.
5. The customer's return to `/checkout/return?reference=…` also triggers verification. A background job re-verifies attempts still pending after 2 minutes, which covers missed webhooks.

## Refunds
- **Who can refund:** Admin → order → Refund requires the `payments.refund` permission. Full and partial refunds are both possible, and requests are idempotent.
- **What's sent:** `POST /refund` with `transaction` set to the payment reference, plus `amount`.
- **Completion:** the refund shows as processed only after Paystack confirms it, either through a `refund.processed` webhook or the refund-status sync job. A failed refund flags the order for attention.
- **Cash orders:** the refund is recorded as handed back in cash.

## Setup checklist
1. Create or verify your Paystack business account for Ghana. Enable Mobile Money and card channels and confirm your settlement account.
2. In Paystack Settings → API Keys & Webhooks:
   - Copy the **test** secret key into `PAYSTACK_SECRET_KEY` and set `PAYMENT_PROVIDER=paystack`.
   - Set the webhook URL to `https://<domain>/api/payments/paystack/webhook`. Paystack must be able to reach it over HTTPS.
3. Test in test mode before going live:
   - One successful Mobile Money payment and one successful card payment.
   - One declined payment.
   - One abandoned payment (close the page).
   - One partial refund and one full refund.
4. Confirm that the fees Paystack reports appear on the order and in Finance.
5. Switch to the **live** secret key in production only. Never put test keys in production or live keys in development.

## Reconciliation
Finance → Payments lets you record each payment's settled amount and mark it *matched* or *discrepancy*. Unreconciled totals are always shown, and fees are shown only where Paystack reported them.

## Status of this integration
The adapter is written against Paystack's public API documentation and its parsing, signature and status mapping are unit-tested. It **has not been exercised against a real Paystack account**, because no credentials were available. Run the test-mode checklist above before launch.
