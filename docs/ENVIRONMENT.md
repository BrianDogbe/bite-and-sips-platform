# Environment variables

All variables are **server-only**. No `NEXT_PUBLIC_*` variables are used, so nothing in this list ships to the browser. Template: `.env.example`. Use separate values for development, testing and production.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string. On Supabase use the **session** pooler or direct connection (LISTEN/NOTIFY needs a session) |
| `DATABASE_SSL` | | `disable` / `prefer` (default) / `require` (cloud) |
| `DATABASE_POOL_MAX` | | Default 10 |
| `APP_URL` | yes | Public base URL, e.g. `https://biteandsips.com` (payment callback and tracking links) |
| `APP_SECRET` | yes | 32+ random chars. Derives delivery PINs and mock/sandbox signing keys. Rotating it changes PINs for orders in progress |
| `PAYMENT_PROVIDER` | | `mock` (dev default), `paystack`, `none` |
| `PAYSTACK_SECRET_KEY` | with paystack | `sk_test_…` / `sk_live_…`. Also used to verify webhook signatures |
| `PAYSTACK_BASE_URL` | | Default `https://api.paystack.co` |
| `ALLOW_MOCK_PAYMENTS_IN_PRODUCTION` | | Keep `false`. Only for a private staging site built with NODE_ENV=production |
| `CRON_SECRET` | prod | Bearer token for `/api/cron/run` |
| `NOTIFY_SMS_PROVIDER` | | `log` / `hubtel` / `none` |
| `HUBTEL_SMS_CLIENT_ID`, `HUBTEL_SMS_CLIENT_SECRET`, `HUBTEL_SMS_SENDER` | with hubtel | Sender ID must be approved by Hubtel |
| `NOTIFY_EMAIL_PROVIDER` | | `log` / `resend` / `none` |
| `RESEND_API_KEY`, `EMAIL_FROM` | with resend | Verified sending domain required |
| `ADMIN_HOST`, `KITCHEN_HOST`, `RIDER_HOST` | | e.g. `admin.biteandsips.com`. Maps subdomains to portals |
| `UPLOAD_DIR` | | Photo storage directory (default `./storage/uploads`). Must persist across deploys |
| `TRUST_PROXY` | | `true` when running behind a trusted proxy/CDN. Forwarding headers are ignored unless this is `true`; while `false`, all visitors share one rate-limit bucket (fine for development, wrong for a live site) |
| `TRUSTED_PROXY_HOPS` | | Number of trusted proxies in front of the app (default `1`). The visitor's address is read that many entries from the END of `X-Forwarded-For`. Only used when `TRUST_PROXY=true` |
| `DELIVERY_SANDBOX_PROVIDER` | | `true` enables the simulated courier in non-production only |
| `TEST_DATABASE_URL` | tests | Database wiped by `npm test` |
| `SCRYPT_COST` | tests | Lower password-hash cost for tests only |
