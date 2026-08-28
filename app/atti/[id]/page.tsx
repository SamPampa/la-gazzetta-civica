import { LawReader } from '@/components/LawReader';
import { MOCK_ACTS, getActById } from '@/src/data/mockActs';
import type { Metadata } from 'next';
import Link from 'next/link';

type Props = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return [...MOCK_ACTS.map((act) => ({ id: act.id })), { id: 'ddl-1435' }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const act = getActById(id);
  return { title: act.formalTitle, description: act.officialTitle };
}

export default async function ActPage({ params }: Props) {
  const { id } = await params;
  const act = getActById(id);

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
