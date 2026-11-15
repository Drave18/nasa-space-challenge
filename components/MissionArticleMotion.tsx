'use client';

import { useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Reveals the article header and top-level sections once; content stays server-rendered and static under reduced motion. */
export function MissionArticleMotion({ className, children }: { className?: string; children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach(element => {
        gsap.from(element, {
          opacity: 0, y: 16, duration: 0.5, ease: 'power2.out', clearProps: 'opacity,transform',
          scrollTrigger: { trigger: element, start: 'top 90%', once: true },
        });
      });
    });
    return () => media.revert();
  }, { scope });
  return <div ref={scope} className={className}>{children}</div>;
}
