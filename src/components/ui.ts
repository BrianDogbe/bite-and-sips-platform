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

/** Two columns (main + sidebar) that collapse to one on tablets/phones. `checkout-grid` is kept as a marker for the page-level overflow guard in overrides.css. */
export const TWO_COL =
  'checkout-grid grid grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)] items-start gap-7 max-[900px]:grid-cols-[minmax(0,1fr)] [&>*]:min-w-0 [&_input]:max-w-full [&_select]:max-w-full [&_textarea]:max-w-full';
export const SIDEBAR = 'sticky top-20 max-[900px]:static';

export const DAY_CHIP =
  'min-h-[38px] cursor-pointer rounded-full border-[1.5px] border-line-strong bg-[var(--surface)] px-3.5 font-[family-name:var(--font-body)] text-[0.9rem] font-bold [@media(pointer:coarse)]:min-h-11 aria-pressed:border-[var(--leaf)] aria-pressed:bg-[var(--leaf-3)] aria-pressed:text-[var(--leaf)]';

// Shared class sets (generated from the old stylesheet)
export const C_ADMIN_TOP =
  "flex justify-between [gap:12px] flex-wrap [margin-bottom:30px] items-end [&_h1]:m-0 [&_h1]:font-extrabold [&_h1]:[font-size:1.5rem] [&_h1]:[line-height:1.25] [&:has(.dash-welcome)]:[margin-bottom:32px] [&:has(.dash-welcome)]:items-end [&_>_div_>_p]:[margin:8px_0_0]! [&_>_div_>_p]:[font-size:0.95rem] [&_>_div_>_p]:[line-height:1.5] [&_>_div_>_p]:[color:var(--muted)]";
export const C_BAR_CARET =
  "[color:var(--muted)] [.rt-user_&]:[color:rgba(255,_255,_255,_.7)] [.rt-user_&]:flex-none";
export const C_BAR_DROPDOWN =
  "absolute [right:0] [top:calc(100%_+_8px)] [min-width:190px] [z-index:30] grid [padding:6px] [background:#fff] [border:1px_solid_var(--line)] [border-radius:14px] [box-shadow:0_14px_32px_rgba(53,_37,_31,_0.16)] [&_a]:flex [&_a]:items-center [&_a]:[gap:10px] [&_a]:[width:100%] [&_a]:[padding:11px_14px] [&_a]:border-0 [&_a]:[border-radius:10px] [&_a]:bg-transparent [&_a]:[color:var(--ink)] [&_a]:[font:inherit] [&]:[&_a]:font-bold [&]:[&_a]:[font-size:0.92rem] [&_a]:text-left [&_a]:no-underline [&_a]:cursor-pointer [&_button]:flex [&_button]:items-center [&_button]:[gap:10px] [&_button]:[width:100%] [&_button]:[padding:11px_14px] [&_button]:border-0 [&_button]:[border-radius:10px] [&_button]:bg-transparent [&_button]:[color:var(--ink)] [&_button]:[font:inherit] [&]:[&_button]:font-bold [&]:[&_button]:[font-size:0.92rem] [&_button]:text-left [&_button]:no-underline [&_button]:cursor-pointer [&_a:hover]:[background:var(--ivory)] [&_button:hover]:[background:var(--ivory)] [.kds-top_&]:[z-index:40]";
export const C_BAR_DROPDOWN_OUT =
  "[.bar-dropdown_&]:[color:var(--danger)] [.bar-dropdown_&]:[border-top:1px_solid_var(--line)] [.bar-dropdown_&]:[border-radius:0_0_10px_10px] [.bar-dropdown_&]:[margin-top:4px]";
export const C_BRAND =
  "inline-flex items-center [gap:10px] no-underline [font-family:var(--font-display)] font-normal [font-size:1.6rem] [letter-spacing:0] [color:var(--espresso)] whitespace-nowrap [.kds-top_&]:[color:var(--espresso)] [.kds-top_&]:[font-size:1.1rem] max-[400px]:[font-size:1.3rem] [.admin-main_.kds-top_&]:hidden [.admin-side_&]:[color:var(--espresso)] [.admin-side_&]:[border-bottom:0] [.admin-side_&]:[padding:4px_10px_18px] [.admin-side_&]:[margin-bottom:0] [.admin-side_&]:font-extrabold [.admin-side_&&]:[font-size:1.25rem]";
export const C_CASES_TABLE =
  "[&_th]:[padding:16px_18px] [&_td]:[padding:16px_18px]";
