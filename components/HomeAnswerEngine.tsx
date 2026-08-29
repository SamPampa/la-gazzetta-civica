'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { RagCitation, RagResponse } from '@/lib/types/rag';

const TRENDING = [
  { tag: '#CodiceDellaStrada', query: 'Cosa cambia per i neopatentati?' },
  { tag: '#ListeAttesaSanità', query: 'Cosa cambia per le liste di attesa?' },
  { tag: '#DecretoFiscale', query: 'Cosa cambia con il decreto fiscale?' },
];

const CITATION_BADGE_CLASS =
  'inline-flex items-center text-xs font-mono bg-blue-50 text-blue-700 hover:bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200';

/** Splits a synthesized answer on `[1]`, `[2]`, ... markers and renders each
 * one as an interactive citation button wired to `onOpen`, falling back to
 * plain text for any bracket number that has no matching `RagCitation`
 * (should never happen given how `/api/rag` builds `citations`, but keeps
 * this purely presentational function crash-proof either way). */
function renderAnswerWithCitations(
  text: string,
  citations: RagCitation[],
  activeIndex: number | null,
  onOpen: (citation: RagCitation) => void,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\[(\d+)\]/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    const n = Number(match[1]);
    const citation = citations.find((c) => c.index === n);
    if (citation) {
      nodes.push(
        <button
          key={key++}
          type="button"
          onClick={() => onOpen(citation)}
          className={`${CITATION_BADGE_CLASS} mx-0.5 ${activeIndex === n ? 'ring-2 ring-blue-400' : ''}`}
          aria-label={`Apri fonte citata numero ${n}`}
        >
          [{n}]
        </button>,
      );
    } else {
      nodes.push(<span key={key++}>{match[0]}</span>);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }
  return nodes;
}

function LoadingPulse() {
  return (
    <div className="mx-auto mt-6 max-w-2xl space-y-2 text-left" aria-live="polite" aria-label="Ricerca in corso">
      <div className="h-3 w-2/3 animate-pulse rounded-full bg-slate-200" />
      <div className="h-3 w-full animate-pulse rounded-full bg-slate-200" />
      <div className="h-3 w-5/6 animate-pulse rounded-full bg-slate-200" />
    </div>
  );
}

function CitationDrawer({ citation, onClose }: { citation: RagCitation; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40"
      role="dialog"
      aria-modal="true"
      aria-label={`Fonte verbatim: ${citation.actCode}, art. ${citation.articleNumber}`}
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-slate-400">Fonte [{citation.index}]</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{citation.actCode}</h3>
            <p className="mt-0.5 text-sm leading-snug text-slate-500">{citation.actTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">Art. {citation.articleNumber}</p>
        <blockquote className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4 font-serif text-[15px] italic leading-relaxed text-slate-700">
          «{citation.snippetVerbatim}»
        </blockquote>

        <div className="mt-5 flex flex-col gap-2">
          <Link href={`/atti/${citation.actId}`} className="text-sm font-medium text-blue-700 hover:underline">
            Apri l&apos;atto integrale →
          </Link>
          {citation.officialSourceUrl && (
            <a
              href={citation.officialSourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
            >
              Fonte ufficiale ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function HomeAnswerEngine() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ragResponse, setRagResponse] = useState<RagResponse | null>(null);
  const [activeCitation, setActiveCitation] = useState<RagCitation | null>(null);
  const [deepGroundingOpen, setDeepGroundingOpen] = useState(true);
  const [neutralBalanceOpen, setNeutralBalanceOpen] = useState(true);

  // Close any open citation drawer whenever a fresh answer replaces the
  // previous one, so the drawer never shows a citation from a stale answer.
  useEffect(() => {
    setActiveCitation(null);
  }, [ragResponse]);

  async function runQuery(raw: string) {
    const value = raw.trim();
    if (!value || loading) return;

    setQuery(value);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: value }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Richiesta fallita (HTTP ${res.status})`);
      }
      const data = (await res.json()) as RagResponse;
      setRagResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore imprevisto durante la ricerca.');
      setRagResponse(null);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void runQuery(query);
  }

  const paragraphs = ragResponse?.answer.split(/\n{2,}/).filter(Boolean) ?? [];
  const activeIndex = activeCitation?.index ?? null;

  return (
    <>
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
            disabled={loading}
            className="absolute right-2 top-2 bottom-2 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Cerco…' : 'Chiedi'}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {TRENDING.map((item) => (
            <button
              key={item.tag}
              type="button"
              onClick={() => void runQuery(item.query)}
              disabled={loading}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {item.tag}
            </button>
          ))}
        </div>

        {loading && <LoadingPulse />}
        {error && !loading && (
          <p className="mx-auto mt-6 max-w-2xl rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-sm text-rose-700">
            {error}
          </p>
        )}
      </section>

      {ragResponse && !loading && (
        <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <span className="text-xs font-medium text-emerald-700">Risposta ancorata agli atti</span>
            {ragResponse.isCached && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                ⚡ Risposta istantanea da archivio verificato
              </span>
            )}
          </div>

          <p className="text-xs text-slate-400">«{ragResponse.query}»</p>

          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-slate-800">
            {paragraphs.length > 0 ? (
              paragraphs.map((paragraph, i) => (
                <p key={i}>{renderAnswerWithCitations(paragraph, ragResponse.citations, activeIndex, setActiveCitation)}</p>
              ))
            ) : (
              <p className="text-sm text-slate-500">Nessuna risposta disponibile per questa domanda.</p>
            )}
          </div>

          {ragResponse.deepGrounding.length > 0 && (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setDeepGroundingOpen((v) => !v)}
                className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800"
              >
                <span>🔗 Impatto Quadro Normativo</span>
                <span className="text-slate-400">{deepGroundingOpen ? '−' : '+'}</span>
              </button>
              {deepGroundingOpen && (
                <ul className="mt-3 space-y-3">
                  {ragResponse.deepGrounding.map((impact, i) => (
                    <li key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-medium text-slate-700">
                        {impact.modifiedActCode} — {impact.targetArticle}{' '}
                        <span className="font-mono text-[10px] uppercase text-slate-400">({impact.impactType})</span>
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <p className="text-xs leading-relaxed text-slate-500">
                          <span className="font-semibold text-slate-600">Prima: </span>
                          {impact.previousRuleSummary}
                        </p>
                        <p className="text-xs leading-relaxed text-slate-700">
                          <span className="font-semibold text-slate-600">Ora: </span>
                          {impact.newEffectSummary}
                        </p>
                      </div>
                      {impact.officialSourceUrl && (
                        <a
                          href={impact.officialSourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-[11px] text-blue-700 hover:underline"
                        >
                          Fonte ufficiale ↗
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {(ragResponse.neutralBalance.pros.length > 0 || ragResponse.neutralBalance.cons.length > 0) && (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setNeutralBalanceOpen((v) => !v)}
                className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800"
              >
                <span>⚖️ Bilancio Istituzionale (Servizio Studi)</span>
                <span className="text-slate-400">{neutralBalanceOpen ? '−' : '+'}</span>
              </button>
              {neutralBalanceOpen && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-emerald-700">Obiettivi dichiarati</p>
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-600">
                      {ragResponse.neutralBalance.pros.map((pro, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-emerald-500">＋</span>
                          <span>{pro}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-rose-700">Vincoli e criticità</p>
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-600">
                      {ragResponse.neutralBalance.cons.map((con, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-rose-500">－</span>
                          <span>{con}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {activeCitation && <CitationDrawer citation={activeCitation} onClose={() => setActiveCitation(null)} />}
    </>
  );
}
