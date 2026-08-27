import { ArchiveExplorer } from '@/components/ArchiveExplorer';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Archivio & Filtri',
  description: 'Ricerca e filtri su atti parlamentari e leggi: iter, iniziativa, materia, copertura finanziaria.',
};

export default function AttiPage() {
  return (
    <main className="space-y-6">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Indice</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-slate-900">Archivio e filtri</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Seleziona un atto per aprire la pagina di lettura del testo integrale. Qui restano solo ricerca e metadati.
        </p>
      </header>
      <ArchiveExplorer />
    </main>
  );
}
