import Image from 'next/image';
import Link from 'next/link';
import { loadStoryChapters } from '@/lib/story';
import { ExpeditionExperience, type ChapterDescriptor } from './ExpeditionExperience';
import styles from './Expedition.module.css';

export function Expedition() {
  const chapters = loadStoryChapters();
  const descriptors: ChapterDescriptor[] = chapters.map(({ slug, shortName, body, media }) => ({
    slug, shortName, body, media,
  }));

  return (
    <ExpeditionExperience chapters={descriptors}>
      <main className={styles.document}>
        <header id="top" className={styles.hero}>
          <div className={styles.heroImage}>
            <Image
              src="/images/hero-surveyor.webp"
              alt="An Apollo 12 astronaut examines the Surveyor 3 spacecraft on the Moon"
              fill
              preload
              sizes="100vw"
              className={styles.poster}
            />
          </div>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow} data-hero-item>A RECORD OF EXPLORATION</p>
            <h1 className={styles.heroTitle} data-hero-item>Abandoned but not Forgotten: NASA&apos;s Discarded Equipment on the Moon and Mars</h1>
            <p className={styles.subtitle} data-hero-item>{chapters.length} chapters. One journey through NASA’s record of exploration.</p>
            <a className={styles.journeyLink} href="#apollo-11" data-begin-expedition data-hero-item>Begin the expedition <span aria-hidden="true">↓</span></a>
          </div>
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
            <div className={styles.scene} data-story-scene>
              <div className={styles.stickyStage} data-story-stage>
                <div className={`${styles.beat} ${styles.opening}`}>
                  <div className={styles.panel} data-beat="opening">
                    <p className={styles.chapterNumber}>{String(index + 1).padStart(2, '0')} / {chapters.length}</p>
                    <p className={styles.eyebrow}>{chapter.body}</p>
                    <h2 id={`${chapter.slug}-title`} tabIndex={-1} className={styles.chapterTitle}>{chapter.shortName}</h2>
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

                {chapter.reading.map((passage, passageIndex) => (
                  <div key={passageIndex} className={`${styles.beat} ${styles.narrative}`}>
                    <div className={styles.panel} data-beat="reading">
                      <p className={styles.eyebrow}>{passage.heading}</p>
                      <p className={styles.summary}>{passage.text}</p>
                    </div>
                  </div>
                ))}

                <div className={`${styles.beat} ${styles.brief}`}>
                  <div className={styles.panel} data-beat="brief">
                    <h3 className={styles.focusTitle}>Mission brief</h3>
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
                      Read the full mission record <span aria-hidden="true">↗</span>
                    </Link>
                  </div>
                </div>

              </div>
            </div>
          </section>
        ))}

        <footer className={styles.footer}>
          <p className={styles.eyebrow}>NASA MISSION GALLERY</p>
          <h2 className={styles.focusTitle}>Sources &amp; credits</h2>
          <div className={styles.sourceGrid}>
            {chapters.map(chapter => (
              <section key={chapter.slug} className={styles.sourceEntry}>
                <h3>{chapter.shortName}</h3>
                <p><a href={chapter.sourceUrl} target="_blank" rel="noopener noreferrer">NASA mission record ↗</a> · Fetched <time dateTime={chapter.fetchedAt}>{chapter.fetchedAt.slice(0, 10)}</time></p>
                {chapter.media.credit && <p>{chapter.media.credit}</p>}
                {chapter.slug === 'apollo-11' && <p><a href="/models/optimized/apollo-11-license.txt">Model attribution and license</a></p>}
              </section>
            ))}
          </div>
          <a className={styles.journeyLink} href="#top" data-back-to-top>Back to the beginning <span aria-hidden="true">↑</span></a>
        </footer>
      </main>
    </ExpeditionExperience>
  );
}