export const C_CHECK_CARD =
  "items-center [gap:16px] [padding:18px_20px] [border:1px_solid_var(--line,_var(--border))] [border-radius:12px] [background:var(--surface,_#fff)] hover:[border-color:var(--espresso)] [&_>_span]:grid [&_>_span]:[gap:4px] [&_>_span]:font-bold [&_.hint]:font-normal [&_input]:[margin-top:0] [.ie-checks_&]:[padding:12px_14px] [.ie-checks_&]:[gap:10px] aria-disabled:[opacity:.45] aria-disabled:cursor-not-allowed [&[aria-disabled=true]_input]:cursor-not-allowed";
export const C_DASH_CARD =
  "[padding:24px] flex flex-col [gap:18px]";
export const C_DASH_CARD_HEAD =
  "flex items-start justify-between [gap:12px] [&_h2]:m-0 [&_h2]:[font-size:1.1rem] [&_h2]:font-extrabold [.admin-main_.dash-card_&_h2]:m-0 [.admin-main_.dash-card_&_h2]:[font-size:1.1rem] [.admin-main_.dash-card_&_h2]:font-extrabold";
export const C_DASH_ICO =
  "[.dash-kpi.danger_&]:[background:var(--danger-bg)] [.dash-kpi.danger_&]:[color:var(--danger)] flex-none [width:46px] [height:46px] [border-radius:12px] grid place-items-center [background:var(--espresso)] [color:#fff] no-underline [&.sm]:[width:38px] [&.sm]:[height:38px] [&.sm]:[border-radius:10px] [&.sm]:[background:var(--sage-tint)] [&.sm]:[color:var(--sage-dark)] [a&.sm:hover]:[background:var(--espresso)] [a&.sm:hover]:[color:#fff]";
export const C_DASH_TILE =
  "grid [gap:4px] [padding:14px_16px] [border-radius:12px] [background:var(--ivory)] [border:1px_solid_var(--line)] no-underline [color:inherit] [&_span]:[font-size:0.8rem] [&_span]:[color:var(--muted)] [&_span]:font-semibold [&_strong]:[font-size:1.4rem] [&_strong]:font-extrabold [&_strong]:tabular-nums [&.danger]:[background:var(--danger-bg)] [&.danger]:[border-color:#f2b8b2] [&.danger_strong]:[color:var(--danger)] [&.sage]:[background:var(--sage-tint)] [&.sage]:[border-color:#d3dcc9] [&.caramel]:[background:var(--caramel-tint)] [&.caramel]:[border-color:#ead3bb]";
export const C_DASH_TILES =
  "grid [grid-template-columns:repeat(3,_minmax(0,_1fr))] [gap:12px] [&.two]:[grid-template-columns:repeat(2,_minmax(0,_1fr))] max-[760px]:[grid-template-columns:1fr_1fr]";
export const C_DSP_COUNT =
  "[min-width:28px] text-center [padding:2px_10px] rounded-full [background:var(--espresso)] [color:#fff] [font-size:0.85rem] font-bold";
export const C_DSP_EMPTY =
  "grid place-items-center [min-height:84px] m-0 [border:1.5px_dashed_var(--line-strong,_var(--border))] [border-radius:12px] [color:var(--muted)] font-semibold text-center [padding:12px]";
export const C_DSP_HEAD =
  "flex items-center justify-between [gap:12px] [margin:0_0_16px] [padding-bottom:14px] [border-bottom:1px_solid_var(--line,_var(--border))] [font-size:1.05rem] [.fin-payments_&_h2]:m-0 [.ie-panel_&_h2]:m-0 [.ie-panel_&_h2]:[font-size:1.15rem] [.rider-cash_&]:m-0";
export const C_EMPTY_BOX =
  "grid [place-content:center] [gap:4px] [min-height:260px] [border:1.5px_dashed_var(--line-strong,_var(--border))] bg-transparent [padding:40px_24px] [&_h3]:m-0 [&_p]:m-0";
export const C_EVENT_LIST =
  "list-none p-0 m-0 [font-size:0.92rem] [&_li]:[padding:8px_0] [&_li]:[border-bottom:1px_solid_var(--line)] [&_li]:grid [&_li]:[grid-template-columns:110px_1fr] [&_li]:[gap:10px] [&_li]:[overflow-wrap:anywhere] [.admin-main_&_a:not(.btn)]:no-underline [.admin-main_&_a:not(.btn):hover]:underline [&_li]:[overflow-wrap:anywhere]";
