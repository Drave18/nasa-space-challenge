'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Media } from '@/lib/catalog';
import type { ModelTour } from '@/lib/model-tour';
import type { ModelLoadState, ModelViewerHandle } from './ModelViewer';
import { ModelViewerLoader } from './ModelViewerLoader';
import styles from './InspectModel.module.css';

export function InspectModel({ media, initialOpen = false, tour }: { media: Extract<Media, { kind: 'model' }>; initialOpen?: boolean; tour?: ModelTour }) {
  const [open, setOpen] = useState(initialOpen);
  const [state, setState] = useState<ModelLoadState>('idle');
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const stageId = useId();
  const stage = useRef<HTMLDivElement>(null);
  const viewer = useRef<ModelViewerHandle>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const stopHeading = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<'start' | 'stop' | null>(null);

  // Keep the viewer mounted but stop rendering while the stage is offscreen.
  useEffect(() => {
    const element = stage.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { if (state !== 'ready') setTourIndex(null); }, [state]);
  useEffect(() => {
    const target = pendingFocus.current === 'stop' ? stopHeading.current : pendingFocus.current === 'start' ? startButton.current : null;
    pendingFocus.current = null;
    target?.focus();
  }, [tourIndex]);

  // Manual camera input or a viewer interruption ends the tour without moving focus.
  const leaveTour = useCallback(() => setTourIndex(null), []);
  const goTo = (index: number) => {
    if (!tour) return;
    pendingFocus.current = 'stop';
    setTourIndex(index);
    viewer.current?.tourView(tour[index].view);
  };
  const exitTour = () => {
    viewer.current?.cancelTourMove();
    pendingFocus.current = 'start';
    setTourIndex(null);
  };

  const ready = state === 'ready';
  const stop = tour && tourIndex !== null && ready ? tour[tourIndex] : null;
  const showTour = open && tour && state !== 'error' && state !== 'unavailable';

  return (
    <div className={styles.frame} onKeyDown={event => { if (event.key === 'Escape' && stop) { event.stopPropagation(); exitTour(); } }}>
      <div className={styles.bar}>
        <span className={styles.label}>3D artifact</span>
        <span className={styles.hint}>Drag to orbit · Scroll or pinch to zoom</span>
        {open ? <button className={styles.expand} type="button" aria-expanded={expanded} aria-controls={stageId} onClick={() => setExpanded(value => !value)}>{expanded ? 'Collapse viewer' : 'Expand viewer'}</button> : null}
      </div>
      <div id={stageId} className={styles.stage} data-expanded={expanded || undefined} data-lenis-prevent ref={stage}>
        <img className={styles.poster} src={media.poster} alt={media.alt} hidden={state === 'ready'} />
        {open ? <ModelViewerLoader ref={viewer} media={media} mode="inspect" active={visible} onStateChange={setState} onInspectInteraction={leaveTour} /> : (
          <button className={styles.launch} type="button" onClick={() => setOpen(true)}>Inspect model</button>
        )}
      </div>
      {showTour ? <section className={styles.tour} aria-label="Guided model tour">
        {stop && tour && tourIndex !== null ? <>
          <div className={styles.tourMeta}><span>Guided tour</span><span>{tourIndex + 1} / {tour.length}</span></div>
          <h4 ref={stopHeading} tabIndex={-1} className={styles.tourTitle}>{stop.title}</h4>
          <p className={styles.tourBody}>{stop.description}</p>
          <a className={styles.tourSource} href={stop.source} target="_blank" rel="noopener noreferrer">NASA reference <span aria-hidden="true">↗</span></a>
          <div className={styles.tourButtons}>
            <button type="button" disabled={tourIndex === 0} onClick={() => goTo(tourIndex - 1)}>Previous stop</button>
            {tourIndex < tour.length - 1
              ? <button type="button" onClick={() => goTo(tourIndex + 1)}>Next stop</button>
              : <button type="button" onClick={exitTour}>Finish tour</button>}
            <button type="button" onClick={exitTour}>Exit tour</button>
          </div>
          <p className={styles.srOnly} role="status">Stop {tourIndex + 1} of {tour.length}: {stop.title}</p>
        </> : <button ref={startButton} className={styles.tourStart} type="button" disabled={!ready} onClick={() => goTo(0)}>Take a tour</button>}
      </section> : null}
    </div>
  );
}
