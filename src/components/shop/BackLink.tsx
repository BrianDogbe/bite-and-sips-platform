import Link from 'next/link';

/** Plain "← Back" link shown at the top of storefront pages. */
export function BackLink({ href = '/menu', label = 'Back to menu', light = false }: { href?: string; label?: string; light?: boolean }) {
  return (
    <Link href={href} className={`back-btn${light ? ' light' : ''}`}>
      <span aria-hidden="true">←</span> {label}
    </Link>
  );
}
