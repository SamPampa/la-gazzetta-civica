import { ArchiveExplorer } from '@/components/ArchiveExplorer';
import { getActs, parseArchiveSearchParams } from '@/lib/db/acts';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Archivio & Filtri',
  description: 'Ricerca e filtri su atti parlamentari e leggi: iter, iniziativa, materia, copertura finanziaria.',
};

export const revalidate = 3600;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AttiPage({ searchParams }: Props) {
  const raw = await searchParams;
  const filters = parseArchiveSearchParams(raw);
  const result = await getActs(filters);

  return (
    <main className="space-y-6">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Indice</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-slate-900">Archivio e filtri</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Seleziona un atto per aprire la pagina di lettura del testo integrale. Ricerca, filtri e
          paginazione girano sul server: il catalogo non viene scaricato per intero nel browser.
        </p>
      </header>
      <ArchiveExplorer result={result} filters={filters} />
    </main>
  );
}
