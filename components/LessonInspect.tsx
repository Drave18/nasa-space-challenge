'use client';

import { useEffect, useRef, useState } from 'react';
import type { Media } from '@/lib/catalog';
import { InspectModel } from './InspectModel';
import styles from './Lesson.module.css';

export function LessonInspect({ media, slug }: { media: Extract<Media, { kind: 'model' }>; slug: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent('lesson-inspect', { detail: slug }));
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) setOpen(false); });
    if (root.current) observer.observe(root.current);
    return () => { observer.disconnect(); window.dispatchEvent(new CustomEvent('lesson-inspect', { detail: null })); };
  }, [open, slug]);
  return <div ref={root} className={styles.inspect}>
    {open ? <><button type="button" onClick={() => setOpen(false)}>Close inspection</button><InspectModel media={media} initialOpen /></> :
      <button type="button" onClick={() => setOpen(true)}>Explore the 3D spacecraft</button>}
  </div>;
}
