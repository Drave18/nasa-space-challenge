import { CATALOG, loadMission, type LoadedMission, type Media } from './catalog.ts';
import type { Fact, NormalizedPage, Section } from './content.ts';
import type { MissionRecord } from './missions.ts';

export interface StoryChapter {
  slug: string;
  title: string;
  shortName: string;
  body: string;
  media: Media;
  summary: string;
  focus: { heading: string; text: string } | null;
  reading: { heading: string; text: string }[];
  facts: Fact[];
  sourceUrl: string;
  fetchedAt: string;
}

const headings: Record<string, [string | null, string | null]> = {
  'apollo-11': ['Description', 'Early Apollo Surface Experiments Package (EASEP)'],
  'apollo-12': ['Description', 'Apollo Lunar Surface Experiments Package (ALSEP)'],
  'apollo-15': ['Description', 'Apollo Lunar Surface Experiments Package (ALSEP)'],
  'surveyor-3': ['What was Surveyor 3?', 'In Depth: Surveyor 3'],
  'viking-1': ['What was Viking 1?', 'Results'],
  'mars-pathfinder': [null, 'Airbag Landing'],
  'mars-exploration-rovers': [null, 'Science'],
  insight: ['Science', 'Meet InSight'],
  ingenuity: [null, 'The Legacy of Ingenuity'],
  'pioneer-10': ['What was Pioneer 10?', 'In Depth: Pioneer 10'],
  'near-shoemaker': ['What was NEAR Shoemaker?', 'In Depth: NEAR Shoemaker'],
  dawn: [null, null],
  kepler: [null, 'Legacy'],
};
const sentences = new Intl.Segmenter('en', { granularity: 'sentence' });
function excerpt(slug: string, sections: Section[], heading: string | null): string {
  const section = sections.find(s => s.heading === heading);
  const paragraph = section?.blocks.find(b => b.kind === 'p' && b.text.length >= 80 && !/^(Occurred\b|Unable to render|Embed\b|\d+ Min Read|Image Article|Article\b)/i.test(b.text));
  if (!paragraph || paragraph.kind !== 'p') throw new Error(`${slug}: missing story paragraph in ${heading ?? 'overview'}`);
  const complete: string[] = [];
  let pending = '';
  for (const { segment } of sentences.segment(paragraph.text)) {
    pending += segment;
    // ICU also splits personal initials and abbreviated months; neither ends a sentence.
    if (/\b(?:[A-Z]|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.\s*$/.test(pending)) continue;
    complete.push(pending);
    pending = '';
    if (complete.length === 2) break;
  }
  if (pending && complete.length < 2) complete.push(pending);
  return complete.join('').trim();
}

export function mergeMissionFacts(page: NormalizedPage, records: MissionRecord[]): Fact[] {
  const facts: Fact[] = [];
  const seen = new Set<string>();
  const add = (label: string, value: string) => {
    const normalized = /^launch date$/i.test(label) ? 'Launch' : label;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    facts.push({ label: normalized, value });
  };
  for (const fact of page.facts) add(fact.label, fact.value);
  const pageStatus = seen.has('status');
  for (const record of records) {
    if (record.launch_date) add('Launch', record.launch_date);
    if (record.landing_site) add(records.length > 1 ? `Landing site — ${record.craft_name}` : 'Landing site', record.landing_site);
    if (!pageStatus && record.operational_status !== 'unknown') {
      add(records.length > 1 ? `Status — ${record.craft_name}` : 'Status', record.operational_status);
    }
  }
  return facts;
}

export function buildStoryChapter({ entry, page, records }: LoadedMission): StoryChapter {
  const selection = headings[entry.slug];
  if (!selection) throw new Error(`${entry.slug}: no story heading configuration`);
  const [summaryHeading, focusHeading] = selection;
  const summary = excerpt(entry.slug, page.sections, summaryHeading);
  const focus = focusHeading ? { heading: focusHeading, text: excerpt(entry.slug, page.sections, focusHeading) } : null;
  const overview = page.sections.find(section => section.heading === summaryHeading)?.blocks
    .find(block => block.kind === 'p' && block.text.startsWith(summary));
  const remainder = overview?.kind === 'p' ? overview.text.slice(summary.length).trim() : '';
  const details = focus ?? (remainder ? { heading: 'The mission', text: remainder } : null);
  const reading = groupPassages(summary).map(text => ({ heading: 'The mission', text }));
  if (details && details.text !== summary) {
    const detailText = details.text.replace(/^This artist concept[^.!?]*[.!?]\s*/i, '');
    for (const text of groupPassages(detailText)) reading.push({ heading: details.heading, text });
  }
  return {
    slug: entry.slug, title: page.h1, shortName: entry.shortName, body: entry.body, media: entry.media,
    summary, focus, reading,
    facts: mergeMissionFacts(page, records).slice(0, 4), sourceUrl: page.sourceUrl, fetchedAt: page.fetchedAt,
  };
}

export function loadStoryChapters(): StoryChapter[] {
  return CATALOG.map(entry => buildStoryChapter(loadMission(entry.slug)!));
}

// Keep personal initials and month abbreviations attached to their sentence.
export function storyPassages(text: string): string[] {
  const passages: string[] = [];
  let pending = '';
  for (const { segment } of sentences.segment(text)) {
    pending += segment;
    if (/\b(?:[A-Z]|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.\s*$/.test(pending)) continue;
    passages.push(pending.trim());
    pending = '';
  }
  if (pending.trim()) passages.push(pending.trim());
  return passages;
}

// Group complete sentences into readable beats without cutting source text.
export function groupPassages(text: string, limit = 300): string[] {
  const groups: string[] = [];
  let current = '';
  for (const sentence of storyPassages(text)) {
    if (current && current.length + sentence.length + 1 > limit) {
      groups.push(current);
      current = '';
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) groups.push(current);
  return groups;
}
