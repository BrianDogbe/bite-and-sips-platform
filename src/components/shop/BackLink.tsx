import Link from 'next/link';

/** Plain "← Back" link shown at the top of storefront pages. */
export function BackLink({ href = '/menu', label = 'Back to menu', light = false }: { href?: string; label?: string; light?: boolean }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2 text-[0.92rem] font-bold no-underline hover:underline ${light ? 'mb-[18px] text-[#efe6d2]' : 'mb-3.5 text-espresso'}`}>
      <span aria-hidden="true">←</span> {label}
    </Link>
  );
}
