import Image from 'next/image';

/** Photo banner at the top of the Menu and About pages: a dark wash over the hero photo with centred white text. */
export function PageBanner({ eyebrow, title, sub, children }: { eyebrow: string; title: string; sub: string; children?: React.ReactNode }) {
  return (
    <header className="relative flex min-h-[clamp(380px,56vh,560px)] items-center justify-center overflow-hidden bg-espresso pb-14 pt-[110px] text-white">
      <Image src="/brand/hero-bg.jpg" alt="" fill priority sizes="100vw" className="object-cover object-[72%_center]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(53,37,31,0.72),rgba(53,37,31,0.55)_55%,rgba(53,37,31,0.72))]" />
      <div className="relative mx-auto w-full max-w-[var(--maxw)] px-[var(--gutter)] text-center">
        <p className="m-0 mb-3.5 font-[family-name:var(--font-body)] text-[0.82rem] font-extrabold uppercase tracking-[0.14em] text-[#f0e8db]">{eyebrow}</p>
        <h1 className="m-0 mb-2.5 text-[length:clamp(2.8rem,7vw,5rem)] font-normal leading-[1.05] text-white">{title}</h1>
        <p className="m-0 text-[length:clamp(1.05rem,1.8vw,1.3rem)] text-[#f0e8db]">{sub}</p>
        {children}
      </div>
    </header>
  );
}
