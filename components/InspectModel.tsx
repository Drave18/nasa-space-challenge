'use client';

import { useEffect, useRef, useState } from 'react';
import type { Media } from '@/lib/catalog';
import type { ModelLoadState } from './ModelViewer';
import { ModelViewerLoader } from './ModelViewerLoader';
import styles from './InspectModel.module.css';

export function InspectModel({ media, initialOpen = false }: { media: Extract<Media, { kind: 'model' }>; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [state, setState] = useState<ModelLoadState>('idle');
  const [visible, setVisible] = useState(true);
  const stage = useRef<HTMLDivElement>(null);

  // Keep the viewer mounted but stop rendering while the stage is offscreen.
  useEffect(() => {
    const element = stage.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.frame}>
      <div className={styles.bar}>
        <span className={styles.label}>3D artifact</span>
        <span className={styles.hint}>Drag to orbit · Scroll or pinch to zoom</span>
      </div>
      <div className={styles.stage} ref={stage}>
        <img className={styles.poster} src={media.poster} alt={media.alt} hidden={state === 'ready'} />
        {open ? <ModelViewerLoader media={media} mode="inspect" active={visible} onStateChange={setState} /> : (
          <button className={styles.launch} type="button" onClick={() => setOpen(true)}>Inspect model</button>
        )}
      </div>
    </div>
  );
}
