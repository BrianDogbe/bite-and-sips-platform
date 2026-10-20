# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Customers (primary):** a neighbourhood mix of local residents, families, individuals and walk-ins in Ghana. No single group dominates. Most are on phones, often on slow mobile data. They order food for pickup or delivery, as a guest or with an optional account.
- **Owner and managers:** run the business from the admin portal (orders, menu, inventory, finance, staff, settings).
- **Kitchen staff:** work the live order queue on a tablet or TV in a busy kitchen.
- **In-house riders:** use the installable rider PWA on their own Android phones during deliveries.

## Product Purpose

Bite & Sips is an independent restaurant/cafeteria in Ghana. This platform gives it its own ordering channel and runs its operations: customer website, admin portal, kitchen display and rider app, all on one Next.js app and one PostgreSQL database with shared business rules.

Customers currently order through WhatsApp messages and delivery apps such as Glovo. Success means ordering direct is at least as quick and easy as those channels, so customers move to it.

## Positioning

Direct ordering from Bite & Sips itself, with no app commission. It should feel as quick and easy as WhatsApp or Glovo, but warmer and more personal to Bite & Sips than a marketplace listing can be.

## Operating Context

- Order flow: menu → cart → checkout (scheduled pickup with real slot capacity, or delivery by GPS or by area with a zone fee and minimum order) → payment (Paystack Mobile Money/card, or cash where enabled) → live tracking page.
- Kitchen: live queue columns, timers, due/late indicators, new-order chime with a visual fallback, sold-out switch. Kitchen screens receive no phone numbers or money amounts.
- Delivery: dispatch assigns in-house riders; riders accept, pick up, travel, and confirm delivery with a 4-digit PIN shown on the customer's tracking page. Riders see the address and phone only after accepting. Manual third-party partner bookings are supported.
- Roles and data rules are in `docs/PERMISSIONS.md`; order states in `docs/ORDER-LIFECYCLE.md`; delivery in `docs/DELIVERY.md`.

## Capabilities and Constraints

- **Mobile-first.** Most customers are on phones, often on slow mobile data. Pages must stay light and fast.
- All prices are in Ghana cedis (GH₵).
- Tap targets at least 44px. Text keeps good contrast. Form inputs are at least 16px so phones don't zoom.
- The kitchen display and rider app must be usable at a glance, on tablets and phones, in bad lighting.
- Stack: Next.js with Tailwind. Use existing utilities and the shared components in `src/components/ui.ts`; do not add new CSS files.
- Not yet verified or integrated (see README "Honest status"): Paystack against a live account, SMS/email delivery, any real Ghana delivery-partner API, geocoding of typed addresses. The UI must never present these as working or validated.

## Brand Commitments

- Name: Bite & Sips.
- Keep the brand palette: espresso, ivory, sage, caramel (values and status colours in `docs/DESIGN.md`).
- Voice: warm and personal, plain and direct. Copy explains what happens next and never overclaims.
- The logo (`src/components/BrandMark.tsx`) is a placeholder until the owner supplies a final file.

## Evidence on Hand

- Owner's own photos in `public/brand/` (tuna sandwich, crunchy salad, snack box, drinks). The salad photo carries a "Nenase bites & sips" watermark and the snack box shows third-party packaged products; both are pending owner confirmation for publishing.
- Demo menu (`scripts/seed-demo.ts`) mirrors the owner's flyers; prices are placeholders and items are flagged `is_demo`.
- Still to be supplied by the owner (`docs/OWNER-CHECKLIST.md`): About text, address and contacts, hours, real menu and prices, verified allergen data, final logo.
- No testimonials, reviews, ratings, customer counts or press exist. Do not invent them.

## Product Principles

1. **As quick as a chat message.** Every step to an order should feel as easy as messaging on WhatsApp; remove friction before adding features.
2. **Personal, not a marketplace.** The site is Bite & Sips' own place, warmer than a Glovo listing, never a generic food-app template.
3. **Honest state, always.** Show real open/closed status, real slots, real fees and real tracking; never imply something is verified when it isn't.
4. **Light on the phone.** Speed on slow mobile data outranks decoration.
5. **Glanceable for staff.** Kitchen and rider screens are read in seconds, mid-task, in poor conditions.

## Accessibility & Inclusion

- Tap targets ≥ 44px; inputs ≥ 16px; readable contrast throughout.
- Respect `prefers-reduced-motion`.
- Status is never conveyed by colour alone; status colours are always paired with a text label.
- Kitchen and rider interfaces stay legible on tablets and phones in bad lighting.
