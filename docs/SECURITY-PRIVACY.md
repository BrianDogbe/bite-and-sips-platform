# Security and privacy

## Controls in place
- **Authentication.** Passwords are hashed with scrypt (N=2^17). Sessions are random 256-bit tokens, stored hashed, sent as an httpOnly SameSite=Lax cookie (Secure in production) and expire after 14 days (no idle timeout). Each portal has its own cookie (`bs_admin`, `bs_kitchen`, `bs_rider`, and `bs_session` for customers), so being signed in to several portals at once on one browser does not log you out of any of them. Signing out ends only that portal's session. Logout, role changes, deactivation and password resets revoke sessions. Logins are rate-limited per IP and per account, and an account locks for 15 minutes after 8 failures. The error message never reveals whether an account exists.
- **Authorisation.** A role → permission matrix is checked inside every service function, and tests call the services directly to prove it. Pages also redirect unauthorised users, but that is defence in depth only.
- **Input validation.** Zod schemas check every input, and the server re-prices every order: client prices, discounts and fees are ignored. Database CHECK constraints are the second line of defence.
- **CSRF.** Cookie-authenticated POST endpoints check the Origin header, and Next.js Server Actions have built-in origin checks.
- **Webhooks.** Signatures are verified (HMAC-SHA512 for Paystack) and events are deduplicated. A payment is applied only after verifying it with the provider's API.
- **Idempotency.** Orders, refunds, partner bookings and notifications use idempotency or dedupe keys.
- **Rate limits.** Login, checkout, payment start, tracking, guest lookup, support form, cancellation, PIN attempts and rider location updates are all rate-limited. Limits are stored in Postgres, so they hold across instances.
- **Secrets.** All secrets are server-only (no `NEXT_PUBLIC_*`), and a test fails if client code references a secret or imports server modules.
- **Supabase.** Row Level Security is enabled on all tables with no policies, so the public REST API exposes nothing.
- **Uploads.** File type is detected from the image bytes (JPEG/PNG/WebP only), files are capped at 3 MB and get random names, and path traversal is prevented.
- **CSV exports.** Cells are protected against formula injection.
- **Security headers.** nosniff, X-Frame-Options DENY, a strict Referrer-Policy, and a Permissions-Policy that allows geolocation for this site only. Tracking pages are noindex with no-referrer.
- **Audit trail.** Refunds, cancellations, cash collection, reconciliation, staff/role changes, settings, menu edits, dispatch overrides and exports are all recorded.

## Personal data held
| Data | Purpose | Who can see it |
|---|---|---|
| Customer name, phone, optional email | Fulfil and support orders | Staff with `customers.view` or `dispatch.manage`. Others see masked phone numbers. The kitchen sees first names only |
| Delivery address and optional GPS point | Delivery | Dispatch, and the assigned rider after they accept |
| Rider precise location | Live tracking of active deliveries | The customer during that delivery leg, and dispatch. Purged after the retention period (default 30 days) |
| Payment data | Kept only by Paystack (no card numbers or PINs ever touch this system); the app stores references, status and amounts | Finance roles |

## Before launch (owner review)
- Review the policy page texts against Ghana's **Data Protection Act, 2012 (Act 843)**. Consider registering with the Data Protection Commission as a data controller.
- Decide the retention periods for orders and customer data (orders are kept indefinitely for accounting by default) and for rider locations (settings).
- Add a data deletion and correction procedure, for example removing customer contact details from old orders on request.
- Make sure riders know when and why their location is shared (shown in the app), and include it in their contract.
- Rotate `APP_SECRET`, `CRON_SECRET` and the Paystack keys if anyone who had access leaves.
- Enable 2-step verification on the Paystack, hosting, database and domain accounts.
