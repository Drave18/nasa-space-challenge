'use client';

import Link from 'next/link';
import { useRef, type KeyboardEvent } from 'react';
import type { MissionEntry } from '@/lib/catalog';
import styles from './MissionDock.module.css';

export function MissionDock({ entries, current }: { entries: MissionEntry[]; current: string }) {
  const nav = useRef<HTMLElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const chips = Array.from(nav.current?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
    const i = chips.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    e.preventDefault();
    const next = chips[(i + (e.key === 'ArrowRight' ? 1 : chips.length - 1)) % chips.length];
    next.focus();
    next.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  };

  return (
    <nav ref={nav} className={styles.dock} aria-label="Missions" onKeyDown={onKeyDown}>
      {entries.map((e) => (
        <Link key={e.slug} href={`/mission/${e.slug}`} className={styles.chip} aria-current={e.slug === current ? 'page' : undefined}>
          <span className={styles.name}>{e.shortName}</span>
          <span className={styles.meta}>
            <span>{e.body}</span>
            <span className={styles.badge}>{e.media.kind === 'model' ? '3D' : 'IMG'}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
