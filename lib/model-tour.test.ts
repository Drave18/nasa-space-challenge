import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from './catalog.ts';
import { loadMissionLessons } from './lesson.ts';
import { buildModelTour, firstSentence } from './model-tour.ts';

test('every model mission tours front, side and overhead with sourced first sentences', () => {
  const lessons = loadMissionLessons();
  let models = 0;
  CATALOG.forEach((entry, index) => {
    if (entry.media.kind !== 'model') return;
    models++;
    const lesson = lessons[index];
    const tour = buildModelTour(lesson);
    assert.deepEqual(tour.map(stop => stop.view), ['front', 'side', 'top']);
    assert.equal(tour[0].description, firstSentence(lesson.craft[0]));
    assert.equal(tour[1].description, firstSentence(lesson.craft[1]));
    assert.equal(tour[2].description, firstSentence(lesson.learned[0]));
    assert.deepEqual(tour.map(stop => stop.source), [lesson.sources.craft, lesson.sources.craft, lesson.sources.learned]);
    for (const stop of tour) {
      assert.ok(stop.description.length > 0 && lesson.craft.concat(lesson.learned).some(p => p.startsWith(stop.description)), entry.slug);
    }
  });
  assert.equal(models, 8);
});

test('first sentence extraction handles missing punctuation and abbreviations-free text', () => {
  assert.equal(firstSentence('No terminal punctuation here'), 'No terminal punctuation here');
  assert.equal(firstSentence('One. Two.'), 'One.');
  assert.equal(firstSentence('Version 1.5 flew. Next.'), 'Version 1.5 flew.');
});
