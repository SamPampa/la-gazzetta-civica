'use client';

import { useState } from 'react';
import type { Act, LawArticle } from '@/src/data/mockActs';
import { daysLate } from '@/src/data/mockActs';
import { COPERTURA_LABELS, formatDateIT } from '@/lib/labels';

type Intensity = 1 | 2;

type Props = {
  act: Act;
};

export function LawReader({ act }: Props) {
  const [decode, setDecode] = useState(false);
  const [intensity, setIntensity] = useState<Intensity>(1);
  const late = daysLate(act.decreeDeadline);

  return (
    <article className="mx-auto max-w-3xl">
      <header className="mb-6 space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-slate-500">{act.code}</p>
        <h1 className="font-serif text-3xl font-bold leading-tight text-slate-900">{act.formalTitle}</h1>
        <p className="font-serif text-base italic leading-relaxed text-slate-600">{act.officialTitle}</p>
        <dl className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Pubblicazione</dt>
            <dd>{act.publishedAt ? formatDateIT(act.publishedAt) : 'Non ancora pubblicata in G.U.'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Entrata in vigore</dt>
            <dd>{act.inForceAt ? formatDateIT(act.inForceAt) : 'Condizionata all’approvazione e alla G.U.'}</dd>
          </div>
        </dl>
        <a
          href={act.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-sm font-medium text-blue-800 underline decoration-blue-200 underline-offset-4 hover:decoration-blue-500"
        >
          {act.sourceLabel} ↗
        </a>
      </header>

      <div className="sticky top-[4.25rem] z-40 -mx-4 mb-8 border-y border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md sm:-mx-0 sm:rounded-2xl sm:border sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-800">
            <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={decode}
                onChange={(e) => setDecode(e.target.checked)}
              />
              <span className="pointer-events-none absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500" />
              <span className="pointer-events-none absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
            </span>
            Decodifica &amp; Semplifica Testo
          </label>

          <div className={`flex flex-1 flex-col gap-2 sm:max-w-sm ${decode ? '' : 'pointer-events-none opacity-40'}`}>
            <div className="flex items-center justify-between text-[11px] font-medium">
              <span className={intensity === 1 ? 'text-amber-700' : 'text-slate-400'}>🟡 Strutturato / Approfondito</span>
              <span className={intensity === 2 ? 'text-emerald-700' : 'text-slate-400'}>🟢 Semplice / Cittadino</span>
            </div>
            <input
              type="range"
              min={1}
              max={2}
              step={1}
              disabled={!decode}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value) as Intensity)}
              className="w-full accent-slate-900"
              aria-label="Intensità della semplificazione"
            />
          </div>
        </div>
        {!decode && (
          <p className="mt-2 text-[11px] text-slate-500">
            Vista predefinita: testo autentico. La decodifica è opzionale e non sostituisce la fonte.
          </p>
        )}
      </div>

      {act.preamble && !decode && (
        <p className="mb-8 whitespace-pre-line font-serif text-sm leading-relaxed text-slate-700">{act.preamble}</p>
      )}

      <div className="space-y-8">
        {act.articles.map((article) => (
          <ArticleBlock key={article.number} article={article} decode={decode} intensity={intensity} />
        ))}
      </div>

      <section className="mt-12 space-y-4 border-t border-slate-200 pt-8">
        <h2 className="font-serif text-xl font-semibold text-slate-900">Apparato critico e vincoli strutturali</h2>
        <p className="text-xs text-slate-500">
          Dati procedurali oggettivi. Non costituiscono giudizio politico sul merito della norma.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Semaforo attuazione</p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`h-3 w-3 rounded-full ${
                  act.decreesMissing === 0 ? 'bg-emerald-500' : late > 0 ? 'bg-rose-500' : 'bg-amber-400'
                }`}
              />
              <p className="text-sm font-semibold text-slate-900">
                {act.decreesMissing === 0
                  ? 'Nessun decreto attuativo mancante'
                  : `${act.decreesMissing} ${act.decreesMissing === 1 ? 'decreto mancante' : 'decreti mancanti'}`}
              </p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Ministero competente: {act.ministry}
              {act.decreeDeadline
                ? `. Scadenza ${formatDateIT(act.decreeDeadline)}${
                    late > 0 ? ` · ${late} ${late === 1 ? 'giorno' : 'giorni'} di ritardo` : ' · nei termini'
                  }`
                : '.'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Copertura economica</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{COPERTURA_LABELS[act.copertura]}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">{act.financialNote}</p>
          </div>
        </div>

        {act.omnibusRisk && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
            <p className="font-semibold">Alert decreto omnibus</p>
            <p className="mt-1 text-xs leading-relaxed">
              <span className="font-mono">{act.omnibusRisk.article}</span> — {act.omnibusRisk.description}
            </p>
          </div>
        )}
        {act.lobbyCheck && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Lobby check</p>
            <p className="mt-1 text-xs leading-relaxed">
              Sovrapposizione testuale del {Math.round(act.lobbyCheck.similarity * 100)}% con {act.lobbyCheck.source}.
              Soglia di allerta: 85%.
            </p>
          </div>
        )}
      </section>
    </article>
  );
}

function ArticleBlock({
  article,
  decode,
  intensity,
}: {
  article: LawArticle;
  decode: boolean;
  intensity: Intensity;
}) {
  const decoded = intensity === 1 ? article.structured : article.simple;

  return (
    <section className="scroll-mt-36">
      <h2 className="font-serif text-xl font-semibold text-slate-900">
        Art. {article.number}
        <span className="mt-0.5 block text-sm font-normal italic text-slate-500">({article.heading})</span>
      </h2>

      {!decode ? (
        <div className="gazette-prose mt-3 whitespace-pre-line rounded-xl border border-slate-200 bg-white p-5 font-serif text-[15px] leading-[1.75] text-slate-900">
          {article.original}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div
            className={`rounded-xl border p-5 text-sm leading-relaxed ${
              intensity === 1
                ? 'border-amber-100 bg-amber-50/60 text-slate-800'
                : 'border-emerald-100 bg-emerald-50/60 text-slate-800'
            }`}
          >
            {decoded}
          </div>
          <details className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <summary className="cursor-pointer text-xs font-semibold text-slate-600">
              Mostra testo originale (Art. {article.number})
            </summary>
            <p className="mt-3 whitespace-pre-line font-serif text-sm leading-relaxed text-slate-800">
              {article.original}
            </p>
          </details>
        </div>
      )}
    </section>
  );
}
