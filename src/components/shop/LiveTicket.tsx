export type TicketState = 'open' | 'closed' | 'paused';

/**
 * The live counter ticket on the home page: real open/closed state, the earliest pickup time and the
 * lowest delivery fee. Every value is passed in from storefront data; nothing here is made up.
 */
export function LiveTicket({
  state,
  headline,
  note,
  cells,
}: {
  state: TicketState;
  headline: string;
  note?: string;
  cells: { label: string; value: string }[];
}) {
  return (
    <div className="w-full max-w-[460px] rounded-2xl border border-[var(--line-strong)] bg-white text-espresso shadow-[0_10px_28px_rgba(53,37,31,0.14)]">
      <p className="m-0 flex items-center gap-2.5 px-5 pb-3 pt-4 text-[1.05rem] font-extrabold leading-tight">
        <span className="relative flex size-2.5 flex-none" aria-hidden="true">
          {state === 'open' && <span className="absolute inset-0 rounded-full bg-sage opacity-60 motion-safe:animate-ping" />}
          <span className={`relative size-2.5 rounded-full ${state === 'open' ? 'bg-sage' : state === 'paused' ? 'bg-[var(--status-prep)]' : 'bg-muted'}`} />
        </span>
        {headline}
      </p>
      {cells.length > 0 && (
        <dl className={`m-0 grid [border-top:1px_dashed_var(--line-strong)] ${cells.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {cells.map((c, i) => (
            <div key={c.label} className={`px-5 py-3.5 ${i > 0 ? '[border-left:1px_dashed_var(--line-strong)]' : ''}`}>
              <dt className="text-[0.85rem] font-semibold text-muted">{c.label}</dt>
              <dd className="m-0 mt-0.5 text-[clamp(1.35rem,2.4vw,1.6rem)] font-extrabold leading-tight tabular-nums">{c.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {note && <p className="m-0 [border-top:1px_dashed_var(--line-strong)] px-5 py-3 text-[0.92rem] leading-snug text-muted">{note}</p>}
    </div>
  );
}