export const C_FORM_ALIGNED =
  "[grid-template-columns:repeat(3,_minmax(0,_1fr))] [gap:28px_clamp(20px,_3vw,_40px)] [align-items:start] [&_.field]:[align-content:start] [&_.field]:[gap:8px] [&_.field_>_label]:flex [&_.field_>_label]:items-end [&_.field_>_label]:[min-height:2.9em] [&_.field_>_label]:[line-height:1.35] [&_.input]:[width:100%] max-[1100px]:[grid-template-columns:repeat(2,_minmax(0,_1fr))] max-[600px]:[grid-template-columns:1fr] max-[600px]:[&_.field_>_label]:[min-height:0] [&.two]:[grid-template-columns:repeat(2,_minmax(0,_1fr))] [&.two]:[max-width:760px] [&.one]:grid [&.one]:[grid-template-columns:minmax(0,_1fr)] [&.one]:[max-width:760px] max-[600px]:[&.two]:[grid-template-columns:1fr] [.settings-narrow_&.two]:[max-width:none] [.settings-narrow_&&]:[grid-template-columns:repeat(2,_minmax(0,_1fr))] [.settings-narrow_&&]:[max-width:none] [.settings-narrow_&.top_.field_>_label]:[min-height:0] max-[700px]:[.settings-narrow_&]:[grid-template-columns:1fr] [.zone-groups_&.two]:[max-width:none] [.zone-groups_&.two]:[gap:16px] [.zone-groups_&_.field_>_label]:[min-height:0] [.menu-side-card_&_.field_>_label]:[min-height:0]";
export const C_IE_HINT =
  "[margin:0_0_16px]";
export const C_IE_PANEL =
  "[padding:clamp(20px,_2.4vw,_30px)]";
export const C_IE_ROW =
  "grid [gap:14px] items-center";
export const C_IE_ROWS =
  "grid [gap:12px] [margin-bottom:14px]";
export const C_JOB_CHIP =
  "inline-flex items-center [padding:5px_12px] rounded-full [font-size:.84rem] font-bold [&.fee]:[background:var(--sage-tint)] [&.fee]:[color:var(--sage-dark)] [&.cash]:[background:var(--caramel-tint)] [&.cash]:[color:var(--caramel-text)]";
export const C_JOB_ICO =
  "grid place-items-center [width:40px] [height:40px] rounded-[50%] [background:var(--sage-tint)] [color:var(--sage-dark)] border-0 hover:[background:var(--sage-dark)] hover:[color:#fff]";
export const C_KPI =
  "[background:var(--surface)] [border:1px_solid_var(--line)] [border-radius:var(--r-md)] [padding:14px] no-underline block [&_.v]:[font-family:var(--font-body)] [&_.v]:[font-size:1.9rem] [&_.v]:font-extrabold [&_.v]:[line-height:1.1] [&_.v]:tabular-nums [&_.l]:[color:var(--muted)] [&_.l]:[font-size:0.9rem] [.ov-kpis_&]:[padding:clamp(16px,_2vw,_24px)]";
export const C_LIVE_PILL =
  "inline-flex items-center [gap:8px] [font-size:0.85rem] font-bold [&_.dot]:[width:9px] [&_.dot]:[height:9px] [&_.dot]:rounded-[50%] [&_.dot]:[background:#287d50] [&.stale_.dot]:[background:#c0c7c2] [.dash-head-chips_&]:[height:34px] [.dash-head-chips_&]:inline-flex [.dash-head-chips_&]:items-center [.dash-head-chips_&]:[padding:0_14px] [.dash-head-chips_&]:rounded-full [.dash-head-chips_&]:[background:#fff] [.dash-head-chips_&]:[border:1px_solid_var(--line)]";
export const C_LOGIN_CARD =
  "[width:min(420px,_100%)] [background:var(--surface)] [border-radius:var(--r-lg)] [padding:28px]";
export const C_LOGIN_WRAP =
  "[min-height:100dvh] grid place-items-center [padding:24px_16px] [background:var(--leaf)]";
export const C_MENU_LAYOUT =
  "grid [align-items:start] [grid-template-columns:minmax(0,_2fr)_minmax(320px,_1fr)] [gap:28px] max-[1100px]:[grid-template-columns:1fr] [&_>_*]:[min-width:0]";
export const C_MENU_SIDE =
  "grid [gap:24px] [align-content:start] [top:16px] static";
export const C_MENU_SIDE_CARD =
  "[padding:clamp(18px,_2vw,_28px)] [&_h2]:[font-size:1.15rem] [&_h2]:[margin:0_0_18px] [&_.stack]:[gap:16px]";
