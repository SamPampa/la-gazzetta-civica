import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Metodologia & Fonti',
  description: 'Origine dei dati, SPARQL LOD, text-similarity e topic-drift detection.',
};

export default function TrasparenzaPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Accountability</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-slate-900">Metodologia e fonti primarie</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          La Gazzetta Civica non produce opinioni. Espone atti, metadati procedurali e segnali automatici di
          anomalia, con tracciabilità della fonte. Questa pagina descrive pipeline e limiti — incluso il fatto
          che l&apos;istanza attuale usa un corpus mockato per la dimostrazione dell&apos;interfaccia.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-serif text-xl font-semibold text-slate-900">Origine dei dati</h2>
        <dl className="mt-4 space-y-4 text-sm leading-relaxed text-slate-600">
          <div>
            <dt className="font-semibold text-slate-900">SPARQL LOD Camera</dt>
            <dd className="mt-1">
              Endpoint Linked Open Data della Camera dei Deputati: atti, iter, relatori, votazioni e dossier del
              Servizio Studi. Query SPARQL periodiche materializzano RDF in un indice locale (titolo, numero atto,
              fase, commissione).
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Open Data Senato</dt>
            <dd className="mt-1">
              Feed e dataset del Senato su assegnazioni, navette e resoconti. Allineamento con gli identificativi
              Camera tramite normalizzazione dei numeri di atto e delle date di trasmissione.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Normattiva</dt>
            <dd className="mt-1">
              Testo vigente e versioni successive delle leggi pubblicate in Gazzetta Ufficiale. Usato per il
              confronto «testo abrogato / testo approvato» a livello di comma, non per sintesi editoriali.
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="font-serif text-xl font-semibold text-slate-900">Algoritmi</h2>
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-600">
          <p>
            <strong className="text-slate-900">Text-similarity (lobby check).</strong> Embedding sentence-level sui
            commi approvati e sulle memorie depositate in audizione. Cosine similarity: soglia di allerta 0,85.
            Il badge riporta fonte e percentuale; non implica nesso causale né illecito.
          </p>
          <p>
            <strong className="text-slate-900">Topic-drift (rischio omnibus).</strong> Classificatore di materia sul
            titolo e sul preambolo vs. ciascun articolo. Se un articolo cade fuori dal cluster dominante oltre una
            distanza di topic 0,65, viene segnalato come estraneità di materia.
          </p>
          <p>
            <strong className="text-slate-900">RAG di risposta.</strong> Retrieval sui chunk di dossier e testo
            normativo; generazione vincolata a citazioni numerate. I badge [1], [2] aprono il frammento verbatim.
            In questa demo il retrieval è simulato sul file <span className="font-mono text-xs">src/data/mockActs.ts</span>.
          </p>
          <p>
            <strong className="text-slate-900">Ritardi attuativi.</strong> Giorni di ritardo = differenza tra la data
            odierna e la scadenza del decreto dichiarata in legge o in relazione tecnica, se il decreto risulta
            ancora non emanato.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        <h2 className="font-serif text-xl font-semibold text-slate-900">Limiti e neutralità</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Nessun punteggio di «bontà» politica: solo stato, copertura, testi e anomalie strutturali.</li>
          <li>Le votazioni aggregate per partito sono ricostruzioni a partire da scrutinî pubblici, con arrotondamenti.</li>
          <li>I dataset live non sono collegati in questa build: i numeri che vedi sono realistici ma dimostrativi.</li>
        </ul>
      </section>
    </main>
  );
}
