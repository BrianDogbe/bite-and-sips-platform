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
    <div className="step-tile" role="group" aria-label={label}>
      {images.map((im, i) => (
        <Image key={im.src} src={im.src} alt={i === idx ? im.alt : ''} aria-hidden={i === idx ? undefined : true} fill sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 25vw" className={i === idx ? 'on' : ''} />
      ))}
      <div className="step-tile-ctl">
        <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause slideshow' : 'Play slideshow'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <span className="step-bars" aria-hidden="true">
          {images.map((_, i) => (
            <i key={i} className={i === idx ? 'on' : ''} />
          ))}
        </span>
        <span className="step-num" aria-live="off">
          {pad(idx + 1)} / {pad(images.length)}
        </span>
      </div>
    </div>
  );
}
