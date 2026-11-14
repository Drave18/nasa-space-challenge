import Image from 'next/image';
import Link from 'next/link';
import { loadStoryChapters } from '@/lib/story';
import { ExpeditionExperience, type ChapterDescriptor } from './ExpeditionExperience';
import styles from './Expedition.module.css';

export function Expedition() {
  const chapters = loadStoryChapters();
  const lead = chapters[0];
  const descriptors: ChapterDescriptor[] = chapters.map(({ slug, shortName, body, media }) => ({
    slug, shortName, body, media,
  }));

  return (
    <ExpeditionExperience chapters={descriptors}>
      <main className={styles.document}>
        <header id="top" className={styles.hero}>
          <div className={styles.heroImage}>
            <Image
              src={lead.media.kind === 'model' ? lead.media.poster : lead.media.src}
              alt={lead.media.alt}
              fill
              preload
              sizes="(min-width: 900px) 70vw, 100vw"
              className={styles.poster}
            />
          </div>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>NASA MISSION GALLERY</p>
            <h1 className={styles.heroTitle}>Beyond our world</h1>
            <p className={styles.subtitle}>Fourteen chapters. One journey through NASA’s record of exploration.</p>
            <a className={styles.journeyLink} href="#apollo-11">Begin the expedition <span aria-hidden="true">↓</span></a>
          </div>
          {lead.media.credit && <p className={styles.heroCredit}>{lead.media.credit}</p>}
        </header>

        {chapters.map((chapter, index) => (
          <section
            key={chapter.slug}
            id={chapter.slug}
            data-chapter={chapter.slug}
            data-destination={chapter.body}
            aria-labelledby={`${chapter.slug}-title`}
            className={styles.chapter}
          >
            <div className={`${styles.beat} ${styles.opening}`}>
              <div className={styles.panel} data-beat="opening">
                <p className={styles.chapterNumber}>{String(index + 1).padStart(2, '0')} / {chapters.length}</p>
                <p className={styles.eyebrow}>{chapter.body}</p>
                <h2 id={`${chapter.slug}-title`} tabIndex={-1} className={styles.chapterTitle}>{chapter.title}</h2>
                <p className={styles.mediaType}>{chapter.media.kind === 'model' ? '3D' : 'IMAGE'}</p>
              </div>
            </div>

            <noscript>
              <figure className={styles.fallback}>
                <img
                  src={chapter.media.kind === 'model' ? chapter.media.poster : chapter.media.src}
                  alt={chapter.media.alt}
                  loading="lazy"
                  decoding="async"
                />
                {chapter.media.credit && <figcaption>{chapter.media.credit}</figcaption>}
              </figure>
            </noscript>

            <div className={`${styles.beat} ${styles.narrative}`}>
              <div className={styles.panel} data-beat="summary">
                <p className={styles.summary}>{chapter.summary}</p>
              </div>
            </div>

            {chapter.focus && (
              <div className={`${styles.beat} ${styles.narrative}`}>
                <div className={styles.panel} data-beat="focus">
                  <h3 className={styles.focusTitle}>{chapter.focus.heading}</h3>
                  <p className={styles.excerpt}>{chapter.focus.text}</p>
                </div>
              </div>
            )}

            <div className={`${styles.beat} ${styles.brief}`}>
              <div className={styles.panel} data-beat="brief">
                <h3 className={styles.eyebrow}>Mission brief</h3>
                {chapter.facts.length > 0 ? (
                  <dl className={styles.facts}>
                    {chapter.facts.map(fact => (
                      <div key={fact.label}>
                        <dt>{fact.label}</dt>
                        <dd>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : <p className={styles.excerpt}>{chapter.summary}</p>}
                <Link className={styles.recordLink} href={`/mission/${chapter.slug}`} prefetch={false}>
                  {chapter.slug === 'nssdca' ? 'Explore the archive record' : 'Read the full mission record'}
                  {' '}<span aria-hidden="true">↗</span>
                </Link>
                <div className={styles.sources}>
                  {chapter.media.credit && <p>{chapter.media.credit}</p>}
                  {chapter.slug === 'apollo-11' && (
                    <p><a href="/models/optimized/apollo-11-license.txt" target="_blank" rel="noopener noreferrer">Model attribution and license</a></p>
                  )}
                  <p>Source: <a href={chapter.sourceUrl} target="_blank" rel="noopener noreferrer">{chapter.sourceUrl}</a></p>
                  <p>Fetched <time dateTime={chapter.fetchedAt}>{chapter.fetchedAt.slice(0, 10)}</time></p>
                </div>
              </div>
            </div>
          </section>
        ))}

        <footer className={styles.footer}>
          <p className={styles.eyebrow}>NASA MISSION GALLERY</p>
          <a className={styles.journeyLink} href="#top">Back to the beginning <span aria-hidden="true">↑</span></a>
        </footer>
      </main>
    </ExpeditionExperience>
  );
}
