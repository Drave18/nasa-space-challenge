import Image from 'next/image';
import Link from 'next/link';
import { loadStoryChapters } from '@/lib/story';
import { loadMissionLessons } from '@/lib/lesson';
import { ExpeditionExperience, type ChapterDescriptor } from './ExpeditionExperience';
import { LessonTimeline } from './LessonTimeline';
import { LessonInspect } from './LessonInspect';
import { MissionQuiz } from './MissionQuiz';
import styles from './Expedition.module.css';
import lessonStyles from './Lesson.module.css';

export function Expedition() {
  const chapters = loadStoryChapters();
  const lessons = loadMissionLessons();
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
            <p className={styles.subtitle} data-hero-item>{chapters.length} chapters trace a journey from the Moon and Mars to asteroids, the outer planets, and the search for worlds around other stars. Discover the challenges these missions faced, the machines built to meet them, and what their observations revealed. Long after crews depart or signals fall silent, the equipment, returned samples, and recorded data preserve a history of exploration that scientists can continue to study.</p>
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

                <div className={`${styles.beat} ${styles.narrative}`}>
                  <div className={styles.panel} data-beat="reading">
                    <p className={styles.eyebrow}>THE CHALLENGE</p>
                    <h3 className={styles.focusTitle}>{lessons[index].headings.idea}</h3>
                    <p className={styles.summary}>{lessons[index].idea}</p>
                    <a className={styles.recordLink} href={`#${chapter.slug}-lesson`}>Keep exploring <span aria-hidden="true">↓</span></a>
                  </div>
                </div>

              </div>
            </div>
            <div id={`${chapter.slug}-lesson`} className={lessonStyles.lesson}>
              <nav className={lessonStyles.guide} aria-label={`${chapter.shortName} field guide`}>
                <ul>
                  <li><a href={`#${chapter.slug}-journey`}>Trace the journey</a></li>
                  <li><a href={`#${chapter.slug}-craft`}>Inspect the craft</a></li>
                  <li><a href={`#${chapter.slug}-learned`}>See what remained</a></li>
                  <li><a href={`#${chapter.slug}-quiz`}>Take command</a></li>
                </ul>
              </nav>
              <section className={lessonStyles.step} aria-labelledby={`${chapter.slug}-journey`}>
                <div className={lessonStyles.headingGroup} data-reading-reveal><span className={lessonStyles.marker} aria-hidden="true">01</span><h3 id={`${chapter.slug}-journey`} tabIndex={-1}>Follow the journey</h3></div>
                <p>Choose a moment to see how this mission unfolded.</p>
                <LessonTimeline milestones={lessons[index].milestones} name={chapter.shortName} />
              </section>
              <section className={lessonStyles.step} aria-labelledby={`${chapter.slug}-craft`}>
                <div className={lessonStyles.headingGroup} data-reading-reveal><span className={lessonStyles.marker} aria-hidden="true">02</span><h3 id={`${chapter.slug}-craft`} tabIndex={-1}>{lessons[index].headings.craft}</h3></div>
                {lessons[index].craft.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
                {chapter.media.kind === 'model' ? <LessonInspect media={chapter.media} slug={chapter.slug} /> : <figure className={lessonStyles.still}><img src={chapter.media.src} alt={chapter.media.alt} loading="lazy" />{chapter.media.credit && <figcaption>{chapter.media.credit}</figcaption>}</figure>}
              </section>
              <section className={lessonStyles.step} aria-labelledby={`${chapter.slug}-learned`}>
                <div className={lessonStyles.headingGroup} data-reading-reveal><span className={lessonStyles.marker} aria-hidden="true">03</span><h3 id={`${chapter.slug}-learned`} tabIndex={-1}>{lessons[index].headings.learned}</h3></div>
                {lessons[index].learned.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
              </section>
              <section className={lessonStyles.step} aria-labelledby={`${chapter.slug}-quiz`}>
                <div className={lessonStyles.headingGroup} data-reading-reveal><span className={lessonStyles.marker} aria-hidden="true">04</span><h3 id={`${chapter.slug}-quiz`} tabIndex={-1}>Your mission challenge</h3></div>
                <MissionQuiz name={chapter.shortName} questions={lessons[index].quiz} />
                <Link className={styles.recordLink} href={`/mission/${chapter.slug}`} prefetch={false}>Explore the full mission <span aria-hidden="true">↗</span></Link>
              </section>
            </div>
          </section>
        ))}

        <footer className={styles.footer}>
          <p className={styles.eyebrow}>NASA MISSION GALLERY</p>
          <h2 className={styles.focusTitle}>Sources &amp; credits</h2>
          <div className={styles.sourceGrid}>
            {chapters.map((chapter, index) => (
              <section key={chapter.slug} className={styles.sourceEntry}>
                <h3>{chapter.shortName}</h3>
                <p><a href={chapter.sourceUrl} target="_blank" rel="noopener noreferrer">NASA mission record ↗</a> · Fetched <time dateTime={chapter.fetchedAt}>{chapter.fetchedAt.slice(0, 10)}</time></p>
                {Array.from(new Set([...Object.values(lessons[index].sources), ...lessons[index].milestones.map(moment => moment.source)]))
                  .filter(url => url !== chapter.sourceUrl)
                  .map((url, sourceIndex) => <p key={url}><a href={url} target="_blank" rel="noopener noreferrer">Additional NASA reference {sourceIndex + 1} ↗</a></p>)}
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
