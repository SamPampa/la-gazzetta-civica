import { ActDetailView } from '@/components/ActDetailView';
import { MOCK_ACTS, getActById } from '@/src/data/mockActs';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

type Props = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return MOCK_ACTS.map((act) => ({ id: act.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const act = getActById(id);
  if (!act) return { title: 'Atto non trovato' };
  return { title: act.code, description: act.summary };
}

export default async function ActPage({ params }: Props) {
  const { id } = await params;
  const act = getActById(id);
  if (!act) notFound();

  return (
    <main>
      <p className="mb-6 text-sm">
        <Link href="/atti" className="text-slate-500 hover:text-slate-900">
          ← Archivio atti
        </Link>
      </p>
      <ActDetailView act={act} />
    </main>
  );
}
