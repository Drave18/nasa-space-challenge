'use client';

import { useEffect, useRef, useState, type Ref } from 'react';
import type { Media } from '@/lib/catalog';
import type { ModelLoadState, ModelViewerHandle } from './ModelViewer';
import { ModelViewerLoader } from './ModelViewerLoader';
import styles from './ExpeditionExperience.module.css';

export interface StoryMediaProps {
  media: Media | null;
  viewerRef: Ref<ModelViewerHandle>;
  prefetchSrc?: string | null;
  allowModel: boolean;
  onStateChange: (state: ModelLoadState) => void;
  onImageReady: () => void;
}

export function StoryMedia({ media, viewerRef, prefetchSrc, allowModel, onStateChange, onImageReady }: StoryMediaProps) {
  const [mounted, setMounted] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  const model = media?.kind === 'model' && allowModel ? media : null;
  useEffect(() => { if (model) setMounted(true); }, [model]);
  useEffect(() => {
    let cancelled = false;
    if (media?.kind === 'image' && image.current) {
      void image.current.decode().then(() => { if (!cancelled) onImageReady(); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [media, onImageReady]);
  return <div className={styles.backdrop} aria-hidden={!media} data-story-media={media?.src ?? ''}>
    {media ? <img ref={image} key={media.src} className={`${styles.preview} ${media.kind === 'model' ? styles.modelPreview : ''}`} data-story-image={media.kind === 'image' ? '' : undefined} src={media.kind === 'model' ? media.poster : media.src} alt={media.alt} loading="lazy" decoding="async" /> : null}
    {mounted ? <ModelViewerLoader ref={viewerRef} media={model} mode="story" active={Boolean(model)} prefetchSrc={prefetchSrc} onStateChange={onStateChange} /> : null}
    <div className={styles.shade} />
  </div>;
}
