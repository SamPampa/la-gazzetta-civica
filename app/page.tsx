import { ActCard } from '@/components/ActCard';
import { SearchEngine } from '@/components/SearchEngine';
import Link from 'next/link';
import { MOCK_ACTS } from '@/src/data/mockActs';

export default function HomePage() {
  const weekly = MOCK_ACTS.filter((act) => act.inDiscussionThisWeek);

  return (
    <main className="space-y-12">
      <SearchEngine />

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-bold text-slate-900">In discussione questa settimana</h2>
            <p className="mt-1 text-sm text-slate-500">
              Card con stato dell&apos;iter, semaforo decreti mancanti e tipologia di copertura.
            </p>
          </div>
          <Link href="/atti" className="shrink-0 text-sm font-medium text-blue-800 hover:underline">
            Archivio completo →
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {weekly.map((act) => (
            <ActCard key={act.id} act={act} />
          ))}
        </div>
      </section>
    </main>
  );
}
