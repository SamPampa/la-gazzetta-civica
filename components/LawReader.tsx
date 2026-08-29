'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Act, LawArticle, NormImpact } from '@/src/data/mockActs';
import { actIdFromNormCode, collectNormImpacts, daysLate } from '@/src/data/mockActs';
import { COPERTURA_LABELS, IMPACT_TYPE_LABELS, formatDateIT, impactTypeClass } from '@/lib/labels';
import { VoteBreakdownChart, VoteBreakdownPending, type VoteBreakdownData } from '@/components/VoteBreakdownChart';

type Level = 'cittadino' | 'approfondito' | 'giurista';

const LEVEL_OPTIONS: { id: Level; label: string }[] = [
  { id: 'cittadino', label: '🟢 Cittadino (Impatto pratico)' },
  { id: 'approfondito', label: '🟡 Approfondito (Focus commi & risorse)' },
  { id: 'giurista', label: '🔴 Giurista (Note tecniche & novellazioni)' },
];

type Props = {
  act: Act & { voteBreakdown?: VoteBreakdownData | null };
};

export function LawReader({ act }: Props) {
  const [decode, setDecode] = useState(false);
  const [level, setLevel] = useState<Level>('cittadino');
  const late = daysLate(act.decreeDeadline);

  return (
    <article className="mx-auto max-w-3xl">
      <header className="mb-6 space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-slate-500">{act.code}</p>
        <h1 className="text-3xl font-semibold leading-tight text-slate-900">{act.formalTitle}</h1>
        <p className="text-base leading-relaxed text-slate-500">{act.officialTitle}</p>
        <dl className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pubblicazione</dt>
            <dd className="text-slate-900">
              {act.publishedAt ? formatDateIT(act.publishedAt) : 'Non ancora pubblicata in G.U.'}
            </dd>
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

      <div className="sticky top-[4.25rem] z-40 -mx-4 mb-6 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-0 sm:px-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
            Decodifica &amp; Spiegazione
          </label>

          <select
            value={level}
            disabled={!decode}
            onChange={(e) => setLevel(e.target.value as Level)}
            className={`rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-blue-400 sm:text-sm ${
              decode ? '' : 'cursor-not-allowed opacity-40'
            }`}
          >
            {LEVEL_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {act.preamble && (
        <p className="mb-8 whitespace-pre-line font-serif text-sm leading-relaxed text-slate-700">{act.preamble}</p>
      )}

      <div className="space-y-8">
        {act.articles.map((article) => (
          <ArticleBlock key={article.number} article={article} decode={decode} level={level} />
        ))}
      </div>

      <NormImpactSection act={act} />

      {act.voteBreakdown ? (
        <VoteBreakdownChart data={act.voteBreakdown} />
      ) : (
        <VoteBreakdownPending iterStatus={act.iterStatus} />
      )}

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

function ArticleBlock({
  article,
  decode,
  level,
}: {
  article: LawArticle;
  decode: boolean;
  level: Level;
}) {
  return (
    <section className="scroll-mt-36">
      <h2 className="font-serif text-xl font-semibold text-slate-900">
        Art. {article.number}
        <span className="mt-0.5 block text-sm font-normal italic text-slate-500">({article.heading})</span>
      </h2>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-5">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Testo ufficiale (Gazzetta Ufficiale / Parlamento)
        </p>
        <p className="whitespace-pre-line font-serif text-[15px] leading-[1.75] text-slate-900">
          {article.original}
        </p>
      </div>

      {article.impact && <ArticleImpactCallout impact={article.impact} />}

      {decode && <ExplanationBox article={article} level={level} />}
    </section>
  );
}

function ExplanationBox({ article, level }: { article: LawArticle; level: Level }) {
  if (level === 'cittadino') {
    return (
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
          🟢 Cittadino — impatto pratico
        </p>
        <p className="text-sm leading-relaxed text-slate-800">{article.simple}</p>
      </div>
    );
  }

  if (level === 'approfondito') {
    return (
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
          🟡 Approfondito — focus commi &amp; risorse
        </p>
        <p className="text-sm leading-relaxed text-slate-800">{article.structured}</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/60 p-5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-rose-800">
        🔴 Giurista — note tecniche &amp; novellazioni
      </p>
      <ul className="space-y-2 text-sm leading-relaxed text-slate-800">
        <li className="flex gap-2">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
          <span>
            <span className="font-mono text-xs text-rose-700">Rif. novella —</span> {article.structured}
          </span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
          <span>
            <span className="font-mono text-xs text-rose-700">Nota tecnica —</span> Il comma riportato sopra è
            testo autentico; verificare la disciplina previgente sulla fonte ufficiale prima di ogni applicazione
            pratica al caso concreto.
          </span>
        </li>
      </ul>
    </div>
  );
}

function ArticleImpactCallout({ impact }: { impact: NormImpact }) {
  return (
    <p className="mt-2 text-xs leading-relaxed text-slate-600">
      <span className={`mr-2 inline-flex rounded-full border px-2 py-0.5 font-semibold ${impactTypeClass(impact.impactType)}`}>
        {IMPACT_TYPE_LABELS[impact.impactType]}
      </span>
      Interviene su {impact.modifiedActCode}, {impact.targetArticle}.
    </p>
  );
}

function NormImpactSection({ act }: { act: Act }) {
  const rows = collectNormImpacts(act);

  return (
    <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold text-slate-900">Impatto sul quadro normativo &amp; modifiche correlate</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">
        Elenco verificabile delle novelle: quali atti preesistenti vengono sostituiti, integrati, derogati o abrogati.
        I riassunti non sostituiscono il testo ufficiale.
      </p>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
          Nessuna novella puntuale catalogata su articoli di atti preesistenti. Il provvedimento introduce disciplina
          autonoma o non modifica commi già in vigore nel corpus indicizzato.
        </p>
      ) : (
        <ol className="mt-5 space-y-4">
          {rows.map(({ articleNumber, impact }) => (
            <li
              key={`${articleNumber}-${impact.modifiedActCode}-${impact.targetArticle}`}
              className="rounded-xl border border-slate-200 bg-slate-50/80 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${impactTypeClass(impact.impactType)}`}>
                  {IMPACT_TYPE_LABELS[impact.impactType]}
                </span>
                <span className="font-mono text-[11px] text-slate-500">Art. {articleNumber} di questo atto</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                <ModifiedActLink code={impact.modifiedActCode} />
                <span className="mx-1.5 font-normal text-slate-400">·</span>
                <span className="font-mono text-xs font-medium text-slate-700">{impact.targetArticle}</span>
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Regola previgente</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">{impact.previousRuleSummary}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Effetto nuovo</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">{impact.newEffectSummary}</p>
                </div>
              </div>
              {impact.officialSourceUrl && (
                <a
                  href={impact.officialSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex text-xs font-medium text-blue-700 hover:underline"
                >
                  Fonte ufficiale (Normattiva) ↗
                </a>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ModifiedActLink({ code }: { code: string }) {
  const id = actIdFromNormCode(code);
  if (!id) return <span>{code}</span>;
  return (
    <Link href={`/atti/${id}`} className="text-blue-800 hover:underline">
      {code}
    </Link>
  );
}

