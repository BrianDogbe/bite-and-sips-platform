'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

/**
 * Click-to-play brand video. Only the poster loads with the page; the video element (and its download)
 * is created when the visitor presses play. Hidden entirely when the browser asks to save data.
 */
export function StoryPlayer({ src, poster, title, subtitle }: { src: string; poster: string; title: string; subtitle: string }) {
  const [playing, setPlaying] = useState(false);
  const [saveData, setSaveData] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) setSaveData(true);
  }, []);

  useEffect(() => {
    if (playing) ref.current?.focus();
  }, [playing]);

  if (saveData) return null;

  return (
    <section className="bg-espresso px-[var(--gutter)] py-[clamp(48px,7vw,96px)]" aria-labelledby="story-title">
      <div className="relative mx-auto aspect-[4/5] max-h-[78svh] w-full max-w-[var(--maxw)] overflow-hidden rounded-[20px] bg-[var(--espresso-2)] min-[640px]:aspect-video">
        {playing ? (
          <video ref={ref} className="absolute inset-0 size-full object-cover" src={src} poster={poster} autoPlay muted loop playsInline controls preload="auto" aria-label={title} />
        ) : (
          <>
            <Image src={poster} alt="" fill sizes="(max-width: 1180px) 100vw, 1180px" className="object-cover" />
            <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(53,37,31,0.85),rgba(53,37,31,0.1)_65%)]" />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-6 p-[clamp(20px,4vw,48px)]">
              <div className="max-w-[560px]">
                <h2 id="story-title" className="m-0 mb-2 text-[length:clamp(1.9rem,4.4vw,3.4rem)] leading-[1.05] text-white">
                  {title}
                </h2>
                <p className="m-0 text-[length:clamp(1rem,1.6vw,1.15rem)] text-ivory">{subtitle}</p>
              </div>
              <button
                type="button"
                className="inline-flex min-h-14 cursor-pointer items-center gap-3 rounded-full border-0 bg-ivory py-2 pl-2 pr-6 font-extrabold text-espresso transition-transform duration-200 [font-family:inherit] hover:scale-[1.03] focus-visible:shadow-[0_0_0_3px_var(--espresso),0_0_0_5px_var(--ivory)] focus-visible:outline-none motion-reduce:transition-none"
                onClick={() => setPlaying(true)}
              >
                <span className="grid size-11 place-items-center rounded-full bg-[var(--caramel)]" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
                  </svg>
                </span>
                Play our video
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
