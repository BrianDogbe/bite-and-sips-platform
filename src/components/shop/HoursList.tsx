const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function HoursList({ hours }: { hours: { weekday: number; opensAt: string; closesAt: string }[] }) {
  if (!hours.length) return <p>Opening hours will be published soon.</p>;
  return (
    <ul>
      {ORDER.map((d) => {
        const h = hours.filter((x) => x.weekday === d);
        return (
          <li key={d} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>{DAYS[d]}</span>
            <span className="tnum">{h.length ? h.map((x) => `${x.opensAt}–${x.closesAt}`).join(', ') : 'Closed'}</span>
          </li>
        );
      })}
    </ul>
  );
}

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Compact opening hours: consecutive days with the same hours are grouped, e.g. "Mon–Sat 10:00–21:00". */
export function summarizeHours(hours: { weekday: number; opensAt: string; closesAt: string }[]): { days: string; time: string }[] {
  const rows = ORDER.map((d) => {
    const h = hours.filter((x) => x.weekday === d);
    return { d, time: h.length ? h.map((x) => `${x.opensAt}–${x.closesAt}`).join(', ') : 'Closed' };
  });
  const groups: { start: number; end: number; time: string }[] = [];
  rows.forEach((r, i) => {
    const last = groups[groups.length - 1];
    if (last && last.time === r.time) last.end = i;
    else groups.push({ start: i, end: i, time: r.time });
  });
  return groups.map((g) => ({
    days: g.start === g.end ? SHORT[ORDER[g.start]] : `${SHORT[ORDER[g.start]]}–${SHORT[ORDER[g.end]]}`,
    time: g.time,
  }));
}

export function HoursSummary({ hours }: { hours: { weekday: number; opensAt: string; closesAt: string }[] }) {
  if (!hours.length) return <span>Opening hours will be published soon.</span>;
  return (
    <>
      {summarizeHours(hours).map((g) => (
        <span key={g.days} className="hours-line">
          <strong>{g.days}</strong> <span className="tnum">{g.time}</span>
        </span>
      ))}
    </>
  );
}
