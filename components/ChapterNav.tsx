'use client';

import { type MouseEvent } from 'react';
import styles from './ChapterNav.module.css';

export type ChapterNavProps = {
  chapters: readonly { slug: string; shortName: string }[];
  activeSlug: string | null;
  outsideRoot?: boolean;
};

export function ChapterNav({ chapters, activeSlug, outsideRoot = false }: ChapterNavProps) {
  const activeIndex = chapters.findIndex((chapter) => chapter.slug === activeSlug);
  const activeChapter = chapters[activeIndex];
  const firstChapter = chapters[0];
  const chapterHref = (slug: string) => `${outsideRoot ? '/' : ''}#${slug}`;

  const onChapterClick = (event: MouseEvent<HTMLAnchorElement>, slug: string) => {
    if (
      outsideRoot || event.defaultPrevented || event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    ) return;

    // Leave the fragment, history entry and scrolling to the browser.
    requestAnimationFrame(() => {
      if (window.location.hash === `#${slug}`) {
        document.getElementById(`${slug}-title`)?.focus({ preventScroll: true });
      }
    });
  };

  return (
    <header className={styles.header} data-immersive={!outsideRoot || undefined}>
      {firstChapter && (
        <a
          className={styles.skip}
          href={chapterHref(firstChapter.slug)}
          onClick={(event) => onChapterClick(event, firstChapter.slug)}
        >
          Skip to the first chapter
        </a>
      )}
      <nav className={styles.nav} aria-label="Expedition">
        <a className={styles.home} href={outsideRoot ? '/#top' : '#top'} aria-label="NASA Gallery home">
          NASA <span>Gallery</span>
        </a>
        <div className={styles.current}>
          <span className={styles.currentName} title={activeChapter?.shortName}>
            {activeChapter?.shortName ?? 'The expedition'}
          </span>
          <span className={styles.count}>
            <span className={styles.visuallyHidden}>Chapter </span>
            {String(activeIndex + 1).padStart(2, '0')} / {String(chapters.length).padStart(2, '0')}
          </span>
        </div>
      </nav>
    </header>
  );
}
