# Deployment

## Recommended shape
A **Node.js server host** that keeps long-lived connections open, so live updates use Server-Sent Events. Good fits: Render, Railway, Fly.io, a DigitalOcean/Hetzner VPS, or any Docker host. Pair it with managed PostgreSQL (Supabase, Neon, Render, Railway) that has **automatic daily backups and point-in-time recovery**.

Vercel or other serverless platforms also work, with three caveats:
- Long SSE connections are cut, so screens fall back to polling every 10–15 s.
- Uploaded photos need object storage (replace `src/server/storage.ts` with a Supabase Storage/S3/R2 adapter).
- Schedule the jobs endpoint with the platform's cron.

## Steps
1. Provision PostgreSQL and set `DATABASE_URL` with `DATABASE_SSL=require`.
2. Set the production environment (`docs/ENVIRONMENT.md`): `NODE_ENV=production`, `APP_URL=https://…`, a fresh `APP_SECRET`, a fresh `CRON_SECRET`, and `PAYMENT_PROVIDER=paystack` with the **live** key once testing is finished.
3. Build and migrate:
   ```bash
   npm ci
   npm run db:migrate      # safe to run on every deploy; never edits applied migrations
   npm run build
   npm start               # or your host's start command; listens on $PORT (default 3000)
   ```
4. Create the owner: `npm run db:create-owner -- --email … --name "…"`. **Do not** run `db:seed:demo` in production (it refuses when NODE_ENV=production).
5. **Scheduled jobs: required.** Run them every minute by one of these:
   - `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/run`
   - or `npm run jobs:run` from cron / Windows Task Scheduler.

   They expire unpaid orders, re-verify pending payments and refunds, send SMS/email, and purge old locations, sessions and rate-limit rows.
6. Configure the Paystack webhook: `https://<domain>/api/payments/paystack/webhook`.
7. Domains, all served by the same deployment:
   - Point `biteandsips.com` at the deployment.
   - Optionally add `admin.`, `kitchen.` and `rider.` as aliases and set `ADMIN_HOST`, `KITCHEN_HOST` and `RIDER_HOST`.
8. **HTTPS is mandatory.** Secure session cookies, browser geolocation (rider and checkout), PWA install and Paystack webhooks all require it.
9. Set `TRUST_PROXY=true` only if a trusted proxy/CDN sets `X-Forwarded-For`.

## Monitoring and logs
The app writes structured JSON logs to stdout/stderr (`src/server/log.ts`). Ship them to your host's log viewer and alert on these messages:
- `level:"error"`
- `webhook_processing_failed`
- `payment_init_failed`
- `job_failed`
- `notification_send_failed`

Add an uptime check on `/api/slots` and keep an eye on the admin overview's "Need attention" count. An error tracker (e.g. Sentry) can be added later via Next.js instrumentation.

## Backups and recovery
- Enable provider backups (daily snapshots plus point-in-time recovery). Also take a weekly logical dump: `pg_dump --format=custom "$DATABASE_URL" > backup-$(date +%F).dump`. Store it off-site and encrypted.
- **Restore drill:** test this quarterly. Run `pg_restore --clean --no-owner -d "$NEW_DATABASE_URL" backup.dump` into a fresh database, point a staging deployment at it, and check orders, payments and menu.
- Back up `UPLOAD_DIR`, or the object-storage bucket.

**Incident playbook:**
- If the kitchen sees no orders: check the connection pill on the kitchen screen, then the server logs, then the database status.
- To stop taking orders instantly: Admin → Settings → Ordering → untick "Accept online orders".
- If payments look wrong: use Admin → Orders filtered by "Needs reconciliation", re-check payments from the order page, and compare with the Paystack dashboard.

## Staff onboarding
- **Create accounts:** Admin → Staff. Give each person only the roles they need and share temporary passwords privately; they change them in Account.
- **Kitchen:** open `/kitchen` on the tablet, sign in, and tap "Sound on" once per session (browsers need a tap before playing sound).
- **Riders:** open `/rider` in Chrome on Android, then "Add to Home screen", sign in, allow location, and test one delivery on their own phone.
