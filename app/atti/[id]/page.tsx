import { LawReader } from '@/components/LawReader';
import { getActById } from '@/lib/db/acts';
import { MOCK_ACTS } from '@/src/data/mockActs';
import type { Metadata } from 'next';
import Link from 'next/link';

type Props = {
  params: Promise<{ id: string }>;
};

// Same reasoning as `app/atti/page.tsx`: periodic ISR refresh instead of a
// build-time-only snapshot.
export const revalidate = 3600;

export function generateStaticParams() {
  // Sourced from the bundled mock catalog rather than a live DB query -
  // static params are resolved at build time, before we can assume
  // Supabase is reachable (or even configured) in every build environment.
  // `getActById` itself still serves real DB-backed acts at request time
  // for ids outside this pre-rendered set (Next falls back to on-demand
  // rendering for those).
  return [...MOCK_ACTS.map((act) => ({ id: act.id })), { id: 'ddl-1435' }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const act = await getActById(id);
  return { title: act.formalTitle, description: act.officialTitle };
}

export default async function ActPage({ params }: Props) {
  const { id } = await params;
  const act = await getActById(id);

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
