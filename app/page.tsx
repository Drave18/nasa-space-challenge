import type { Metadata } from 'next';
import { Expedition } from '@/components/Expedition';
import { CATALOG } from '@/lib/catalog';

export const metadata: Metadata = {
  title: { absolute: `NASA Mission Gallery — An expedition in ${CATALOG.length} chapters` },
};

export default function Home() {
  return <Expedition />;
}
