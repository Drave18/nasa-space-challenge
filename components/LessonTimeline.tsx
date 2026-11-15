'use client';

import { useState } from 'react';
import type { LessonMilestone } from '@/lib/lesson';
import styles from './Lesson.module.css';

export function LessonTimeline({ milestones, name }: { milestones: LessonMilestone[]; name: string }) {
  const [selected, setSelected] = useState(0);
  return <div className={styles.timeline} aria-label={`${name} timeline`}>
    <div className={styles.timelineChoices} role="group" aria-label="Choose a milestone">
      {milestones.map((event, index) => <button key={`${event.date}-${event.title}`} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}>
        <span>{event.date}</span><strong>{event.title}</strong>
      </button>)}
    </div>
    <div className={styles.timelineDetail} aria-live="polite"><p>{milestones[selected].explanation}</p></div>
    <noscript><ol>{milestones.map((event, index) => <li key={index}><strong>{event.date}: {event.title}</strong> — {event.explanation}</li>)}</ol></noscript>
  </div>;
}
