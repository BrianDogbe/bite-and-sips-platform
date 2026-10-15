'use client';
import { useEffect, useRef, useState } from 'react';

/** Full-screen looping, silent brand video. Replace public/brand/story.mp4 with your own footage. */
export function StoryVideo({ src, poster, title, subtitle }: { src: string; poster: string; title: string; subtitle: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      ref.current?.pause();
      setPlaying(false);
    }
  }, []);

  function toggle() {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  return (
    <section className="relative flex h-[calc(100svh-65px)] scroll-mt-[65px] items-end overflow-hidden bg-espresso text-white" aria-label="Bite & Sips video">
      <video ref={ref} className="absolute inset-0 size-full object-cover" src={src} poster={poster} autoPlay muted loop playsInline preload="metadata" />
      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(53,37,31,0.7),rgba(53,37,31,0)_55%)]" />
      <div className="relative max-w-[720px] p-[clamp(24px,5vw,80px)]">
        <h2 className="m-0 mb-2 text-[length:clamp(2rem,5vw,4rem)] leading-[1.05] text-white">{title}</h2>
        <p className="m-0 text-[length:clamp(1rem,1.8vw,1.25rem)] text-[#f7f2e9]">{subtitle}</p>
      </div>
      <button type="button" className="absolute bottom-[clamp(16px,3vw,40px)] right-[clamp(16px,3vw,40px)] size-11 cursor-pointer rounded-full border-0 bg-[rgba(247,242,233,0.9)] text-[0.85rem] text-espresso" onClick={toggle} aria-label={playing ? 'Pause video' : 'Play video'}>
        {playing ? '❚❚' : '▶'}
      </button>
    </section>
  );
}
