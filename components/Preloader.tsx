'use client';

import { useEffect, useState } from 'react';
import styles from './Preloader.module.css';

// Total time the logo sequence needs to play before the curtain may lift.
const MIN_MS = 1900;
const LEAVE_MS = 800;

export function Preloader() {
  const [state, setState] = useState<'loading' | 'leaving' | 'done'>('loading');

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const minimum = reduced ? 250 : MIN_MS;
    let cancelled = false;
    const timers: number[] = [];
    const windowLoaded = Promise.withResolvers<void>();
    if (document.readyState === 'complete') windowLoaded.resolve();
    else addEventListener('load', () => windowLoaded.resolve(), { once: true });
    const loaded = Promise.all([document.fonts.ready, windowLoaded.promise]);
    void loaded.then(() => {
      if (cancelled) return;
      // performance.now() counts from navigation, so slow loads never wait longer than needed.
      timers.push(window.setTimeout(() => {
        if (cancelled) return;
        setState('leaving');
        timers.push(window.setTimeout(() => !cancelled && setState('done'), reduced ? 0 : LEAVE_MS));
      }, Math.max(0, minimum - performance.now())));
    });
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, []);

  if (state === 'done') return null;
  const word = 'CHALLENGE';
  return <div className={styles.preloader} data-state={state} role="status" aria-label="Loading NASA Space Challenge">
    <div className={styles.logo} aria-hidden="true">
      <svg className={styles.mark} viewBox="0 0 120 120" fill="none">
        <circle className={styles.ring} cx="60" cy="60" r="46" pathLength="1" />
        <ellipse className={styles.orbit} cx="60" cy="60" rx="58" ry="20" transform="rotate(-24 60 60)" pathLength="1" />
        <circle className={styles.planet} cx="60" cy="60" r="14" />
        <circle className={styles.moon} cx="104" cy="38" r="4" />
      </svg>
      <p className={styles.nasa}>NASA</p>
      <p className={styles.word}>
        <span className={styles.space}>SPACE</span>
        <span className={styles.letters}>{word.split('').map((letter, i) => <span key={i} style={{ animationDelay: `${0.9 + i * 0.05}s` }}>{letter}</span>)}</span>
      </p>
      <span className={styles.bar} />
    </div>
  </div>;
}
