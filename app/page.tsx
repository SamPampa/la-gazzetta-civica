'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [activeSnippet, setActiveSnippet] = useState<string | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setShowResult(true);
    }
  };

  return (
    <main className="space-y-12">
      {/* Sezione Hero & Motore di Risposta */}
      <section className="text-center max-w-3xl mx-auto space-y-4 pt-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Cosa dice davvero la legge, in chiaro.
        </h1>
        <p className="text-slate-400 text-sm sm:text-base">
          Interroga i dossier tecnici, gli emendamenti e i decreti ufficiali del Parlamento senza filtri della propaganda.
        </p>

        {/* Barra di Ricerca Stile Perplexity */}
        <form onSubmit={handleSearch} className="relative mt-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chiedi cosa cambia (es. 'Cosa prevede la riforma del codice della strada?')"
            className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3.5 pr-28 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-lg"
          />
          <button
            type="submit"
            className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 rounded-lg transition-colors"
          >
            Analizza
          </button>
        </form>

        {/* Tag Suggeriti */}
        <div className="flex flex-wrap justify-center gap-2 pt-2 text-xs text-slate-400">
          <span>Temi caldi:</span>
          <button onClick={() => { setQuery('Nuovo codice della strada monopattini'); setShowResult(true); }} className="text-blue-400 hover:underline">#CodiceDellaStrada</button>
          <button onClick={() => { setQuery('Superbonus coperture di bilancio'); setShowResult(true); }} className="text-blue-400 hover:underline">#Superbonus</button>
          <button onClick={() => { setQuery('Sanità liste d\'attesa'); setShowResult(true); }} className="text-blue-400 hover:underline">#Sanità</button>
        </div>
      </section>

      {/* Box Risposta Semantica Verificata (Mostrata se si effettua una ricerca) */}
      {showResult && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 max-w-3xl mx-auto shadow-md transition-all">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-mono text-emerald-400 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Risposta ancorata agli atti ufficiali (RAG)
            </span>
            <Link href="/atti/ddl-1435" className="text-xs text-blue-400 hover:underline">
              Vedi Scheda Completa Atto →
            </Link>
          </div>

          <div className="text-slate-200 text-sm leading-relaxed space-y-3">
            <p>
              Il disegno di legge sulla sicurezza stradale interviene sul regime sanzionatorio per l'uso dei telefoni alla guida disponendo la sospensione immediata della patente
              <button onClick={() => setActiveSnippet('cit-1')} className="inline-block bg-blue-900/60 text-blue-300 text-xs px-1.5 py-0.5 rounded ml-1 font-mono border border-blue-700/50 hover:bg-blue-800">[1]</button>.
            </p>
            <p>
              Viene inoltre introdotto l'obbligo di contrassegno adesivo identificativo (targa) e copertura assicurativa per tutti i monopattini elettrici a propulsione autonoma
              <button onClick={() => setActiveSnippet('cit-2')} className="inline-block bg-blue-900/60 text-blue-300 text-xs px-1.5 py-0.5 rounded ml-1 font-mono border border-blue-700/50 hover:bg-blue-800">[2]</button>.
            </p>
          </div>

          {/* Drawer Citazione Granulare Verbatim */}
          {activeSnippet && (
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-1.5 text-slate-300">
              <div className="flex justify-between font-semibold text-slate-200">
                <span>
                  {activeSnippet === 'cit-1' ? 'Fonte: Dossier Studi Camera n. 142, Pag. 12 (Art. 4, comma 2)' : 'Fonte: Testo DDL AC 1435, Art. 8 (Modifiche art. 75 C.d.S.)'}
                </span>
                <button onClick={() => setActiveSnippet(null)} className="text-slate-400 hover:text-white">✕</button>
              </div>
              <p className="font-mono text-slate-400 italic bg-slate-900/50 p-2 rounded">
                {activeSnippet === 'cit-1'
                  ? '"...dispone la sanzione accessoria del ritiro breve della patente da 7 a 15 giorni qualora il conducente risulti in possesso di punteggio inferiore a venti punti."'
                  : '"...tutti i veicoli di mobilità personale a propulsione prevalentemente elettrica devono essere dotati di contrassegno identificativo e copertura per la responsabilità civile verso terzi."'}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Feed Provvedimenti in Discussione */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Provvedimenti in Discussione Questa Settimana</h2>
          <Link href="/atti" className="text-xs text-slate-400 hover:text-white">Tutti gli atti →</Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card Atto 1 */}
          <Link href="/atti/ddl-1435" className="block bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-5 rounded-xl transition-all group">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-300">DDL AC 1435</span>
              <span className="text-blue-400 font-medium">In Esame in Aula</span>
            </div>
            <h3 className="text-base font-semibold text-slate-100 group-hover:text-blue-400 transition-colors">
              Revisione del Codice della Strada e Sicurezza
            </h3>
            <p className="text-xs text-slate-400 mt-2 line-clamp-2">
              Nuove sanzioni per uso smartphone alla guida, obbligo targa per monopattini e revisione limiti neopatentati.
            </p>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-800/60 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" /> 2 Decreti Attuativi Richiesti
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-400" /> Invarianza Finanziaria
              </span>
            </div>
          </Link>

          {/* Card Atto 2 */}
          <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl opacity-80">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-300">DL 113/2026</span>
              <span className="text-amber-400 font-medium">Conversione in Commissione</span>
            </div>
            <h3 className="text-base font-semibold text-slate-100">
              Misure Urgenti in Materia Fiscale ed Economica
            </h3>
            <p className="text-xs text-slate-400 mt-2 line-clamp-2">
              Proroghe fiscali, rifinanziamento ammortizzatori sociali e misure di sostegno per le imprese energivore.
            </p>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-800/60 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Subito Applicabile
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400" /> Copertura a Debito (1.2 Mld €)
              </span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}