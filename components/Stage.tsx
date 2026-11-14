import type { MissionEntry } from '@/lib/catalog';
import type { NormalizedPage } from '@/lib/content';
import type { MissionRecord } from '@/lib/missions';
import { ImageStage } from './ImageStage';
import { InfoPanel } from './InfoPanel';
import { MissionDock } from './MissionDock';
import { ModelViewerLoader } from './ModelViewerLoader';
import styles from './Stage.module.css';

interface Props {
  entry: MissionEntry;
  page: NormalizedPage;
  records: MissionRecord[];
  allEntries: MissionEntry[];
}

export function Stage({ entry, page, records, allEntries }: Props) {
  const record = records[0];
  const facts = [...page.facts];
  if (record) {
    if (record.landing_site) facts.push({ label: 'Landing site', value: record.landing_site });
    if (record.launch_date) facts.push({ label: 'Launch date', value: record.launch_date });
    facts.push({ label: 'Status', value: record.operational_status });
  }

  return (
    <main className={styles.stage}>
      <div className={styles.media}>
        {entry.media.kind === 'model' ? <ModelViewerLoader media={entry.media} mode="inspect" active={true} /> : <ImageStage media={entry.media} />}
      </div>

      <header className={styles.header}>
        <p className={styles.eyebrow}>{entry.shortName}</p>
        <h1>{page.h1}</h1>
        <dl className={styles.chips}>
          <div className={`${styles.chip} ${styles.body}`}>
            <dd>{entry.body}</dd>
          </div>
          {facts.map((f, i) => (
            <div className={styles.chip} key={`${f.label}-${i}`}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <InfoPanel page={page} records={records} />
      <MissionDock entries={allEntries} current={entry.slug} />

      <p className={styles.credit}>
        {entry.media.credit ? <>{entry.media.credit} · </> : null}
        Source: <a href={page.sourceUrl} target="_blank" rel="noopener noreferrer">{new URL(page.sourceUrl).hostname}</a>
        {' · fetched '}
        {page.fetchedAt.slice(0, 10)}
      </p>
    </main>
  );
}
