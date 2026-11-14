import type { Metadata } from 'next';
import { Expedition } from '@/components/Expedition';

export const metadata: Metadata = {
  title: { absolute: 'NASA Mission Gallery — An expedition in fourteen chapters' },
};

export default function Home() {
  return <Expedition />;
}
