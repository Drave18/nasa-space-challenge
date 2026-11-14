'use client';

import { useEffect, useId, useState } from 'react';
import type { NormalizedPage } from '@/lib/content';
import type { MissionRecord } from '@/lib/missions';
import styles from './InfoPanel.module.css';

export function InfoPanel({ page, records }: { page: NormalizedPage; records: MissionRecord[] }) {
  const [open, setOpen] = useState(true);
  const id = useId();

  useEffect(() => {
    setOpen(window.matchMedia('(min-width: 900px)').matches);
  }, []);

  const dataLinks = records.flatMap((r) => r.data_links);

  return (
    <>
      <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        Mission info
      </button>
      <aside id={id} className={`${styles.panel} ${open ? '' : styles.closed}`} aria-hidden={!open}>
        {page.sections.map((s, i) => (
          <section key={i}>
            {s.heading === null ? null : s.level <= 2 ? <h2>{s.heading}</h2> : <h3>{s.heading}</h3>}
            {s.blocks.map((b, j) =>
              b.kind === 'p' ? (
                <p key={j}>{b.text}</p>
              ) : (
                <table key={j}>
                  <tbody>
                    {b.rows.map((row, k) => (
                      <tr key={k}>
                        {row.map((cell, c) => (c === 0 ? <th scope="row" key={c}>{cell}</th> : <td key={c}>{cell}</td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ),
            )}
          </section>
        ))}

        <details>
          <summary>Links &amp; sources</summary>
          <ul>
            {page.links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label}
                </a>
              </li>
            ))}
            {dataLinks.map((l) => (
              <li key={`data-${l.url}`}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label}
                </a>{' '}
                <small>({l.kind.replace('_', ' ')})</small>
              </li>
            ))}
          </ul>
        </details>

        <details>
          <summary>Full page text</summary>
          <pre>{page.fullText}</pre>
        </details>
      </aside>
    </>
  );
}