export const C_REP_PANEL =
  "[padding:clamp(20px,_2.4vw,_30px)] [margin-bottom:24px] [.rep-grid_&]:[margin-bottom:0] [.rep-grid_+_&]:[margin-top:24px]";
export const C_REP_STATS =
  "grid [grid-template-columns:repeat(auto-fit,_minmax(210px,_1fr))] [gap:16px]";
export const C_RP_GROUP =
  "grid [background:#fff] [border:1px_solid_var(--line)] [border-radius:18px] overflow-hidden [&_h2]:m-0 [&_h2]:[padding:14px_16px_6px] [&_h2]:[font-size:.78rem] [&_h2]:font-bold [&_h2]:[letter-spacing:.08em] [&_h2]:uppercase [&_h2]:[color:var(--muted)]";
export const C_SET_GROUP =
  "grid [gap:12px] [max-width:760px] [&_.field]:[max-width:760px] [&_.textarea]:[min-height:120px] [&_.textarea]:[width:100%] [.set-group_+_&]:[margin-top:8px] [.zone-groups_&]:[max-width:none]";
export const C_SET_LABEL =
  "m-0 font-extrabold [font-size:0.78rem] [letter-spacing:0.12em] uppercase [color:var(--muted)]";
export const C_SET_ROWS =
  "grid [gap:22px] [max-width:760px]";
export const C_SET_STATUS =
  "flex flex-wrap items-center [gap:8px_14px] [max-width:760px] m-0 [padding:16px_20px] [border-radius:12px] [background:var(--ivory-2,_#efe8d9)] [&_.hint]:[flex-basis:100%]";
export const C_SIDE_AVATAR =
  "flex-none [width:38px] [height:38px] rounded-[50%] grid place-items-center [background:var(--espresso)] [color:var(--ivory)] font-extrabold [.bar-menu_.bar-user_&]:[width:36px] [.bar-menu_.bar-user_&]:[height:36px] [.rt-user_&]:[width:38px] [.rt-user_&]:[height:38px] [.rt-user_&]:flex-none [.rt-user_&]:[background:var(--ivory)] [.rt-user_&]:[color:var(--espresso)]";
export const C_TABS =
  "flex [gap:4px] [border-bottom:1.5px_solid_var(--line)] [margin-bottom:16px] overflow-x-auto [&_a]:[padding:10px_14px] [&_a]:no-underline [&_a]:font-bold [&_a]:[border-bottom:3px_solid_transparent] [&_a]:[margin-bottom:-1.5px] [&_a]:whitespace-nowrap [&_a]:[color:var(--muted)] [&_a[aria-current=page]]:[border-color:var(--leaf)] [&_a[aria-current=page]]:[color:var(--ink)] [.admin-main_&]:[gap:10px] [.admin-main_&]:[margin-bottom:28px] [.admin-main_&_a]:[padding:12px_20px] [&.tabs-pills]:[border-bottom:0] [&.tabs-pills]:[gap:10px] [&.tabs-pills_a]:[margin-bottom:0] [&.tabs-pills_a]:[border:1.5px_solid_var(--line,_var(--border))] [&.tabs-pills_a]:rounded-full [&.tabs-pills_a]:[background:var(--surface,_#fff)] [&&.tabs-pills_a]:[padding:10px_22px] [&.tabs-pills_a[aria-current=page]]:[background:var(--espresso)] [&.tabs-pills_a[aria-current=page]]:[border-color:var(--espresso)] [&.tabs-pills_a[aria-current=page]]:[color:#fff]";
export const C_TWO_COL =
  "grid [grid-template-columns:minmax(0,_2fr)_minmax(280px,_1fr)] [gap:18px] [align-items:start] max-[1100px]:[grid-template-columns:1fr] max-[860px]:[grid-template-columns:minmax(0,_1fr)]! [&_>_*]:[min-width:0]";
export const C_ZONE_GROUPS =
  "grid [gap:22px] [.menu-side-card_&]:[gap:22px]";
export const C_ZONES_LAYOUT =
  "[grid-template-columns:minmax(0,_1fr)_minmax(0,_1fr)] [gap:24px] [&_.panel]:[padding:clamp(20px,_2.4vw,_32px)] [&_.panel_>_h2]:[margin-bottom:8px] [&_.panel_>_.hint]:[margin-bottom:20px] [&_.panel_>_.hint]:[max-width:60ch] max-[1100px]:[grid-template-columns:1fr]";
