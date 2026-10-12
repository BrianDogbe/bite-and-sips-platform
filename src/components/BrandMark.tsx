/**
 * Bite & Sips mark: a cup with a wisp of steam on an espresso disc (ivory cup, sage and caramel steam).
 * Pair it with the DM Serif Display wordmark. Replace with the final logo file when supplied.
 */
export function BrandMark({ className = 'brand-mark', light = false }: { className?: string; light?: boolean }) {
  const disc = light ? '#f7f2e9' : '#35251f';
  const cup = light ? '#35251f' : '#f7f2e9';
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="19" fill={disc} />
      <path d="M11 20h15v4.5a6 6 0 0 1-6 6h-3a6 6 0 0 1-6-6V20z" fill={cup} />
      <path d="M26 21.5h1.6a2.9 2.9 0 0 1 0 5.8H25.6" fill="none" stroke={cup} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15.5 17c-1.6-1.8 1.6-3 0-5" fill="none" stroke="#87947a" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M20.5 17c-1.6-1.8 1.6-3 0-5" fill="none" stroke="#c58b59" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
