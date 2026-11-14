import Image from 'next/image';
import type { Media } from '@/lib/catalog';
import styles from './ImageStage.module.css';

export function ImageStage({ media }: { media: Extract<Media, { kind: 'image' }> }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.inner}>
        <Image src={media.src} alt={media.alt} fill priority sizes="100vw" style={{ objectFit: 'cover' }} />
      </div>
      <div className={styles.shade} />
    </div>
  );
}
