import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMission, CATALOG } from './catalog.ts';
import { buildStoryChapter, loadStoryChapters, mergeMissionFacts, storyPassages, groupPassages } from './story.ts';

const chapter = (slug: string) => buildStoryChapter(loadMission(slug)!);
test('story follows catalog order and selects factual source paragraphs', () => {
  assert.deepEqual(loadStoryChapters().map(c => c.slug), CATALOG.map(c => c.slug));
  assert.match(chapter('surveyor-3').summary, /^NASA's Surveyor 3 was the second/);
  assert.match(chapter('insight').summary, /^InSight studied the deep interior/);
  assert.match(chapter('dawn').summary, /^Dawn was NASA’s first truly interplanetary/);
  assert.equal(loadMission('nssdca'), undefined);
  for (const c of loadStoryChapters()) assert.doesNotMatch(c.summary, /Occurred|Unable to render|Min Read|Image Article/);
});
test('sentence excerpts retain personal initials and abbreviated dates', () => {
  assert.match(chapter('apollo-11').summary, /Neil A\. Armstrong/);
  assert.doesNotMatch(chapter('ingenuity').focus!.text, /Jan\.$/);
});
test('configured missing sections fail with the mission and heading', () => {
  const mission = loadMission('insight')!;
  mission.page.sections = [];
  assert.throws(() => buildStoryChapter(mission), /insight:.*Science/);
});
test('facts deduplicate launch and status and preserve multi-craft sites', () => {
  const mission = loadMission('mars-pathfinder')!;
  const facts = mergeMissionFacts(mission.page, mission.records);
  assert.equal(facts.filter(f => /^launch/i.test(f.label)).length, 1);
  for (const record of mission.records) assert.ok(facts.some(f => f.label.includes(record.craft_name) && f.value === record.landing_site));
  const rovers = loadMission('mars-exploration-rovers')!;
  const records = rovers.records.map((r, i) => ({ ...r, landing_site: ['Gusev Crater', 'Meridiani Planum'][i] }));
  const page = { ...rovers.page, facts: [{label: 'Launch date', value: 'first'}, {label: 'LAUNCH', value: 'duplicate'}, {label: 'Status', value: 'Ended'}, {label: 'status', value: 'duplicate'}] };
  const merged = mergeMissionFacts(page, records);
  assert.equal(merged.filter(f => f.label.toLowerCase() === 'launch').length, 1);
  assert.equal(merged.filter(f => /^status/i.test(f.label)).length, 1);
  for (const record of records) assert.ok(merged.some(f => f.label.includes(record.craft_name) && f.value === record.landing_site));
  assert.ok(!mergeMissionFacts({ ...page, facts: [] }, records.map(r => ({ ...r, operational_status: 'unknown' as const }))).some(f => /^status/i.test(f.label)));
});

test('caption passages preserve the source text and personal initials', () => {
  for (const chapter of loadStoryChapters()) {
    for (const text of [chapter.summary, chapter.focus?.text].filter(Boolean) as string[]) {
      assert.equal(storyPassages(text).join(' ').replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
    }
  }
  assert.deepEqual(storyPassages('Neil A. Armstrong landed. The mission continued.'), [
    'Neil A. Armstrong landed.', 'The mission continued.',
  ]);
});

test('mission reading beats retain complete source sentences', () => {
  for (const chapter of loadStoryChapters()) {
    assert.ok(chapter.reading.length >= 2, chapter.slug);
    assert.equal(chapter.reading[0].text, groupPassages(chapter.summary)[0]);
    assert.ok(chapter.reading.every(beat => beat.text.length > 0));
  }
  assert.deepEqual(groupPassages('First sentence. Second sentence.', 20), ['First sentence.', 'Second sentence.']);
});
