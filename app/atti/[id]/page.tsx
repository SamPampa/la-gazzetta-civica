import { LawReader } from '@/components/LawReader';
import { getActById, getActs } from '@/lib/db/acts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

type Props = {
  params: Promise<{ id: string }>;
};

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  const { items } = await getActs({ page: 1, pageSize: 24, timeRange: 'all' });
  const ids = items.map((act) => act.id);
  if (ids.includes('legge-105-2026')) ids.push('ddl-1435');
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const act = await getActById(id);
  if (!act) return { title: 'Atto non trovato' };
  return { title: act.formalTitle, description: act.officialTitle };
}

export default async function ActPage({ params }: Props) {
  const { id } = await params;
  const act = await getActById(id);
  if (!act) notFound();

  return (
    <main>
      <p className="mb-6 text-sm">
        <Link href="/atti" className="text-slate-500 hover:text-slate-900">
          ← Archivio e filtri
        </Link>
      </p>
      <LawReader act={act} />
    </main>
  );
}
