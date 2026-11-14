'use client';

import { useRef, type KeyboardEvent, type MouseEvent } from 'react';
import styles from './ChapterNav.module.css';

export type ChapterNavProps = {
  chapters: readonly { slug: string; shortName: string }[];
  activeSlug: string | null;
  outsideRoot?: boolean;
};

export function ChapterNav({ chapters, activeSlug, outsideRoot = false }: ChapterNavProps) {
  const menu = useRef<HTMLDetailsElement>(null);
  const activeIndex = chapters.findIndex((chapter) => chapter.slug === activeSlug);
  const activeChapter = chapters[activeIndex];
  const firstChapter = chapters[0];
  const chapterHref = (slug: string) => `${outsideRoot ? '/' : ''}#${slug}`;

  const onChapterClick = (event: MouseEvent<HTMLAnchorElement>, slug: string) => {
    if (menu.current) menu.current.open = false;
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

  const onChapterKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    if (
      (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    ) return;
    const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('a'));
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (index < 0) return;
    event.preventDefault();
    const next = links[(index + (event.key === 'ArrowRight' ? 1 : links.length - 1)) % links.length];
    next.focus();
    next.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  };

  return (
    <header className={styles.header}>
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
        <details ref={menu} className={styles.menu}>
          <summary className={styles.summary}>Chapters</summary>
          <ol className={styles.chapters} onKeyDown={onChapterKeyDown}>
            {chapters.map((chapter, index) => (
              <li key={chapter.slug}>
                <a
                  className={styles.chapter}
                  href={chapterHref(chapter.slug)}
                  aria-current={chapter.slug === activeSlug ? 'location' : undefined}
                  onClick={(event) => onChapterClick(event, chapter.slug)}
                >
                  <span className={styles.chapterNumber} aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>{chapter.shortName}</span>
                </a>
              </li>
            ))}
          </ol>
        </details>
      </nav>
    </header>
  );
}
