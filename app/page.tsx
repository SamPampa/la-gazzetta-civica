import { ArchiveExplorer } from '@/components/ArchiveExplorer';

export default function HomePage() {
  return (
    <main className="space-y-8">
      <header className="max-w-3xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Radar normativo</p>
        <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Trova la norma, poi leggi il testo autentico.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
          Indice di atti e disegni di legge. La scheda di ciascun provvedimento si apre sul testo ufficiale;
          la semplificazione è un livello opzionale, mai il default.
        </p>
      </header>
      <ArchiveExplorer />
    </main>
  );
}
