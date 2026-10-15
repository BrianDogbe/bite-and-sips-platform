/** Shared Tailwind class strings for small UI pieces used on more than one screen. */

/** Modal dialog that is a centred card on desktop and a bottom sheet on phones. */
export const DIALOG =
  'w-[min(560px,calc(100vw-24px))] max-h-[calc(100dvh-24px)] rounded-[var(--r-lg)] border-0 bg-[var(--surface)] p-0 text-[var(--ink)] shadow-[var(--shadow-2)] backdrop:bg-[rgba(10,30,22,0.55)] max-[640px]:m-0 max-[640px]:mt-auto max-[640px]:max-h-[92dvh] max-[640px]:w-screen max-[640px]:max-w-[100vw] max-[640px]:rounded-b-none';

/** A group of choices (radio buttons or checkboxes) with a legend. */
export const OPTGROUP = 'm-0 mt-[18px] border-0 p-0';
export const OPT_LEGEND = 'm-0 mb-2 flex w-full items-baseline gap-2 p-0 font-bold';
/** One choice row; highlights when its input is checked and fades when disabled. */
export const OPT =
  'mb-2 flex cursor-pointer items-center gap-3 rounded-[var(--r-md)] border-[1.5px] border-line p-3 has-[input:checked]:border-espresso has-[input:checked]:bg-[#fbf1e3] has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50 [&_input]:size-5 [&_input]:accent-espresso';

/** Quantity stepper: [ - ] 1 [ + ] */
export const QTY = 'inline-flex items-center rounded-full border-[1.5px] border-[var(--line-strong)]';
export const QTY_BTN = 'size-[42px] cursor-pointer rounded-full border-0 bg-transparent text-[1.3rem]';
export const QTY_OUT = 'min-w-7 text-center font-bold';

/** Money figures: bold, with digits that line up. */
export const PRICE = 'font-bold tabular-nums';

/** An ordered item in a cart / order summary: name on the left, price on the right, notes underneath. */
export const CART_LINE = 'grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-b border-line py-3.5 [overflow-wrap:anywhere]';
export const MODS = 'text-[0.9rem] text-muted';

/** Totals block: a row per figure, and a heavier last row. */
export const TOTALS = 'grid gap-1.5 tabular-nums';
export const TOTAL_LINE = 'flex justify-between';
export const TOTAL_GRAND = 'mt-1 flex justify-between border-t-2 border-[var(--ink)] pt-2 text-[1.2rem] font-bold';

/** Two columns (main + sidebar) that collapse to one on tablets/phones. `checkout-grid` is kept as a marker for the page-level overflow guard in globals.css. */
export const TWO_COL =
  'checkout-grid grid grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)] items-start gap-7 max-[900px]:grid-cols-[minmax(0,1fr)] [&>*]:min-w-0 [&_input]:max-w-full [&_select]:max-w-full [&_textarea]:max-w-full';
export const SIDEBAR = 'sticky top-20 max-[900px]:static';
