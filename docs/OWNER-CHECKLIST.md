# What the owner must supply or decide

Nothing below was invented. Placeholders are clearly marked in the app until replaced.

## Business information
- [ ] Legal/trading name, logo files and brand colours, if they differ from the provisional identity (docs/DESIGN.md)
- [ ] Address, GPS coordinates of the shop, phone, WhatsApp, email and social links (Admin → Settings → Restaurant)
- [ ] Opening hours, split shifts and planned closures (Settings → Hours)
- [ ] An "About" paragraph for the homepage

## Menu
- [ ] Real categories, dishes, descriptions, prices, sizes, extras and preparation times (replace or archive the **demo** items)
- [ ] Own food photography (the demo uses Unsplash photos; see docs/DESIGN.md)
- [ ] Verified allergen and dietary information for each dish. Only items ticked as verified show allergens

## Operations
- [ ] Kitchen capacity per 15-minute slot, minimum lead time, and how far ahead customers can schedule
- [ ] Whether the kitchen accepts orders manually or automatically
- [ ] Delivery zones, fees, minimum orders and typical delivery times, plus whether customers may pick an area without GPS
- [ ] Rider pay per delivery, number of riders, and the riders' phones (Android with Chrome recommended)
- [ ] Delivery partners you'll use (manual bookings work today; an API integration needs a commercial agreement and credentials)
- [ ] Whether cash on pickup and/or cash on delivery is accepted

## Money and legal
- [ ] Paystack merchant account (or another provider) with test and live keys, and the settlement bank account
- [ ] Which taxes and levies apply to your prices, plus any service charge (confirm with an accountant). Defaults are 0%
- [ ] Cancellation and refund policy wording
- [ ] Privacy policy review (Act 843), data retention decisions and Data Protection Commission registration
- [ ] SMS sender ID (e.g. Hubtel) and an email sending domain, if you want SMS/email updates

## Accounts
- [ ] Owner account (`npm run db:create-owner`), then staff accounts with the right roles
- [ ] Domain name(s) and hosting account
