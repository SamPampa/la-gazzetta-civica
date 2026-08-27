'use client';

import React, { useState } from 'react';
import Link from 'next/link';

type Livello = 'cittadino' | 'approfondito' | 'giurista';

export default function SchedaProvvedimento() {
  const [livello, setLivello] = useState<Livello>('cittadino');

  return (
    <main className="space-y-8 animate-fade-in">
      {/* Intestazione e Stepper */}
      <section className="space-y-4 border-b border-slate-200 pb-6">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="font-mono bg-slate-100 px-2 py-1 rounded text-slate-700">DDL AC 1435</span>
          <span>Iniziativa: Governo</span>
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 leading-tight">
          Revisione del Codice della Strada e Sicurezza
        </h1>
        
        {/* Stepper Iter Legislativo */}
        <div className="flex items-center justify-between text-xs font-medium bg-slate-50 p-4 rounded-xl border border-slate-200 mt-4 overflow-x-auto">
          <span className="text-emerald-600 flex items-center gap-1">✓ Presentazione</span>
          <span className="text-slate-300">→</span>
          <span className="text-emerald-600 flex items-center gap-1">✓ Commissione Trasporti</span>
          <span className="text-slate-300">→</span>
          <span className="text-blue-600 font-bold flex items-center gap-1">📍 Aula (Camera)</span>
          <span className="text-slate-300">→</span>
          <span className="text-slate-400">Navetta (Senato)</span>
          <span className="text-slate-300">→</span>
          <span className="text-slate-400">Gazzetta Ufficiale</span>
        </div>
      </section>

      {/* Selettore di Complessità */}
      <section className="space-y-6">
        <div className="flex bg-slate-100 p-1 rounded-lg max-w-md mx-auto">
          <button
            onClick={() => setLivello('cittadino')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${livello === 'cittadino' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            🟢 Cittadino
          </button>
          <button
            onClick={() => setLivello('approfondito')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${livello === 'approfondito' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            🟡 Approfondito
          </button>
          <button
            onClick={() => setLivello('giurista')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${livello === 'giurista' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            🔴 Giurista
          </button>
        </div>

        {/* Contenuto Dinamico */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 min-h-[250px] shadow-sm">
          {livello === 'cittadino' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Cosa cambia in breve</h2>
              <ul className="space-y-3 text-slate-700 text-sm">
                <li className="flex gap-2"><span className="text-blue-500">•</span> Ritiro breve della patente (7-15 giorni) per chi usa lo smartphone alla guida.</li>
                <li className="flex gap-2"><span className="text-blue-500">•</span> Obbligo di contrassegno (targa) e assicurazione per tutti i monopattini elettrici.</li>
                <li className="flex gap-2"><span className="text-blue-500">•</span> Tolleranza zero per alcol e droghe: basta l'esito positivo del test rapido.</li>
              </ul>
            </div>
          )}
          {livello === 'approfondito' && (
            <div className="space-y-4 text-sm text-slate-700">
              <h2 className="text-lg font-semibold text-slate-900">Analisi e Contesto</h2>
              <p>Il provvedimento interviene principalmente sugli articoli 75 e 186 del C.d.S. La stretta sui monopattini mira a uniformare il regime assicurativo europeo, mentre l'inasprimento delle sanzioni per l'uso dei dispositivi mobili risponde all'aumento dei tassi di incidentalità urbana.</p>
            </div>
          )}
          {livello === 'giurista' && (
            <div className="space-y-4 text-sm">
              <h2 className="text-lg font-semibold text-slate-900">Testo Novellato (Estratto Art. 8)</h2>
              <div className="grid grid-cols-2 gap-4 font-mono text-xs">
                <div className="bg-red-50 p-4 rounded border border-red-100 text-red-900">
                  <span className="block font-bold mb-2">Testo Abrogato</span>
                  "...i veicoli di mobilità personale a propulsione prevalentemente elettrica sono esentati dall'obbligo di immatricolazione..."
                </div>
                <div className="bg-green-50 p-4 rounded border border-green-100 text-green-900">
                  <span className="block font-bold mb-2">Testo Approvato</span>
                  "...tutti i veicoli di mobilità personale a propulsione prevalentemente elettrica devono essere dotati di contrassegno identificativo e copertura per la responsabilità civile..."
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Lente Critica */}
      <section className="bg-slate-50 border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xl">🔍</span>
          <h3 className="font-bold text-lg text-slate-900">Lente Critica & Trasparenza Procedurale</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Semaforo Attuazione */}
          <div className="bg-white p-4 rounded-lg border border-slate-200">
            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Applicabilità</span>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
              <p className="font-semibold text-sm text-slate-900">2 Decreti Attuativi Mancanti</p>
            </div>
            <p className="text-xs text-slate-600 mt-2">La legge è approvata, ma i fondi per i controlli dipendono da decreti del MEF non ancora emanati.</p>
          </div>

          {/* Salvaguardia Finanziaria */}
          <div className="bg-white p-4 rounded-lg border border-slate-200">
            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Copertura Economica</span>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-3 h-3 rounded-full bg-slate-300" />
              <p className="font-semibold text-sm text-slate-900">Invarianza Finanziaria</p>
            </div>
            <p className="text-xs text-slate-600 mt-2">Nessun nuovo fondo stanziato. I controlli dovranno essere garantiti con le risorse attuali della Polizia di Stato.</p>
          </div>

          {/* Filtro Commissione */}
          <div className="bg-white p-4 rounded-lg border border-slate-200">
            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Iter Commissione</span>
            <p className="font-semibold text-sm text-slate-900 mt-2">14 Emendamenti Approvati</p>
            <p className="text-xs text-slate-600 mt-2">Testo modificato a porte chiuse in Commissione Trasporti prima del voto in Aula.</p>
          </div>
        </div>

        {/* Alert Algoritmici (Omnibus & Lobby) */}
        <div className="mt-4 space-y-2">
          <div className="flex gap-3 bg-rose-50 border border-rose-200 p-3 rounded-lg text-rose-800 text-sm">
            <span>⚠️</span>
            <div>
              <strong>Rischio Decreto Omnibus:</strong> Rilevato l'art. 24-bis riguardante la proroga delle concessioni autostradali, materia semanticamente estranea al Codice della Strada.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}