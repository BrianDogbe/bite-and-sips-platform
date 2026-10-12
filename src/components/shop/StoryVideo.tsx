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
    <section className="story" aria-label="Bite & Sips video">
      <video ref={ref} className="story-video" src={src} poster={poster} autoPlay muted loop playsInline preload="metadata" />
      <div className="story-shade" />
      <div className="story-caption">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <button type="button" className="story-toggle" onClick={toggle} aria-label={playing ? 'Pause video' : 'Play video'}>
        {playing ? '❚❚' : '▶'}
      </button>
    </section>
  );
}
