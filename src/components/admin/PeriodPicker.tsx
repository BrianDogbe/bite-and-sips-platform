export function PeriodPicker({ fromKey, toKey, today }: { fromKey: string; toKey: string; today: string }) {
  return (
    <form method="get" className="flex [gap:10px] flex-wrap items-end [margin-bottom:14px] [&_.field]:[min-width:150px] panel tight flex items-end [gap:16px] [padding:20px_24px] [margin-bottom:20px] [&_.field]:[min-width:190px] max-[700px]:flex-wrap max-[700px]:[&_.field]:[flex:1_1_140px] max-[700px]:[&_.field]:[min-width:0]">
      <div className="field">
        <label htmlFor="pf">From</label>
        <input id="pf" type="date" name="from" className="input" defaultValue={fromKey} max={today} />
      </div>
      <div className="field">
        <label htmlFor="pt">To</label>
        <input id="pt" type="date" name="to" className="input" defaultValue={toKey} max={today} />
      </div>
      <button className="btn leaf">Show</button>
    </form>
  );
}
