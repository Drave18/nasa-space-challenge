import fs from 'node:fs';
import path from 'node:path';

export interface PageHeading {
  level: number;
  text: string;
}

export interface PageLink {
  text: string;
  url: string;
}

export interface PageExport {
  source_url: string;
  final_url: string;
  fetched_at: string;
  title: string;
  text: string;
  headings: PageHeading[];
  links: PageLink[];
}

/** Server-only: reads a scraped page export from assets/json. Throws on malformed input. */
export function readPageExport(file: string): PageExport {
  const full = path.join(process.cwd(), 'assets/json', file);
  const page = JSON.parse(fs.readFileSync(full, 'utf8')) as PageExport;
  if (!page.title || !page.text) throw new Error(`${file}: empty title or text`);
  if (!page.headings.some((h) => h.level === 1 && h.text)) throw new Error(`${file}: no level-1 heading`);
  return page;
}
