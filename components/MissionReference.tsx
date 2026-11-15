import Image from 'next/image';
import Link from 'next/link';
import type { LoadedMission } from '@/lib/catalog';
import type { Block } from '@/lib/content';
import { mergeMissionFacts } from '@/lib/story';
import { InspectModel } from './InspectModel';
import { MissionArticleMotion } from './MissionArticleMotion';
import styles from './MissionReference.module.css';

function BlockView({ block }: { block: Block }) {
  if (block.kind === 'p') return <p>{block.text}</p>;
  return (
    <div className={styles.table}>
      <table>
        <tbody>
          {block.rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (cellIndex === 0 ? <th scope="row" key={cellIndex}>{cell}</th> : <td key={cellIndex}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MissionReference({ mission }: { mission: LoadedMission }) {
  const { entry, page, records } = mission;
  const facts = mergeMissionFacts(page, records);
  const seen = new Set<string>();
  const links = [...page.links, ...records.flatMap((record) => record.data_links)].filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
  return (
    <main className={styles.page}>
      <MissionArticleMotion className={styles.article}>
      <header className={styles.header} data-reveal>
        <Link className={styles.back} href={`/#${entry.slug}`}>Back to the expedition</Link>
        <p className={styles.eyebrow}>{entry.body} · {entry.shortName}</p>
        <h1>{page.h1}</h1>
      </header>
      {entry.media.kind === 'image' ? (
        <figure className={styles.still}>
          <Image src={entry.media.src} alt={entry.media.alt} fill sizes="(min-width: 1264px) 1200px, 100vw" />
          <figcaption>{entry.media.credit}</figcaption>
        </figure>
      ) : <InspectModel media={entry.media} />}
      {facts.length > 0 && (
        <dl className={styles.facts}>
          {facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
        </dl>
      )}
      {page.sections.map((section, index) => (
        <section key={index} className={styles.prose} data-reveal>
          {section.heading === null ? null : section.level <= 2 ? <h2>{section.heading}</h2> : <h3>{section.heading}</h3>}
          {section.blocks.map((block, blockIndex) => <BlockView key={blockIndex} block={block} />)}
        </section>
      ))}
      <footer className={styles.sources}>
      <p className={styles.credit}>
        {entry.media.credit ? <>{entry.media.credit}<br /></> : null}
        Source: <a href={page.sourceUrl} target="_blank" rel="noopener noreferrer">{page.sourceUrl}</a>
        {' · fetched '}{page.fetchedAt.slice(0, 10)}
      </p>
      <details>
        <summary>Links &amp; sources</summary>
        <ul>
          {links.map((link) => (
            <li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a></li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Full page text</summary>
        <pre>{page.fullText}</pre>
      </details>
      </footer>
      </MissionArticleMotion>
    </main>
  );
}
