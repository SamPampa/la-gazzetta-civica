'use client';

import { ActCard } from '@/components/ActCard';
import { MOCK_ACTS } from '@/src/data/mockActs';
import Link from 'next/link';
import { FormEvent, useState } from 'react';

const TRENDING = [
  { tag: '#CodiceDellaStrada', query: 'Cosa cambia per i neopatentati?' },
  { tag: '#ListeAttesaSanità', query: 'Cosa cambia per le liste di attesa?' },
  { tag: '#DecretoFiscale', query: 'Cosa cambia con il decreto fiscale?' },
];

const RAG = {
  query: 'Cosa cambia per i neopatentati?',
  lead: 'Per chi ha conseguito la patente B da meno di tre anni i limiti di velocità scendono: 90 km/h sulle extraurbane principali e 100 km/h in autostrada.',
  body: 'La novella sostituisce il comma 2-bis dell’art. 117 del Codice della strada. Il vincolo, prima più breve, viene allungato a tre anni dal conseguimento.',
  citations: [
    {
      id: 1,
      source: 'L. 105/2026, Art. 4 — novella all’art. 117 C.d.S., comma 2-bis',
      excerpt:
        '«Per i primi tre anni dal conseguimento della patente di categoria B è vietato il superamento della velocità di 90 km/h sulle strade extraurbane principali e di 100 km/h sulle autostrade.»',
    },
    {
      id: 2,
      source: 'Dossier Servizio Studi Camera, scheda Art. 4',
      excerpt:
        '«Il termine di tre anni decorre dal conseguimento della patente B e si applica in luogo della disciplina previgente sui limiti per i neopatentati.»',
    },
  ],
};

export default function HomePage() {
  const [query, setQuery] = useState(RAG.query);
  const [asked, setAsked] = useState(RAG.query);
  const [openCite, setOpenCite] = useState<number | null>(1);

  const run = (value: string) => {
    const next = value.trim();
    if (!next) return;
    setQuery(next);
    setAsked(next);
    setOpenCite(null);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(query);
  };

  const weekly = MOCK_ACTS.slice(0, 3);
  const citation = RAG.citations.find((c) => c.id === openCite);

  return (
    <main className="space-y-16 pb-8">
      <section className="mx-auto max-w-2xl pt-6 text-center sm:pt-12">
        <p className="mb-3 text-xs font-medium tracking-wide text-slate-400">Answer engine</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Cosa dice la legge, in chiaro.
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-500">
          Una domanda. Una risposta ancorata agli atti. Le citazioni restano apribili, il testo ufficiale a un click.
        </p>

        <form onSubmit={onSubmit} className="relative mt-8">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chiedi cosa cambia con una legge (es. 'Codice della strada', 'Superbonus')..."
            className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-5 pr-28 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/20"
          />
          <button
            type="submit"
            className="absolute right-2 top-2 bottom-2 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
          >
            Chiedi
          </button>
        </form>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {TRENDING.map((item) => (
            <button
              key={item.tag}
              type="button"
              onClick={() => run(item.query)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800"
            >
              {item.tag}
            </button>
          ))}
        </div>
      </section>

      {asked && (
        <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <span className="text-xs font-medium text-emerald-700">Risposta ancorata agli atti</span>
            <Link href="/atti/legge-105-2026" className="text-xs font-medium text-blue-700 hover:underline">
              Apri la norma →
            </Link>
          </div>
          <p className="text-xs text-slate-400">
            «{asked}»
          </p>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-slate-800">
            <p>
              {RAG.lead}{' '}
              <CiteBadge n={1} active={openCite === 1} onClick={() => setOpenCite(openCite === 1 ? null : 1)} />
            </p>
            <p>
              {RAG.body}{' '}
              <CiteBadge n={2} active={openCite === 2} onClick={() => setOpenCite(openCite === 2 ? null : 2)} />
            </p>
          </div>
          {citation && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium text-slate-800">{citation.source}</p>
                <button
                  type="button"
                  onClick={() => setOpenCite(null)}
                  className="text-xs text-slate-400 hover:text-slate-700"
                  aria-label="Chiudi citazione"
                >
                  ✕
                </button>
              </div>
              <p className="mt-2 font-serif text-sm italic leading-relaxed text-slate-600">{citation.excerpt}</p>
            </div>
          )}
        </section>
      )}

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

function CiteBadge({ n, active, onClick }: { n: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ml-0.5 inline-flex h-5 min-w-5 translate-y-[-1px] items-center justify-center rounded-md px-1 align-super font-mono text-[10px] font-semibold ${
        active
          ? 'bg-blue-600 text-white'
          : 'border border-slate-200 bg-slate-50 text-blue-700 hover:border-blue-300 hover:bg-blue-50'
      }`}
      aria-label={`Citazione ${n}`}
    >
      [{n}]
    </button>
  );
}
