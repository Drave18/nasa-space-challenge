import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Stage } from '@/components/Stage';
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
  const { entry, page, records } = mission;
  return <Stage entry={entry} page={page} records={records} allEntries={CATALOG} />;
}
