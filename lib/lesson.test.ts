import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from './catalog.ts';
import { loadMissionLessons } from './lesson.ts';

const wordCount = (text: string) => text.trim().split(/\s+/).length;
const validSource = (source: string) => {
  const url = new URL(source);
  return url.protocol === 'https:' && (url.hostname === 'nasa.gov' || url.hostname.endsWith('.nasa.gov'));
};

test('all missions have expanded lessons, sourced moments and three distinct quiz questions', () => {
  const lessons = loadMissionLessons();
  assert.deepEqual(lessons.map(l => l.slug), CATALOG.map(e => e.slug));
  for (const lesson of lessons) {
    assert.ok(wordCount(lesson.idea) >= 70 && wordCount(lesson.idea) <= 90, `${lesson.slug}: challenge length`);
    for (const paragraphs of [lesson.craft, lesson.learned]) {
      assert.equal(paragraphs.length, 2, `${lesson.slug}: two readable paragraphs`);
      assert.ok(paragraphs.every(text => text.trim().length > 0));
      const words = wordCount(paragraphs.join(' '));
      assert.ok(words >= 90 && words <= 120, `${lesson.slug}: ${words} words`);
      assert.equal(new Set(paragraphs).size, 2, `${lesson.slug}: distinct paragraphs`);
    }
    for (const text of [lesson.idea, ...lesson.craft, ...lesson.learned]) {
      assert.doesNotMatch(text, /\b(?:kg|COSPAR|NSSDCA|Funding Agency)\b/i);
    }
    assert.ok(Object.values(lesson.sources).every(validSource), lesson.slug);
    assert.ok(lesson.milestones.length >= 2 && lesson.milestones.length <= 4, lesson.slug);
    for (const moment of lesson.milestones) {
      assert.ok(validSource(moment.source), lesson.slug);
      assert.ok(wordCount(moment.explanation) >= 30 && wordCount(moment.explanation) <= 50, `${lesson.slug}: ${moment.title} length`);
    }
    assert.equal(lesson.quiz.length, 3, lesson.slug);
    assert.equal(new Set(lesson.quiz.map(q => q.prompt)).size, 3, lesson.slug);
    for (const q of lesson.quiz) {
      assert.equal(q.choices.length, 3);
      assert.equal(new Set(q.choices).size, 3);
      assert.ok(q.correct >= 0 && q.correct < 3);
      assert.ok(q.feedback.length > 20);
      assert.ok(validSource(q.source), `${lesson.slug}: ${q.source}`);
    }
  }
});

test('mission-specific ideas keep twin rovers and science results distinct', () => {
  const lessons = loadMissionLessons();
  const rovers = lessons.find(l => l.slug === 'mars-exploration-rovers')!;
  assert.match(rovers.craft.join(' '), /Spirit and Opportunity/);
  assert.ok(rovers.milestones.some(m => m.title.includes('Spirit')));
  assert.ok(rovers.milestones.some(m => m.title.includes('Opportunity')));
  assert.match(lessons.find(l => l.slug === 'viking-1')!.learned.join(' '), /did not settle/);
  assert.match(lessons.find(l => l.slug === 'ingenuity')!.learned.join(' '), /72 flights/);
  assert.match(lessons.find(l => l.slug === 'insight')!.learned.join(' '), /could not complete/);
  const k2 = lessons.find(l => l.slug === 'kepler')!.milestones.find(m => m.title === 'K2 begins')!;
  assert.equal(k2.date, 'May 2014');
  assert.equal(k2.source, 'https://science.nasa.gov/mission/kepler/in-depth/');
});
