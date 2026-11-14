import type { PageExport } from './pages.ts';

export type Block = { kind: 'p'; text: string } | { kind: 'table'; rows: string[][] };

export interface Fact {
  label: string;
  value: string;
}

export interface Section {
  heading: string | null;
  level: number;
  blocks: Block[];
}

export interface NormalizedPage {
  h1: string;
  facts: Fact[];
  sections: Section[];
  links: { label: string; url: string }[];
  fullText: string;
  sourceUrl: string;
  fetchedAt: string;
}

const FACT_LABELS = ['Type', 'Launch', 'Target', 'Targets', 'TargetS', 'Objective', 'Status'];
const NOISE_LINES = new Set(['Unable to render the provided source']);
const COSPAR_PREFIX = 'NSSDCA/COSPAR ID: ';

function isTail(line: string, h1: string): boolean {
  return (
    line === 'Latest News' ||
    line === 'Keep Exploring' ||
    line === 'Discover More Topics From NASA' ||
    line === `${h1} Stories` ||
    line.endsWith(' Stories') ||
    line.endsWith(' News and Features') ||
    line === 'Explore All' ||
    line.startsWith('Explore All ')
  );
}

function toBlocks(lines: string[], h1: string): Block[] {
  const blocks: Block[] = [];
  let table: string[][] | null = null;
  for (const line of lines) {
    if (line.includes('\t')) {
      if (!table) {
        table = [];
        blocks.push({ kind: 'table', rows: table });
      }
      table.push(line.split('\t'));
      continue;
    }
    table = null;
    if (line === h1) continue;
    blocks.push({ kind: 'p', text: line });
  }
  return blocks;
}

export function normalizePage(p: PageExport): NormalizedPage {
  const h1 = p.headings.find((h) => h.level === 1 && h.text)?.text ?? p.title;
  let lines = p.text.split('\n');

  const h1At = lines.indexOf(h1);
  if (h1At >= 0) {
    lines = lines.slice(h1At);
    const tail = lines.findIndex((l, i) => i > 0 && isTail(l, h1));
    if (tail >= 0) lines = lines.slice(0, tail);
  }
  lines = lines.filter((l) => !NOISE_LINES.has(l));

  // Sections: match headings in document order.
  const headings = p.headings.filter((h) => h.level >= 2 && h.text);
  const sections: Section[] = [];
  type RawSection = { heading: string | null; level: number; lines: string[] };
  const raw: RawSection[] = [];
  let cursor = 0;
  let current: RawSection = { heading: null, level: 1, lines: [] };
  for (const h of headings) {
    const at = lines.indexOf(h.text, cursor);
    if (at < 0) continue;
    current.lines = lines.slice(cursor, at);
    raw.push(current);
    current = { heading: h.text, level: h.level, lines: [] };
    cursor = at + 1;
  }
  current.lines = lines.slice(cursor);
  raw.push(current);

  // Facts from the overview (before the first matched heading).
  const facts: Fact[] = [];
  const overview = raw[0].lines;
  const kept: string[] = [];
  for (let i = 0; i < overview.length; i++) {
    const line = overview[i];
    if (FACT_LABELS.includes(line) && i + 1 < overview.length) {
      facts.push({ label: line === 'TargetS' ? 'Targets' : line, value: overview[i + 1] });
      i++;
      continue;
    }
    if (line.startsWith(COSPAR_PREFIX)) {
      facts.push({ label: 'COSPAR ID', value: line.slice(COSPAR_PREFIX.length) });
      continue;
    }
    kept.push(line);
  }
  raw[0].lines = kept;

  for (const s of raw) {
    const blocks = toBlocks(s.lines, h1);
    if (blocks.length === 0) continue;
    sections.push({ heading: s.heading, level: s.level, blocks });
  }

  const seen = new Set<string>();
  const links: { label: string; url: string }[] = [];
  for (const l of p.links) {
    if (!l.url.startsWith('http') || seen.has(l.url)) continue;
    const label = l.text
      .replace(/Image Article|Article|Blog|\d+ Min Read/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!label) continue;
    seen.add(l.url);
    links.push({ label, url: l.url });
  }

  return { h1, facts, sections, links, fullText: p.text, sourceUrl: p.source_url, fetchedAt: p.fetched_at };
}
