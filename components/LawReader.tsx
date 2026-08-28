'use client';

import { useState } from 'react';
import type { Act, LawArticle } from '@/src/data/mockActs';
import { daysLate } from '@/src/data/mockActs';
import { COPERTURA_LABELS, formatDateIT } from '@/lib/labels';

type Tab = 'cittadino' | 'approfondito' | 'giurista';

const TABS: { id: Tab; label: string }[] = [
  { id: 'cittadino', label: '🟢 Cittadino (Sintetico)' },
  { id: 'approfondito', label: '🟡 Approfondito (Focus)' },
  { id: 'giurista', label: '🔴 Giurista / Tecnico' },
];

type Props = {
  act: Act;
};

export function LawReader({ act }: Props) {
  const [tab, setTab] = useState<Tab>('cittadino');
  const late = daysLate(act.decreeDeadline);

  return (
    <article className="mx-auto max-w-5xl">
      <header className="mx-auto mb-6 max-w-3xl space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-slate-500">{act.code}</p>
        <h1 className="text-3xl font-semibold leading-tight text-slate-900">{act.formalTitle}</h1>
        <p className="text-base leading-relaxed text-slate-500">{act.officialTitle}</p>
        <dl className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pubblicazione</dt>
            <dd className="text-slate-900">{act.publishedAt ? formatDateIT(act.publishedAt) : 'Non ancora pubblicata in G.U.'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Entrata in vigore</dt>
            <dd className="text-slate-900">
              {act.inForceAt ? formatDateIT(act.inForceAt) : 'Condizionata all’approvazione e alla G.U.'}
            </dd>
          </div>
        </dl>
        <a
          href={act.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-sm font-medium text-blue-700 hover:underline"
        >
          {act.sourceLabel} ↗
        </a>
      </header>

      <div className="sticky top-[4.25rem] z-40 mb-8 rounded-2xl border border-slate-200 bg-slate-100 p-1 shadow-sm">
        <div className="grid grid-cols-3 gap-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-xl px-2 py-2.5 text-center text-[11px] font-medium transition sm:text-sm ${
                tab === item.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'bg-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-8">
        {act.articles.map((article) => (
          <ArticleBlock key={article.number} article={article} tab={tab} />
        ))}
      </div>

      <VoteMap />

      <section className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-slate-900">Apparato critico e vincoli strutturali</h2>
        <p className="text-xs text-slate-500">
          Dati procedurali oggettivi. Non costituiscono giudizio politico sul merito della norma.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Semaforo attuazione</p>
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
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Copertura economica</p>
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

function ArticleBlock({ article, tab }: { article: LawArticle; tab: Tab }) {
  return (
    <section className="scroll-mt-36 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">
        Art. {article.number}
        <span className="mt-0.5 block text-sm font-normal text-slate-500">{article.heading}</span>
      </h2>

      {tab === 'cittadino' && (
        <p className="mt-4 text-[15px] leading-relaxed text-slate-800">{article.simple}</p>
      )}

      {tab === 'approfondito' && (
        <p className="mt-4 text-[15px] leading-relaxed text-slate-800">{article.structured}</p>
      )}

      {tab === 'giurista' && <GitDiff article={article} />}
    </section>
  );
}

function GitDiff({ article }: { article: LawArticle }) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-rose-700">
          Testo precedente / abrogato
        </p>
        <p className="text-sm leading-relaxed text-rose-900/80 line-through decoration-rose-300">
          Salva diversa disposizione, in materia di «{article.heading}» non si applicavano gli obblighi introdotti
          dalla presente novella. Il testo previgente è abrogato nei limiti di cui alla disposizione sostitutiva.
        </p>
      </div>
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
          Nuovo testo approvato
        </p>
        <p className="whitespace-pre-line font-serif text-sm leading-relaxed text-slate-900">
          <AddedText text={article.original} />
        </p>
      </div>
    </div>
  );
}

function AddedText({ text }: { text: string }) {
  const parts = text.split(/(\d+\s*km\/h|devono essere muniti|contrassegno identificativo|tre anni|tempo reale|16 dicembre 2026|1\.200 milioni)/gi);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-emerald-200/80 px-0.5 text-emerald-950">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function VoteMap() {
  return (
    <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold text-slate-900">🗳️ Come hanno votato i partiti</h2>
      <p className="mt-1 text-sm text-slate-500">Scrutinio aggregato d’aula (simulazione sull’ultimo passaggio disponibile).</p>
      <div className="mt-5 flex h-4 w-full overflow-hidden rounded-full">
        <div className="h-full w-[58%] bg-emerald-500" title="Favorevoli 58%" />
        <div className="h-full w-[35%] bg-red-400" title="Contrari 35%" />
        <div className="h-full w-[7%] bg-slate-300" title="Astenuti 7%" />
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700">
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Favorevoli <span className="font-semibold text-slate-900">58%</span>
          <span className="text-slate-400">232 voti</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          Contrari <span className="font-semibold text-slate-900">35%</span>
          <span className="text-slate-400">140 voti</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          Astenuti <span className="font-semibold text-slate-900">7%</span>
          <span className="text-slate-400">28 voti</span>
        </li>
      </ul>
    </section>
  );
}
