import type { LessonMilestone } from '@/lib/lesson';
import styles from './Lesson.module.css';

export function LessonTimeline({ milestones, name }: { milestones: LessonMilestone[]; name: string }) {
  return <ol className={styles.moments} aria-label={`${name} timeline`}>
    {milestones.map(event => <li key={`${event.date}-${event.title}`} className={styles.moment}>
      <p className={styles.pagerDate}>{event.date}</p>
      <h4 className={styles.pagerTitle}>{event.title}</h4>
      <p className={styles.pagerBody}>{event.explanation}</p>
      <a className={styles.sourceLink} href={event.source} target="_blank" rel="noopener noreferrer">Read the NASA reference <span className={styles.arrow} aria-hidden="true">↗</span></a>
    </li>)}
  </ol>;
}
