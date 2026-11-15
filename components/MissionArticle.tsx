import Image from 'next/image';
import Link from 'next/link';
import type { MissionEntry } from '@/lib/catalog';
import type { NormalizedPage, Block } from '@/lib/content';
import type { MissionRecord } from '@/lib/missions';
import { mergeMissionFacts } from '@/lib/story';
import styles from './MissionArticle.module.css';

function isArticleBlock(block: Block): boolean {
  if (block.kind === 'table') return block.rows.length > 0;
  return block.text.length >= 65 && !/^(Occurred\b|Unable to render|Embed\b|\d+ Min Read|Image Article|Article\b)/i.test(block.text);
}

export function MissionArticle({ entry, page, records, allEntries }: {
  entry: MissionEntry; page: NormalizedPage; records: MissionRecord[]; allEntries: MissionEntry[];
}) {
  const facts = mergeMissionFacts(page, records);
  const sections = page.sections.map((section, index) => ({ ...section, index, blocks: section.blocks.filter(isArticleBlock) }))
    .filter(section => section.blocks.length > 0);
  const currentIndex = allEntries.findIndex(item => item.slug === entry.slug);
  const next = allEntries[(currentIndex + 1) % allEntries.length];
  const imageSrc = entry.media.kind === 'model' ? entry.media.poster : entry.media.src;

  return (
    <main className={styles.page}>
      <header className={styles.navigation}>
        <Link href="/" className={styles.brand}>NASA <span>Mission Gallery</span></Link>
        <Link href={`/#${entry.slug}`} className={styles.back}>
          <span className={styles.backIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5m0 0 6-6m-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          Back to the expedition
        </Link>
      </header>

      <article>
        <header className={styles.articleHeader}>
          <div className={styles.meta}><span>Mission record</span><span>{entry.body}</span></div>
          <h1>{page.h1}</h1>
          <p className={styles.subtitle}>Explore the mission, its equipment, and the science behind {entry.shortName}.</p>
          <div className={styles.headerFoot}><span>NASA Mission Gallery</span><span>Source retrieved <time dateTime={page.fetchedAt}>{page.fetchedAt.slice(0, 10)}</time></span></div>
        </header>

        <figure className={styles.hero}>
          <div className={styles.imageWrap}><Image src={imageSrc} alt={entry.media.alt} fill priority sizes="100vw" className={styles.image} /></div>
          {entry.media.credit && <figcaption>{entry.media.credit}</figcaption>}
        </figure>

        <div className={styles.layout}>
          <aside className={styles.sidebar} aria-label="On this page">
            <p>On this page</p>
            <a href="#mission-facts">Mission facts</a>
            {sections.filter(section => section.heading).map(section => <a href={`#section-${section.index}`} key={section.index}>{section.heading}</a>)}
            <a href="#sources">Sources</a>
          </aside>
          <div className={styles.content}>
            {facts.length > 0 && <section id="mission-facts" className={styles.factsSection}>
              <h2>Mission facts</h2>
              <dl className={styles.facts}>{facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
            </section>}
            {sections.map(section => <section id={`section-${section.index}`} className={styles.section} key={section.index}>
              {section.heading && <h2>{section.heading}</h2>}
              {section.blocks.map((block, index) => block.kind === 'p' ? <p key={index}>{block.text}</p> : <div className={styles.tableWrap} key={index}><table><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => cellIndex === 0 ? <th scope="row" key={cellIndex}>{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>)}
            </section>)}
            <section id="sources" className={styles.sources}>
              <h2>Sources</h2>
              <p>This record is based on <a href={page.sourceUrl} target="_blank" rel="noopener noreferrer">NASA’s original mission page ↗</a>, retrieved <time dateTime={page.fetchedAt}>{page.fetchedAt.slice(0, 10)}</time>.</p>
              {entry.media.credit && <p>Image: {entry.media.credit}</p>}
              {entry.slug === 'apollo-11' && <p><a href="/models/optimized/apollo-11-license.txt">Model attribution and license ↗</a></p>}
              {records.flatMap(record => record.data_links).length > 0 && <ul>{records.flatMap(record => record.data_links).map((link, index) => <li key={`${link.url}-${index}`}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a></li>)}</ul>}
              <details className={styles.originalText}>
                <summary>View complete source text</summary>
                <pre>{page.fullText}</pre>
              </details>
            </section>
          </div>
        </div>
      </article>
      <footer className={styles.footer}>
        <p>Continue exploring</p>
        <Link href={`/mission/${next.slug}`}>Next mission <span>{next.shortName} ↗</span></Link>
        <Link href="/">Return to the expedition ↑</Link>
      </footer>
    </main>
  );
}
