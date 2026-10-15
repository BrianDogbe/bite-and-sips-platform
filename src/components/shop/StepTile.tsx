'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';

/** A small auto-advancing photo slideshow tile with pause/play and progress bars. */
export function StepTile({ images, label }: { images: { src: string; alt: string }[]; label: string }) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing || images.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % images.length), 4200);
    return () => clearInterval(t);
  }, [playing, images.length]);

  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="relative min-h-[240px] overflow-hidden bg-espresso max-[640px]:min-h-[200px]" role="group" aria-label={label}>
      {images.map((im, i) => (
        <Image key={im.src} src={im.src} alt={i === idx ? im.alt : ''} aria-hidden={i === idx ? undefined : true} fill sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 25vw" className={`object-cover transition-opacity duration-[800ms] motion-reduce:transition-none ${i === idx ? 'opacity-100' : 'opacity-0'}`} />
      ))}
      <div className="absolute inset-x-4 bottom-3.5 flex items-center gap-3 text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">
        <button type="button" className="size-[34px] cursor-pointer rounded-full border-0 bg-[rgba(53,37,31,0.78)] text-[0.65rem] text-white" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause slideshow' : 'Play slideshow'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <span className="flex max-w-[110px] flex-1 gap-1.5" aria-hidden="true">
          {images.map((_, i) => (
            <i key={i} className={`h-[3px] flex-1 ${i === idx ? 'bg-white' : 'bg-[rgba(255,255,255,0.4)]'}`} />
          ))}
        </span>
        <span className="text-[0.85rem] font-bold" aria-live="off">
          {pad(idx + 1)} / {pad(images.length)}
        </span>
      </div>
    </div>
  );
}
