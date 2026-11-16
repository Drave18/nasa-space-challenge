'use client';

import { useEffect, useState } from 'react';
import styles from './SectionIndex.module.css';

export interface IndexItem { id: string; label: string }

/** Fixed left-edge rail: numbered markers for each article section, with the label revealed on hover/focus and the current section highlighted. */
export function SectionIndex({ items }: { items: IndexItem[] }) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    const targets = items.map(item => document.getElementById(item.id)).filter((el): el is HTMLElement => el !== null);
    const update = () => {
      let current = targets[0]?.id;
      for (const target of targets) {
        if (target.getBoundingClientRect().top <= window.innerHeight * 0.35) current = target.id;
      }
      setActive(current);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [items]);
  if (items.length < 2) return null;
  return (
    <nav className={styles.rail} aria-label="Mission sections">
      <ol>
        {items.map((item, index) => (
          <li key={item.id}>
            <a href={`#${item.id}`} className={item.id === active ? styles.active : undefined} aria-current={item.id === active ? 'location' : undefined}>
              <span className={styles.num}>{String(index + 1).padStart(2, '0')}</span>
              <span className={styles.label}>{item.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
