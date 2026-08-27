import { ArchiveExplorer } from '@/components/ArchiveExplorer';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Archivio Atti',
  description: 'Esplora gli atti parlamentari con filtri su iter, iniziativa, materia e copertura finanziaria.',
};

export default function AttiPage() {
  return (
    <main className="space-y-6">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Esplora</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-slate-900">Archivio atti</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Filtra per stato dell&apos;iter, iniziativa, materia e coperture. Ordina per urgenza attuativa o per data.
        </p>
      </header>
      <ArchiveExplorer />
    </main>
  );
}
