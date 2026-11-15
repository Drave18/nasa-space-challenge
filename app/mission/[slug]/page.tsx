import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MissionReference } from '@/components/MissionReference';
import { CATALOG, loadMission } from '@/lib/catalog';

export const dynamicParams = false;

export function generateStaticParams() {
  return CATALOG.map((e) => ({ slug: e.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const mission = loadMission(slug);
  if (!mission) return {};
  return { title: mission.page.h1 };
}

export default async function MissionPage({ params }: Props) {
  const { slug } = await params;
  const mission = loadMission(slug);
  if (!mission) notFound();
  return <MissionReference mission={mission} />;
}
