import { ArchiveExplorer } from '@/components/ArchiveExplorer';
import { getActs } from '@/lib/db/acts';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Archivio & Filtri',
  description: 'Ricerca e filtri su atti parlamentari e leggi: iter, iniziativa, materia, copertura finanziaria.',
};

// `ArchiveExplorer` itself still does the actual search/facet
// filtering/sorting/pagination client-side (see its own PAGE_SIZE), so this
// fetches the whole catalog once server-side via `getActs()` - Supabase
// when configured and reachable, the bundled mock catalog otherwise - and
// hands it over as the source list.
const CATALOG_PAGE_SIZE = 500;

// Re-fetch from Supabase at most once an hour instead of only at build
// time, so newly-seeded/edited acts show up without a full redeploy.
export const revalidate = 3600;

export default async function AttiPage() {
  const { items } = await getActs({ page: 1, pageSize: CATALOG_PAGE_SIZE });

  return (
    <main className="space-y-6">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Indice</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-slate-900">Archivio e filtri</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Seleziona un atto per aprire la pagina di lettura del testo integrale. Qui restano solo ricerca e metadati.
        </p>
      </header>
      <ArchiveExplorer initialActs={items} />
    </main>
  );
}
