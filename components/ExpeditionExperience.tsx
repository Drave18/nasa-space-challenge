'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import type { Media } from '@/lib/catalog';
import type { ModelLoadState, ModelViewerHandle } from './ModelViewer';
import { ChapterNav } from './ChapterNav';
import { StoryMedia } from './StoryMedia';
import styles from './ExpeditionExperience.module.css';

export interface ChapterDescriptor { slug: string; shortName: string; body: string; media: Media }
type ChapterPosition = { top: number; bottom: number };
type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };
gsap.registerPlugin(ScrollTrigger, useGSAP);

export function ExpeditionExperience({ chapters, children }: { chapters: ChapterDescriptor[]; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const viewer = useRef<ModelViewerHandle>(null);
  const progressBar = useRef<HTMLDivElement>(null);
  const positions = useRef<ChapterPosition[]>([]);
  const activeRef = useRef(-1);
  const chapterProgress = useRef(chapters.map(() => ({ progress: 0 })));
  const latestProgress = useRef(0);
  const motionEnabled = useRef(false);
  const considerPrefetch = useRef<() => void>(() => {});
  const [constrained, setConstrained] = useState(true);
  const [allowedSlug, setAllowedSlug] = useState<string | null>(null);
  const [prefetchSrc, setPrefetchSrc] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [enhanced, setEnhanced] = useState(false);
  const [modelState, setModelState] = useState<ModelLoadState>('idle');
  const [imageReady, setImageReady] = useState(false);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const current = chapters[active];
  useEffect(() => {
    const update = (event: Event) => setInspecting((event as CustomEvent<string | null>).detail);
    window.addEventListener('lesson-inspect', update);
    return () => window.removeEventListener('lesson-inspect', update);
  }, []);
  const applyProgress = useCallback((progress: number) => {
    latestProgress.current = progress;
    viewer.current?.setStoryProgress(progress);
    const backdrop = root.current?.querySelector<HTMLElement>('[data-story-media]');
    backdrop?.style.setProperty('--still-scale', String(motionEnabled.current ? 1.04 + progress * 0.025 : 1));
    backdrop?.style.setProperty('--still-y', `${motionEnabled.current ? 0.75 - progress * 1.5 : 0}%`);
  }, []);
  const onStateChange = useCallback((state: ModelLoadState) => {
    setModelState(state);
    viewer.current?.setStoryProgress(latestProgress.current);
  }, []);
  const onImageReady = useCallback(() => setImageReady(true), []);

  useEffect(() => {
    const link = root.current?.querySelector<HTMLAnchorElement>('[data-begin-expedition]');
    const scene = root.current?.querySelector<HTMLElement>('#apollo-11 [data-story-scene]');
    if (!link || !scene) return;
    const begin = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!scene.hasAttribute('data-cinematic')) return;
      event.preventDefault();
      const beats = scene.querySelectorAll('[data-beat]').length;
      const top = scene.getBoundingClientRect().top + window.scrollY;
      const travel = Math.max(0, scene.offsetHeight - window.innerHeight);
      history.pushState(null, '', '#apollo-11');
      window.scrollTo({
        top: top + travel * 0.3 / beats,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    };
    link.addEventListener('click', begin);
    return () => link.removeEventListener('click', begin);
  }, []);

  useEffect(() => {
    const link = root.current?.querySelector<HTMLAnchorElement>('[data-back-to-top]');
    if (!link) return;
    const returnToTop = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      history.pushState(null, '', '#top');
      window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    };
    link.addEventListener('click', returnToTop);
    return () => link.removeEventListener('click', returnToTop);
  }, []);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      motionEnabled.current = true;
      const container = root.current!;
      const sections = Array.from(container.querySelectorAll<HTMLElement>('[data-chapter]'));
      const sceneOf = (section: HTMLElement) => section.querySelector<HTMLElement>('[data-story-scene]')!;
      // Reading reveals are created once per context so rebuilds never duplicate them.
      gsap.utils.toArray<HTMLElement>('[data-reading-reveal]', container).forEach(group => {
        gsap.from(group, {
          y: 12, duration: 0.45, ease: 'power2.out', clearProps: 'transform',
          scrollTrigger: { trigger: group, start: 'top 90%', once: true },
        });
      });
      type Anchor = { section: HTMLElement | null; ratio: number; fromBottom: number } | null;
      let timelines: gsap.core.Timeline[] = [];
      let queued = 0;
      let first = true;
      let gone = false;
      let builtWidth = innerWidth;
      let builtHeight = innerHeight;

      // Revert to natural flow: kill scenes, then clear data flags and every inline style GSAP wrote.
      const teardown = () => {
        for (const timeline of timelines) { timeline.scrollTrigger?.kill(); timeline.kill(); }
        timelines = [];
        for (const section of sections) {
          const scene = sceneOf(section);
          delete scene.dataset.cinematic;
          scene.style.removeProperty('--beats');
          gsap.set(scene.querySelectorAll('[data-beat]'), { clearProps: 'opacity,visibility,transform' });
        }
      };
      const build = () => {
        teardown();
        sections.forEach((section, index) => {
          const scene = sceneOf(section);
          const panels = Array.from(scene.querySelectorAll<HTMLElement>('[data-beat]'));
          const progress = chapterProgress.current[index];
          progress.progress = 0;
          // Tentatively enable the cinematic layout, then keep it only if every panel fits with its beat padding.
          scene.dataset.cinematic = '';
          scene.style.setProperty('--beats', String(panels.length));
          const fits = panels.every(panel => {
            const beatStyle = getComputedStyle(panel.parentElement!);
            return panel.offsetHeight + parseFloat(beatStyle.paddingTop) + parseFloat(beatStyle.paddingBottom) <= innerHeight;
          });
          if (!fits) {
            delete scene.dataset.cinematic;
            scene.style.removeProperty('--beats');
          }
          const timeline = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
              trigger: scene, start: 'top top', end: 'bottom bottom',
              scrub: 0.55, invalidateOnRefresh: true,
            },
            onUpdate: () => { if (index === activeRef.current) applyProgress(progress.progress); },
          });
          timelines.push(timeline);
          // Camera and captions share one playhead, including reverse scrolling.
          timeline.to(progress, { progress: 1, duration: panels.length }, 0);
          if (!fits) return;
          panels.forEach((panel, beat) => {
            timeline.addLabel(`passage-${beat}`, beat)
              .fromTo(panel, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.25, ease: 'power2.out' }, `passage-${beat}`)
              .to(panel, { autoAlpha: 0, y: -12, duration: 0.2, ease: 'sine.in' }, beat + 0.8);
          });
        });
        builtWidth = innerWidth;
        builtHeight = innerHeight;
      };
      // Remember where the reader is inside the document so a layout change cannot move them.
      const capture = (): Anchor => {
        const center = scrollY + innerHeight / 2;
        for (const section of sections) {
          const box = section.getBoundingClientRect();
          if (center >= box.top + scrollY && center < box.bottom + scrollY) return { section, ratio: -box.top / box.height, fromBottom: 0 };
        }
        const last = sections[sections.length - 1]?.getBoundingClientRect();
        if (last && center >= last.bottom + scrollY) return { section: null, ratio: 0, fromBottom: document.documentElement.scrollHeight - scrollY };
        return null;
      };
      const restore = (anchor: Anchor) => {
        if (!anchor) return;
        if (anchor.section) {
          const box = anchor.section.getBoundingClientRect();
          scrollTo({ top: box.top + scrollY + anchor.ratio * box.height, behavior: 'instant' });
        } else scrollTo({ top: document.documentElement.scrollHeight - anchor.fromBottom, behavior: 'instant' });
      };
      let anchor: Anchor | undefined;
      let tracking = 0;
      let frozen = false;
      // The anchor is recorded while scrolling, so a resize reflow cannot corrupt it before the rebuild runs.
      const track = () => {
        if (tracking || frozen) return;
        tracking = requestAnimationFrame(() => { tracking = 0; if (!frozen && !gone) anchor = capture(); });
      };
      const rebuild = () => {
        queued = 0;
        if (gone) return;
        const saved = first || anchor === undefined ? capture() : anchor;
        build();
        restore(saved);
        frozen = false;
        ScrollTrigger.refresh();
        anchor = capture();
        if (first) {
          first = false;
          const items = container.querySelectorAll('[data-hero-item]');
          const hash = location.hash;
          if (scrollY < 4 && (!hash || hash === '#top') && items.length) {
            gsap.from(items, { opacity: 0, y: 20, duration: 0.7, stagger: 0.08, ease: 'power2.out', clearProps: 'opacity,transform' });
          }
        }
      };
      const request = () => { if (!queued) queued = requestAnimationFrame(rebuild); };
      const resized = () => {
        if (innerWidth !== builtWidth || Math.abs(innerHeight - builtHeight) >= 100) { frozen = true; request(); }
      };
      rebuild();
      addEventListener('resize', resized);
      addEventListener('scroll', track, { passive: true });
      void document.fonts.ready.then(() => { if (!gone) request(); });
      return () => {
        gone = true;
        cancelAnimationFrame(queued);
        cancelAnimationFrame(tracking);
        removeEventListener('resize', resized);
        removeEventListener('scroll', track);
        teardown();
        motionEnabled.current = false;
        applyProgress(0.5);
      };
    });
    return () => media.revert();
  }, { scope: root });

  useEffect(() => {
    let cancelQueued: (() => void) | null = null;
    let queued = false;
    const consider = () => {
      if (activeRef.current !== active) return;
      const bounds = positions.current[active];
      const progress = bounds ? (scrollY - bounds.top) / Math.max(1, bounds.bottom - bounds.top - innerHeight) : 0;
      const next = chapters[active + 1]?.media;
      const ready = current?.media.kind === 'model' ? modelState === 'ready' : imageReady;
      if (constrained || !viewer.current || !ready || next?.kind !== 'model' || progress <= 0.60) return;
      if (queued) return;
      queued = true;
      const run = () => { cancelQueued = null; setPrefetchSrc(next.src); };
      if ('requestIdleCallback' in window) {
        const id = window.requestIdleCallback(run, { timeout: 1000 });
        cancelQueued = () => window.cancelIdleCallback(id);
      } else {
        const id = setTimeout(run, 250);
        cancelQueued = () => clearTimeout(id);
      }
    };
    considerPrefetch.current = consider;
    consider();
    return () => { cancelQueued?.(); considerPrefetch.current = () => {}; };
  }, [active, chapters, constrained, current, imageReady, modelState]);

  useEffect(() => {
    const sections = Array.from(root.current!.querySelectorAll<HTMLElement>('[data-chapter]'));
    let frame = 0;
    let refreshFrame = 0;
    let disposed = false;
    const select = () => {
      frame = 0;
      const center = scrollY + innerHeight / 2;
      const last = positions.current[positions.current.length - 1];
      let index = positions.current.findIndex(p => center >= p.top && center < p.bottom);
      // Past the final chapter the footer keeps its backdrop.
      if (index === -1 && last && center >= last.bottom) index = positions.current.length - 1;
      if (index !== activeRef.current) {
        activeRef.current = index;
        setActive(index);
        setModelState('idle');
        setImageReady(false);
        setPrefetchSrc(null);
        setAllowedSlug(null);
        applyProgress(motionEnabled.current ? chapterProgress.current[index]?.progress ?? 0 : 0.5);
      }
      const max = document.documentElement.scrollHeight - innerHeight;
      if (progressBar.current) progressBar.current.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
      considerPrefetch.current();
    };
    const measure = () => {
      positions.current = sections.map(section => { const box = section.getBoundingClientRect(); return { top: box.top + scrollY, bottom: box.bottom + scrollY }; });
      select();
    };
    const refresh = () => {
      if (refreshFrame) return;
      refreshFrame = requestAnimationFrame(() => {
        refreshFrame = 0;
        ScrollTrigger.refresh();
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(select); };
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    const connectionChanged = () => {
      const limited = Boolean(connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? ''));
      setConstrained(limited);
      if (limited) setPrefetchSrc(null);
    };
    connectionChanged();
    connection?.addEventListener('change', connectionChanged);
    setEnhanced(true);
    measure();
    const observer = new ResizeObserver(refresh);
    observer.observe(root.current!);
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', refresh);
    addEventListener('hashchange', measure);
    addEventListener('pageshow', measure);
    ScrollTrigger.addEventListener('refresh', measure);
    void document.fonts.ready.then(() => { if (!disposed) refresh(); });
    return () => {
      disposed = true; cancelAnimationFrame(frame); cancelAnimationFrame(refreshFrame); observer.disconnect();
      removeEventListener('scroll', schedule); removeEventListener('resize', refresh);
      connection?.removeEventListener('change', connectionChanged);
      ScrollTrigger.removeEventListener('refresh', measure);
      removeEventListener('hashchange', measure); removeEventListener('pageshow', measure);
    };
  }, [applyProgress]);

  return <div ref={root} className={styles.experience} data-enhanced={enhanced || undefined} data-active-chapter={current?.slug ?? ''} data-image-ready={imageReady || undefined} data-media-kind={current?.media.kind}>
    {enhanced ? <StoryMedia media={current?.media ?? null} viewerRef={viewer} prefetchSrc={prefetchSrc} allowModel={inspecting !== current?.slug && (!constrained || allowedSlug === current?.slug)} onStateChange={onStateChange} onImageReady={onImageReady} /> : null}
    {constrained && current?.media.kind === 'model' && allowedSlug !== current.slug ? <button className={styles.load} onClick={() => setAllowedSlug(current.slug)}>Load 3D model</button> : null}
    <div className={styles.document}>{children}</div>
    <ChapterNav chapters={chapters} activeSlug={current?.slug ?? null} />
    {current ? <div className={styles.credit}>
      <span className={styles.mediaState} aria-live="polite">{current.media.kind === 'model' && modelState === 'error' ? 'Image preview · Could not load model' : current.media.kind === 'model' && modelState === 'unavailable' ? 'Image preview · 3D is unavailable on this device' : ''}</span>
    </div> : null}
    <div className={styles.progress} aria-hidden="true"><div ref={progressBar} /></div>
  </div>;
}
