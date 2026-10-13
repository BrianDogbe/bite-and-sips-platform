export function PeriodPicker({ fromKey, toKey, today }: { fromKey: string; toKey: string; today: string }) {
  return (
    <form method="get" className="filters panel tight period-bar">
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
