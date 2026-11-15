'use client';

import { useEffect, useRef, useState } from 'react';
import type { QuizQuestion } from '@/lib/lesson';
import styles from './MissionQuiz.module.css';

const STAGES = ['Objective', 'Spacecraft', 'Discovery'];
const BRIEFS = ['Identify the challenge', 'Match the machine to the job', 'Spot what it revealed'];
const POINTS = 100;

export function MissionQuiz({ name, questions }: { name: string; questions: QuizQuestion[] }) {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef(false);

  const debrief = index === questions.length;
  const question = questions[index];
  const feedback = !debrief && answers.length > index;
  const correctCount = answers.filter((answer, i) => answer === questions[i].correct).length;
  const points = POINTS * correctCount;
  const stageName = (i: number) => STAGES[i] ?? `Decision ${i + 1}`;
  const rank = correctCount === questions.length ? 'Mission specialist' : correctCount > 0 ? 'Mission explorer' : 'Cadet in training';

  // Focus moves to the phase heading only after an explicit action, never on mount or selection.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    heading.current?.focus();
  }, [started, index]);

  const start = () => { moveFocus.current = true; setStarted(true); };
  const commit = () => {
    if (selected === null || answers.length > index) return;
    const choice = selected;
    setAnswers(previous => previous.length === index ? [...previous, choice] : previous);
  };
  const next = () => { moveFocus.current = true; setIndex(index + 1); setSelected(null); };
  const replay = () => { moveFocus.current = true; setStarted(false); setIndex(0); setSelected(null); setAnswers([]); };

  const track = <ol className={styles.stages} aria-label="Mission stages">
    {questions.map((_, i) => {
      const done = answers.length > i;
      const right = done && answers[i] === questions[i].correct;
      return <li key={i} className={styles.stage} aria-current={started && !debrief && i === index ? 'step' : undefined} data-state={done ? (right ? 'correct' : 'missed') : undefined}>
        <span className={styles.stageNumber}>{String(i + 1).padStart(2, '0')}</span>
        <span className={styles.stageName}>{stageName(i)}</span>
        <span className={styles.stageMark} aria-hidden="true">{done ? (right ? '✓' : '✕') : ''}</span>
      </li>;
    })}
  </ol>;

  const phaseHeading = !started ? 'Mission briefing' : debrief ? 'Mission debrief' : `Decision ${index + 1} · ${stageName(index)}`;

  return <div className={styles.quiz} role="group" aria-label={`${name} mission control`} data-phase={!started ? 'briefing' : debrief ? 'debrief' : 'play'}>
    <div className={styles.hud}>
      <span className={styles.callsign}>MISSION CONTROL · {name}</span>
      <span className={styles.scoreBox}>SCORE {points} / {POINTS * questions.length}</span>
    </div>
    {track}
    <h4 ref={heading} tabIndex={-1} className={styles.phase}>{phaseHeading}</h4>

    {!started ? <div className={styles.briefing}>
      <p>Connect the mission’s challenge, spacecraft, and discoveries. Make three decisions using the field notes above.</p>
      <ul className={styles.objectives}>
        {questions.map((_, i) => <li key={i}><span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>{BRIEFS[i] ?? 'Make your call'}</li>)}
      </ul>
      <p className={styles.rules}>100 points per correct decision. No timer.</p>
      <button type="button" className={styles.action} onClick={start}>Start mission</button>
    </div> : debrief ? <div className={styles.debrief}>
      <div className={styles.medal} aria-hidden="true">
        {questions.map((_, i) => <span key={i} data-earned={i < correctCount || undefined}>★</span>)}
      </div>
      <p className={styles.rank}>{rank}</p>
      <p className={styles.score}>{points} <span>points</span></p>
      <p className={styles.result}>{correctCount} / {questions.length} correct decisions</p>
      {correctCount < questions.length ? <>
        <p>Concepts to revisit:</p>
        <ul className={styles.missed}>{questions.map((q, i) => answers[i] === q.correct ? null : <li key={i}>
          <strong>{stageName(i)}</strong> {q.feedback} <a href={q.source} target="_blank" rel="noopener noreferrer">NASA source</a>
        </li>)}</ul>
      </> : <p>You connected the mission’s challenge, spacecraft, and discoveries.</p>}
      <button type="button" className={styles.action} onClick={replay}>Replay mission</button>
    </div> : <>
      <h5 className={styles.prompt}>{question.prompt}</h5>
      <div className={styles.choices} role="group" aria-label="Choose an answer">
        {question.choices.map((choice, choiceIndex) => {
          const isCorrect = feedback && choiceIndex === question.correct;
          const isWrong = feedback && selected === choiceIndex && choiceIndex !== question.correct;
          return <button key={choice} type="button" className={styles.choice} aria-pressed={selected === choiceIndex} data-result={isCorrect ? 'correct' : isWrong ? 'incorrect' : undefined} disabled={feedback} onClick={() => setSelected(choiceIndex)}>
            <span className={styles.letter}>{String.fromCharCode(65 + choiceIndex)}</span>
            <span className={styles.choiceText}>{choice}</span>
            {isCorrect && <span className={styles.resultTag}><span aria-hidden="true">✓ </span>Correct answer</span>}
            {isWrong && <span className={styles.resultTag}><span aria-hidden="true">✕ </span>Your choice</span>}
          </button>;
        })}
      </div>
      <div className={styles.feedback} role="status" data-empty={!feedback || undefined} data-correct={(feedback && answers[index] === question.correct) || undefined}>
        {feedback ? <>
          <strong>{answers[index] === question.correct ? `Decision confirmed · +${POINTS} points` : 'Course correction · +0 points'}</strong>
          <p>{question.feedback}</p>
          <a href={question.source} target="_blank" rel="noopener noreferrer">NASA source</a>
        </> : null}
      </div>
      {feedback
        ? <button type="button" className={styles.action} onClick={next}>{index === questions.length - 1 ? 'View debrief' : 'Next stage'}</button>
        : <button type="button" className={styles.action} disabled={selected === null} onClick={commit}>Commit decision</button>}
    </>}
    <noscript><div className={styles.noScript}>{questions.map((q, i) => <details key={i}><summary>{i + 1}. {q.prompt}</summary><p>{q.choices[q.correct]}. {q.feedback} <a href={q.source} target="_blank" rel="noopener noreferrer">NASA source</a></p></details>)}</div></noscript>
  </div>;
}
