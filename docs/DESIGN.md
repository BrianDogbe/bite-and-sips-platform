# Visual identity — Bite & Sips

One identity across the customer website, admin portal, kitchen display and rider app. Every colour and font lives in one place: the CSS variables at the top of `src/app/globals.css` and the font setup in `src/app/layout.tsx`.

## Official palette
| Token | Value | Use |
|---|---|---|
| `--espresso` | `#35251F` | Logo, navigation, headings, primary buttons, admin sidebar |
| `--ivory` | `#F7F2E9` | Customer site background, kitchen and rider background, selected rows |
| `--sage` | `#87947A` | Freshness accents, plate ring, subtle highlights |
| `--caramel` | `#C58B59` | Small decorative details, promotions, cart count |
| `--white` | `#FFFFFF` | Cards, forms, menus, the admin workspace |
| `--charcoal` | `#292A27` | Body text, tables, labels |
| `--border` | `#E7E0D6` | Separators and input borders |

Three derived shades exist only for contrast: `--sage-dark` and `--caramel-text` (sage and caramel when used as *text*, to stay readable) and `--espresso-2` (hover). Old token names (`--leaf`, `--paper`, `--accent`) are aliases kept so existing rules still work.

## Functional status colours (the same in every interface)
Brand colours give identity; these give meaning and are never used decoratively. Each is paired with a text label.
- New order / information: blue `#2563EB`
- Preparing: amber `#B7791F`
- Ready / paid: green `#287D50`
- Cancelled / urgent / late: red `#C43D3D`

## Typography
- **DM Serif Display**: wordmark and customer-facing editorial headlines only.
- **Manrope**: everything operational (navigation, forms, buttons, product names, prices, tables, tickets, order numbers, the delivery PIN). Admin, kitchen and rider headings use Manrope bold.
- Both load through `next/font/google` (no extra dependency).

## Per interface
- **Customer website**: ivory background, white product surfaces, espresso primary buttons ("Order now", "Add to cart", "Checkout"), light secondary buttons with a subtle border. The hero shows the live ordering status as a ticket card next to a round plate photo.
- **Admin**: white workspace, espresso sidebar, ivory for the selected item, subtle borders on tables.
- **Kitchen**: light ivory screen, white tickets with a coloured top bar (blue new, amber preparing, green ready, red late), big touch targets.
- **Rider**: ivory background, espresso top bar and primary actions, large text, green duty switch.

## Logo
`src/components/BrandMark.tsx` (also `public/icons/rider.svg`, `src/app/icon.png` and the rider app icons) is a simple cup with two wisps of steam (sage and caramel) on an espresso disc, paired with the DM Serif Display wordmark. It is a placeholder for the final logo file.

## Photos
`public/brand/` holds the owner's own photos (tuna sandwich, crunchy salad, snack box), resized for the web.
- The salad photo carries a "Nenase bites & sips" watermark, and the snack box shows third-party packaged products. Confirm these are fine to publish, or retake them.
- A tray photo with another person's watermark ("elikem") was **not** used.
- The flyer and the milk board are posters, not product photos, and were used only as reference.
- Demo items without a photo show a plain placeholder.

The demo menu (`scripts/seed-demo.ts`) mirrors the items on the owner's flyers. **Prices are placeholders**, and everything is flagged `is_demo`.
