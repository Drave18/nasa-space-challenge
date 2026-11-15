'use client';

import { useState } from 'react';
import type { QuizQuestion } from '@/lib/lesson';
import styles from './MissionQuiz.module.css';

export function MissionQuiz({ name, questions }: { name: string; questions: QuizQuestion[] }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const finished = index === questions.length;
  const question = questions[index];
  const submitted = answers.length > index;
  const score = answers.filter((answer, i) => answer === questions[i].correct).length;
  const reset = () => { setIndex(0); setSelected(null); setAnswers([]); };
  return <div className={styles.quiz} aria-label={`${name} quiz`}>
    <div className={styles.top}><span>MISSION CHALLENGE · {name}</span><span aria-live="polite">{finished ? 'COMPLETE' : `QUESTION ${index + 1} / ${questions.length}`}</span></div>
    <div className={styles.track} aria-hidden="true"><span style={{ width: `${(finished ? 1 : index / questions.length) * 100}%` }} /></div>
    {finished ? <div className={styles.finish}>
      <p className={styles.score}>{score} <span>/ {questions.length}</span></p>
      <h4>{score === questions.length ? 'You explored it all!' : 'Nice work, explorer.'}</h4>
      <p>{score === questions.length ? 'You connected the mission’s challenge, spacecraft, and discovery.' : 'Every mission is a chance to learn something new. Here are the ideas to revisit:'}</p>
      {score < questions.length && <ul>{questions.map((q, i) => answers[i] === q.correct ? null : <li key={i}>{q.feedback}</li>)}</ul>}
      <button type="button" className={styles.action} onClick={reset}>Try again ↺</button>
    </div> : <>
      <h4>{question.prompt}</h4>
      <div className={styles.choices} role="group" aria-label="Choose an answer">
        {question.choices.map((choice, choiceIndex) => <button key={choice} type="button" className={styles.choice} aria-pressed={selected === choiceIndex} data-result={submitted ? choiceIndex === question.correct ? 'correct' : selected === choiceIndex ? 'incorrect' : undefined : undefined} disabled={submitted} onClick={() => setSelected(choiceIndex)}><span className={styles.letter}>{String.fromCharCode(65 + choiceIndex)}</span><span>{choice}</span>{submitted && choiceIndex === question.correct && <span className={styles.resultIcon} aria-hidden="true">✓</span>}{submitted && selected === choiceIndex && choiceIndex !== question.correct && <span className={styles.resultIcon} aria-hidden="true">✕</span>}</button>)}
      </div>
      {submitted && <div className={styles.feedback} role="status"><strong>{answers[index] === question.correct ? 'That’s it! ✓' : 'Good try. Here’s the idea:'}</strong><p>{question.feedback}</p></div>}
      {!submitted ? <button type="button" className={styles.action} disabled={selected === null} onClick={() => { if (selected !== null) setAnswers([...answers, selected]); }}>Check answer</button> : <button type="button" className={styles.action} onClick={() => { setIndex(index + 1); setSelected(null); }}>{index === questions.length - 1 ? 'See my results' : 'Next question →'}</button>}
    </>}
    <noscript><div className={styles.noScript}>{questions.map((q, i) => <details key={i}><summary>{i + 1}. {q.prompt}</summary><p>{q.choices[q.correct]}. {q.feedback}</p></details>)}</div></noscript>
  </div>;
}
