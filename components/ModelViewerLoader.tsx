'use client';

import dynamic from 'next/dynamic';
import type { ModelViewerProps } from './ModelViewer';

const ModelViewer = dynamic(() => import('./ModelViewer').then((m) => m.ModelViewer), {
  ssr: false,
  loading: () => null,
});

export function ModelViewerLoader(props: ModelViewerProps) {
  return <ModelViewer {...props} />;
}

export function preloadModelViewer(): Promise<void> {
  return import('./ModelViewer').then(() => undefined);
}
