'use client';

import { useEffect, useRef, useState } from 'react';
import type { Media } from '@/lib/catalog';
import type { ModelTour } from '@/lib/model-tour';
import { InspectModel } from './InspectModel';
import { preloadModelViewer } from './ModelViewerLoader';
import styles from './Lesson.module.css';

export function LessonInspect({ media, slug, tour }: { media: Extract<Media, { kind: 'model' }>; slug: string; tour?: ModelTour }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void preloadModelViewer().catch(() => {});
    }, { rootMargin: '300px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent('lesson-inspect', { detail: slug }));
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) setOpen(false); });
    if (root.current) observer.observe(root.current);
    return () => { observer.disconnect(); window.dispatchEvent(new CustomEvent('lesson-inspect', { detail: null })); };
  }, [open, slug]);
  return <div ref={root} className={styles.inspect}>
    {open ? <><button type="button" onClick={() => setOpen(false)}>Close inspection</button><InspectModel media={media} initialOpen tour={tour} /></> :
      <button type="button" onClick={() => setOpen(true)}>Explore the 3D spacecraft</button>}
  </div>;
}
