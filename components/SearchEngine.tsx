'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { CitationDrawer } from '@/components/CitationBadge';
import { MOCK_ACTS, TRENDING_TOPICS, searchActs, type Act, type Citation } from '@/src/data/mockActs';

function buildAnswer(act: Act, query: string) {
  return {
    act,
    query,
    paragraphs: [
      { text: act.ragLead, citationId: act.citations[0]?.id },
      { text: act.cittadino[0]?.text ?? act.summary, citationId: act.cittadino[0]?.citationIds[0] },
      { text: act.cittadino[1]?.text, citationId: act.cittadino[1]?.citationIds[0] },
    ].filter((p) => p.text),
  };
}

export function SearchEngine() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);

  const result = useMemo(() => {
    if (!submitted) return null;
    const matches = searchActs(submitted);
    const act = matches[0] ?? MOCK_ACTS[0];
    return buildAnswer(act, submitted);
  }, [submitted]);

  const runSearch = (value: string) => {
    const next = value.trim();
    if (!next) return;
    setQuery(next);
    setSubmitted(next);
    setActiveCitation(null);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white px-4 py-12 sm:px-8 sm:py-16">
      <div className="gazette-grid pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative mx-auto max-w-3xl text-center">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
          Answer engine · fonti primarie
        </p>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.15]">
          Cosa dice davvero la legge, in chiaro.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Interroga dossier, commi e decreti del Parlamento italiano. Risposte ancorate agli atti, con citazioni
          verbatim apribili. Nessun commento politico: solo testo, iter e coperture.
        </p>

        <form onSubmit={onSubmit} className="relative mt-8">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chiedi in linguaggio naturale: es. cosa cambia per i monopattini?"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-4 pr-32 text-sm text-slate-900 shadow-inner outline-none ring-blue-600/20 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4"
          />
          <button
            type="submit"
            className="absolute right-2 top-2 bottom-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Analizza
          </button>
        </form>

        <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
          {TRENDING_TOPICS.map((topic) => (
            <button
              key={topic.tag}
              type="button"
              onClick={() => runSearch(topic.query)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-blue-800 hover:border-blue-300 hover:bg-blue-50"
            >
              {topic.tag}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className="relative mx-auto mt-10 max-w-3xl rounded-2xl border border-slate-200 bg-slate-50/80 p-5 text-left shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <span className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold text-emerald-700">
              <span className="pipeline-dot h-2 w-2 rounded-full bg-emerald-500" />
              Risposta ancorata agli atti ufficiali (RAG simulato)
            </span>
            <Link href={`/atti/${result.act.id}`} className="text-xs font-medium text-blue-800 hover:underline">
              Scheda completa {result.act.code} →
            </Link>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Query: <span className="italic text-slate-700">«{result.query}»</span>
          </p>
          <div className="space-y-3 text-sm leading-relaxed text-slate-800">
            {result.paragraphs.map((p, i) => (
              <p key={i}>
                {p.text}
                {p.citationId != null && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveCitation(
                        result.act.citations.find((c) => c.id === p.citationId) ?? null,
                      )
                    }
                    className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded border border-blue-200 bg-white px-1 align-super font-mono text-[10px] font-bold text-blue-800 hover:bg-blue-50"
                  >
                    [{p.citationId}]
                  </button>
                )}
              </p>
            ))}
          </div>
          <div className="mt-4">
            <CitationDrawer citation={activeCitation} onClose={() => setActiveCitation(null)} />
          </div>
        </div>
      )}
    </section>
  );
}
