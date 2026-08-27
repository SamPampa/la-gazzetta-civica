'use client';

import { FormEvent, useMemo, useState } from 'react';
import { CitationBadge } from '@/components/CitationBadge';
import { IterStepper } from '@/components/IterStepper';
import { VoteMap } from '@/components/VoteMap';
import { COPERTURA_LABELS, INIZIATIVA_LABELS, MATERIA_LABELS, formatDateIT } from '@/lib/labels';
import { daysLate, type Act } from '@/src/data/mockActs';

type Livello = 'cittadino' | 'approfondito' | 'giurista';

type Props = {
  act: Act;
};

export function ActDetailView({ act }: Props) {
  const [livello, setLivello] = useState<Livello>('cittadino');
  const late = daysLate(act.decreeDeadline);

  return (
    <article className="space-y-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-slate-700">{act.code}</span>
          <span>{formatDateIT(act.date)}</span>
          <span>·</span>
          <span>Iniziativa: {INIZIATIVA_LABELS[act.iniziativa]}</span>
          <span>·</span>
          <span>{MATERIA_LABELS[act.materia]}</span>
        </div>
        <h1 className="font-serif text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">{act.title}</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">{act.summary}</p>
        <IterStepper steps={act.iterSteps} />
      </header>

      <section className="space-y-5">
        <div className="mx-auto grid max-w-xl grid-cols-3 rounded-xl bg-slate-100 p-1">
          {(
            [
              ['cittadino', '🟢 Cittadino'],
              ['approfondito', '🟡 Approfondito'],
              ['giurista', '🔴 Giurista'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setLivello(key)}
              className={`rounded-lg py-2 text-xs font-semibold sm:text-sm ${
                livello === key ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {livello === 'cittadino' && (
            <div>
              <h2 className="mb-4 font-serif text-lg font-semibold text-slate-900">Cosa cambia, in tre punti</h2>
              <ul className="space-y-3 text-sm leading-relaxed text-slate-700">
                {act.cittadino.map((point) => (
                  <li key={point.text} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span>
                      {point.text}
                      {point.citationIds.map((id) => (
                        <CitationBadge key={id} n={id} citations={act.citations} />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {livello === 'approfondito' && (
            <div className="space-y-5">
              <h2 className="font-serif text-lg font-semibold text-slate-900">Analisi per capitoli</h2>
              {act.approfondito.map((chapter) => (
                <section key={chapter.title}>
                  <h3 className="text-sm font-semibold text-slate-900">{chapter.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{chapter.body}</p>
                </section>
              ))}
              <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                Emendamenti approvati in commissione: {act.amendmentsApproved}. {act.closedDoorNote}
              </p>
            </div>
          )}

          {livello === 'giurista' && (
            <div className="space-y-4">
              <h2 className="font-serif text-lg font-semibold text-slate-900">Visualizzatore Git-Diff normativo</h2>
              <p className="text-xs text-slate-500">Confronto colonna sinistra (testo abrogato) / colonna destra (testo approvato).</p>
              {act.giurista.map((diff) => (
                <div key={diff.article}>
                  <p className="mb-2 font-mono text-xs font-semibold text-slate-700">{diff.article}</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-rose-700">
                        Testo precedente abrogato
                      </p>
                      <p className="font-mono text-xs italic leading-relaxed text-rose-950">{diff.oldText}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                        Nuovo testo approvato
                      </p>
                      <p className="font-mono text-xs italic leading-relaxed text-emerald-950">{diff.newText}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
        <h2 className="mb-5 font-serif text-xl font-semibold text-slate-900">Lente critica &amp; trasparenza procedurale</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
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
            {act.decreeDeadline && (
              <p className="mt-2 text-xs text-slate-600">
                Scadenza {formatDateIT(act.decreeDeadline)}
                {late > 0 ? ` · ${late} ${late === 1 ? 'giorno' : 'giorni'} di ritardo` : ' · nei termini'}
              </p>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Copertura economica</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{COPERTURA_LABELS[act.copertura]}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">{act.financialNote}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tracciamento commissione</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{act.amendmentsApproved} emendamenti approvati</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">{act.closedDoorNote}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {act.omnibusRisk && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              <p className="font-semibold">Rischio decreto omnibus</p>
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
        </div>
      </section>

      <VoteMap votes={act.votes} />
      <ContextualQA act={act} />
    </article>
  );
}

function ContextualQA({ act }: Props) {
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');

  const answer = useMemo(() => {
    if (!asked) return null;
    const q = asked.toLowerCase();
    if (q.includes('copertura') || q.includes('soldi') || q.includes('costo') || q.includes('fondi')) {
      return { text: act.financialNote, citation: act.citations[0] };
    }
    if (q.includes('decreto') || q.includes('attuativ')) {
      return {
        text:
          act.decreesMissing === 0
            ? 'Su questo atto non risultano decreti attuativi mancanti nel dataset simulato.'
            : `Risultano ${act.decreesMissing} decreti attuativi mancanti${
                act.decreeDeadline ? `, con scadenza ${act.decreeDeadline}` : ''
              }. Ritardo calcolato: ${daysLate(act.decreeDeadline)} giorni.`,
        citation: act.citations[0],
      };
    }
    return {
      text: `${act.cittadino[0]?.text ?? act.ragLead} Ambito della risposta: solo il testo e i metadati di ${act.code}.`,
      citation: act.citations[0],
    };
  }, [asked, act]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (question.trim()) setAsked(question.trim());
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="font-serif text-xl font-semibold text-slate-900">Q&amp;A blindato contestuale</h2>
      <p className="mt-1 text-sm text-slate-500">
        Le risposte restano chiuse su {act.code}. Nessun salto ad altri provvedimenti.
      </p>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={`Domanda su ${act.code}…`}
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:bg-white"
        />
        <button
          type="submit"
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Chiedi
        </button>
      </form>
      {answer && (
        <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p>{answer.text}</p>
          {answer.citation && (
            <p className="font-mono text-[11px] italic text-slate-500">{answer.citation.source}</p>
          )}
        </div>
      )}
    </section>
  );
}
