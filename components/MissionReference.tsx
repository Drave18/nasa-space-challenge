import Image from 'next/image';
import Link from 'next/link';
import type { LoadedMission } from '@/lib/catalog';
import type { Block } from '@/lib/content';
import { groupPassages, mergeMissionFacts } from '@/lib/story';
import { buildMissionLesson } from '@/lib/lesson';
import { buildModelTour } from '@/lib/model-tour';
import { InspectModel } from './InspectModel';
import { MissionArticleMotion } from './MissionArticleMotion';
import { SectionIndex, type IndexItem } from './SectionIndex';
import styles from './MissionReference.module.css';

function BlockView({ block }: { block: Block }) {
  if (block.kind === 'p') {
    if (!block.text.trim()) return null;
    if (block.text.length <= 700) return <p>{block.text}</p>;
    return <>{groupPassages(block.text, 600).map((text, index) => <p key={index}>{text}</p>)}</>;
  }
  const [first, ...rest] = block.rows;
  const wide = block.rows.some((row) => row.length > 2);
  if (!wide) {
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
  // Header row plus data rows: drop columns that hold no data in any data row, and number the rows.
  const columns = first.map((_, col) => col).filter((col) => rest.some((row) => (row[col] ?? '').trim() !== ''));
  return (
    <div className={styles.table}>
      <table>
        <thead>
          <tr>
            <th scope="col">#</th>
            {columns.map((col) => <th scope="col" key={col}>{first[col]}</th>)}
          </tr>
        </thead>
        <tbody>
          {rest.map((row, index) => (
            <tr key={index}>
              <td>{index + 1}</td>
              {columns.map((col) => <td key={col}>{row[col] ?? ''}</td>)}
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
  const indexItems: IndexItem[] = [
    ...page.sections.map((section, index) => ({ id: `mission-section-${index}`, label: section.heading ?? 'Overview' })),
    ...(records.length > 0 ? [{ id: 'technical-records-heading', label: 'Technical records' }] : []),
  ];
  return (
    <main className={styles.page}>
      <SectionIndex items={indexItems} />
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
      ) : <InspectModel media={entry.media} tour={buildModelTour(buildMissionLesson(mission))} />}
      {facts.length > 0 && (
        <dl className={styles.facts}>
          {facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
        </dl>
      )}
      <div className={styles.story}>
        {page.sections.map((section, index) => {
          const headingId = `mission-section-${index}`;
          const title = section.heading ?? 'Overview';
          return (
            <section key={index} className={styles.storySection} aria-labelledby={headingId} data-reveal>
              <div className={styles.sectionHeading}>
                <span className={styles.sectionNumber} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                {section.heading === null || section.level <= 2 ? <h2 id={headingId}>{title}</h2> : <h3 id={headingId}>{title}</h3>}
              </div>
              <div className={styles.sectionBody}>
                {section.blocks.map((block, blockIndex) => <BlockView key={blockIndex} block={block} />)}
              </div>
            </section>
          );
        })}
      </div>
      {records.length > 0 && (
        <section className={styles.technical} aria-labelledby="technical-records-heading" data-reveal>
          <h2 id="technical-records-heading">Technical records</h2>
          {records.map(record => (
            <details key={record.id} className={styles.disclosure}>
              <summary>{record.craft_name} · {record.id}</summary>
              <div className={styles.disclosureBody}>
                <dl className={styles.facts}>
                  <div><dt>Catalog ID</dt><dd>{record.id}</dd></div>
                  <div><dt>Launch date</dt><dd>{record.launch_date ?? record.launch_date_raw ?? 'Not recorded'}</dd></div>
                  <div><dt>Landing site</dt><dd>{record.landing_site ?? 'Not recorded'}</dd></div>
                  <div><dt>Coordinates</dt><dd>{record.landing_coordinates_raw ?? (record.landing_coordinates ? `${record.landing_coordinates.latitude_deg}, ${record.landing_coordinates.longitude_deg}` : 'Not recorded')}</dd></div>
                  <div><dt>Operational status</dt><dd>{record.operational_status}</dd></div>
                  <div><dt>{record.end_of_mission_date_basis === 'last_contact' ? 'Last contact' : 'Mission end'}</dt><dd>{record.end_of_mission_date ?? 'Not recorded'}</dd></div>
                  <div><dt>Extraction status</dt><dd>{record.extraction_status}</dd></div>
                </dl>
                {record.operational_status_evidence && <p>Status evidence: {record.operational_status_evidence}</p>}
                {record.end_of_mission_evidence && <p>End-date evidence: {record.end_of_mission_evidence}</p>}
                {record.source_errors.map(error => <p key={error.url}>Source error at {error.url}: {error.message}</p>)}
                <details className={styles.disclosure}><summary>Complete structured record</summary><pre className={styles.recordDump}>{JSON.stringify(record, null, 2)}</pre></details>
              </div>
            </details>
          ))}
        </section>
      )}
      <footer className={styles.sources}>
      <p className={styles.credit}>
        {entry.media.credit ? <>{entry.media.credit}<br /></> : null}
        Source: <a href={page.sourceUrl} target="_blank" rel="noopener noreferrer">{page.sourceUrl}</a>
        {' · fetched '}{page.fetchedAt.slice(0, 10)}
      </p>
      <details className={styles.disclosure}>
        <summary>Links &amp; sources</summary>
        <ul>
          {links.map((link) => (
            <li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a></li>
          ))}
        </ul>
      </details>
      <details className={styles.disclosure}>
        <summary>Full page text</summary>
        <pre>{page.fullText}</pre>
      </details>
      </footer>
      </MissionArticleMotion>
    </main>
  );
}
