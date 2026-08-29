import { ActCard } from '@/components/ActCard';
import { HomeAnswerEngine } from '@/components/HomeAnswerEngine';
import { getActs } from '@/lib/db/acts';
import Link from 'next/link';

// Recent acts refresh at most once an hour — mirrors `/atti`'s revalidate
// window. This only affects the "In discussione questa settimana" grid
// below; the answer engine above is a client component that hydrates and
// becomes interactive immediately, independent of this server-side fetch.
export const revalidate = 3600;

export default async function HomePage() {
  const { items: weekly } = await getActs({ page: 1, pageSize: 3 });

  return (
    <main className="space-y-16 pb-8">
      <HomeAnswerEngine />

      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-400">In discussione questa settimana</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">Ultime dal Parlamento</h2>
          </div>
          <Link href="/atti" className="text-sm font-medium text-slate-500 hover:text-slate-900">
            Archivio →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {weekly.map((act) => (
            <ActCard key={act.id} act={act} />
          ))}
        </div>
      </section>
    </main>
  );
}
