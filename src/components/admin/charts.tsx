export interface Series {
  name: string;
  values: number[];
  color: string;
}

const compact = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

/** Simple two-axis line chart, rendered on the server as SVG. */
export function LineChart({ labels, series, ariaLabel }: { labels: string[]; series: Series[]; ariaLabel: string }) {
  const W = 640;
  const H = 240;
  const L = 48;
  const R = 12;
  const T = 12;
  const B = 30;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const niceMax = (() => {
    const mag = Math.pow(10, Math.floor(Math.log10(max)));
    const n = max / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  })();
  const n = labels.length;
  const x = (i: number) => L + (n <= 1 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / niceMax) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * niceMax);
  return (
    <svg className="dash-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} preserveAspectRatio="xMidYMid meet">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : '3 4'} />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" className="dash-axis">{compact(t)}</text>
        </g>
      ))}
      {labels.map((l, i) => (
        <text key={`${l}-${i}`} x={x(i)} y={H - 8} textAnchor="middle" className="dash-axis">{l}</text>
      ))}
      {series.map((s) => (
        <g key={s.name}>
          <path d={s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {s.values.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill="#fff" stroke={s.color} strokeWidth={2}>
              <title>{`${s.name}, ${labels[i]}: ${v.toFixed(2)}`}</title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  );
}

/** Tiny area trend line for cards. */
export function Sparkline({ values, color = 'var(--sage-dark)', ariaLabel }: { values: number[]; color?: string; ariaLabel: string }) {
  const W = 220;
  const H = 56;
  const max = Math.max(1, ...values);
  const n = values.length;
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => 6 + (1 - v / max) * (H - 12);
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="dash-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
