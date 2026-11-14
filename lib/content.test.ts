import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePage } from './content.ts';

const page = {
  source_url: 'https://x',
  final_url: 'https://x',
  fetched_at: '2026-01-01T00:00:00Z',
  title: 'Dawn - NASA',
  text: 'Explore This Section\nDawn\nType\nOrbiter\nLaunch\nSept. 27, 2007\nUnable to render the provided source\nIntro para\nKey Dates\nA\tB\nC\tD\nLatest News\nNoise',
  headings: [
    { level: 1, text: 'Dawn' },
    { level: 2, text: 'Key Dates' },
    { level: 2, text: '' },
  ],
  links: [
    { text: 'Article2 Min ReadFoo', url: 'https://x/1' },
    { text: '', url: 'https://x/img.jpg' },
    { text: 'Foo', url: 'https://x/1' },
  ],
};

test('normalizePage extracts facts, sections, links and strips noise', () => {
  const n = normalizePage(page);
  assert.equal(n.h1, 'Dawn');
  assert.deepEqual(n.facts, [
    { label: 'Type', value: 'Orbiter' },
    { label: 'Launch', value: 'Sept. 27, 2007' },
  ]);
  assert.deepEqual(n.sections, [
    { heading: null, level: 1, blocks: [{ kind: 'p', text: 'Intro para' }] },
    { heading: 'Key Dates', level: 2, blocks: [{ kind: 'table', rows: [['A', 'B'], ['C', 'D']] }] },
  ]);
  const text = JSON.stringify(n.sections);
  for (const bad of ['Noise', 'Explore This Section', 'Unable to render']) assert.ok(!text.includes(bad), bad);
  assert.deepEqual(n.links, [{ label: 'Foo', url: 'https://x/1' }]);
  assert.equal(n.fullText, page.text);
});

test('card tails stay in fullText but not normalized sections', () => {
  for (const tail of ['Explore All', 'Mars Stories', 'Mars News and Features']) {
    const text = `Dawn\nScientific Article remains intact.\n${tail}\nCard title\n3 Min Read`;
    const normalized = normalizePage({ ...page, text });
    assert.deepEqual(normalized.sections, [{ heading: null, level: 1, blocks: [{ kind: 'p', text: 'Scientific Article remains intact.' }] }]);
    assert.equal(normalized.fullText, text);
  }
});
