/**
 * PHASE 4 — Proactive Semantic Search Router.
 *
 * This route is designed so it NEVER dead-ends: it always either grounds a
 * direct civic answer in real, verified text, or — when nothing directly
 * applicable exists yet — gives the citizen a concrete, honest next step
 * (an official link, a known act name, or a rephrasing hint), never a bare
 * technical failure and never a fabricated legal fact.
 *
 * PIPELINE:
 *
 * 0. SEMANTIC CACHE (`RagQueryCache`): every (query, actId) pair is looked
 *    up before any retrieval/synthesis work, and written back afterwards —
 *    a repeated question is served straight out of Postgres in well under
 *    50ms, at zero further Gemini cost.
 *
 * 1. INTENT PARSING & QUERY EXPANSION (`parseQueryIntent`): the raw query is
 *    handed to `gemini-3.6-flash` for semantic pre-comprehension — the real
 *    civic intent, an expanded set of Italian legal keywords/synonyms, and
 *    candidate act codes (e.g. "costruzioni" -> D.P.R. 380/2001). Degrades
 *    to a deterministic keyword heuristic if Gemini is unavailable or the
 *    request is already scoped to one act (`actId`), so this step never
 *    blocks anything.
 *
 * 2. LOCAL RETRIEVAL (`retrieveByAct`/`retrieveByQuery`): searches the
 *    Supabase corpus (titles, subjects, verbatim text, AI summaries) using
 *    the raw query plus the expanded terms from step 1.
 *
 * 3. PROACTIVE EXTERNAL FALLBACK (`resolveExternalFallback`): only runs when
 *    local retrieval came back empty or with nothing substantive (a
 *    placeholder-only or too-short article doesn't count). Resolves the
 *    AI-identified candidate act codes and the thematic "foundation
 *    statutes" for the query's domain via
 *    `lib/services/normattiva_resolver.ts` (local DB first, a durable
 *    Supabase cache second, a live Normattiva fetch third), and — as a
 *    router of last resort — a free-text keyword search against
 *    Normattiva's own OpenData index when none of the above resolved to
 *    real text. Every genuine fetch is cached for future requests.
 *
 * 4. DEEP-DIVE / HISTORICAL GROUNDING: separately identifies which older
 *    "foundation" statutes the retrieved text implicates — both explicit
 *    citations embedded in the verbatim text itself and implicit thematic
 *    matches (`lib/taxonomy/legalThesaurus.ts`) — and resolves their real
 *    text on demand, feeding the systemic/historical narrative.
 *
 * 5. SYNTHESIS: hands the verified sources to `gemini-3.6-flash` under a
 *    strict "impartial Servizio Studi" system instruction that forbids any
 *    internal/technical vocabulary from ever leaking into the answer —
 *    numbered bracket citations `[n]` in `answer`, a historical narrative in
 *    `extendedAnalysis.historicalContext`. The comparative table and
 *    pros/cons dossier are built directly from real DB rows rather than left
 *    to the LLM, consistent with this project's "never invent legal facts"
 *    rule. This route never 500s on a missing/failing Gemini call or a
 *    failing network fetch — every stage has a deterministic fallback.
 *
 * Usage: POST /api/rag  { query: string; actId?: string; stage?: 'all' | 'stage1' | 'stage2' }
 */
import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { extractReferencedActCodes, matchThematicCorpus } from '@/lib/taxonomy/legalThesaurus';
import {
  resolveMultipleHistoricalNorms,
  searchNormattivaByKeyword,
  type ResolvedHistoricalAct,
  type ResolveNormOptions,
} from '@/lib/services/normattiva_resolver';
import type {
  ComparativeDeepGrounding,
  ExtendedHistoricalAnalysis,
  RagCitation,
  RagResponse,
  RetrievedHistoricalStatute,
} from '@/lib/types/rag';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RagStage = 'all' | 'stage1' | 'stage2';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';
const genAI = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const MAX_SNIPPETS = 6;
const MAX_PER_ACT = 2; // caps any single act's share so cross-norm answers can actually span multiple acts
const MAX_HISTORICAL_STATUTES = 4; // caps the deep-dive's network/DB fan-out per request
const MAX_EXTERNAL_FALLBACK_SOURCES = 4; // caps the proactive fallback's network/DB fan-out per request
const SNIPPET_PREVIEW_LENGTH = 900; // shown to the end user in `citations`
const SNIPPET_PROMPT_LENGTH = 1500; // shown to Gemini (a bit more context to ground on)
const HISTORICAL_SNIPPET_LENGTH = 700; // shown in `retrievedHistoricalStatutes`/to Gemini
const MIN_SUBSTANTIVE_CHARS = 200; // below this (or a placeholder match) an article can't ground an answer

const EMPTY_EXTENDED_ANALYSIS: ExtendedHistoricalAnalysis = {
  historicalContext: '',
  retrievedHistoricalStatutes: [],
  comparativeTable: [],
  neutralTechnicalDossier: { pros: [], cons: [] },
};

// ---------------------------------------------------------------------------
// 1. LOCAL RETRIEVAL (Supabase corpus)
// ---------------------------------------------------------------------------

const ARTICLE_SELECT = {
  id: true,
  number: true,
  heading: true,
  original: true,
  simple: true,
  structured: true,
  exhaustiveAnalysis: true,
  prosObjective: true,
  consObjective: true,
  act: { select: { id: true, code: true, popularTitle: true, officialTitle: true, sourceUrl: true, materia: true } },
  impacts: {
    select: {
      modifiedActCode: true,
      targetArticle: true,
      impactType: true,
      previousRuleSummary: true,
      newEffectSummary: true,
      officialSourceUrl: true,
    },
  },
} satisfies Prisma.ArticleSelect;

type RetrievedArticle = Prisma.ArticleGetPayload<{ select: typeof ARTICLE_SELECT }>;

/** Everything currently in `Article.original`/`simple`/`structured` is real
 * verbatim/derived text (see `scripts/fetch_full_legislative_texts.ts`), so
 * scoping to one act just means "all of its articles" — capped at
 * `MAX_SNIPPETS` to keep the synthesis prompt focused. */
async function retrieveByAct(actId: string): Promise<RetrievedArticle[]> {
  return prisma.article.findMany({
    where: { actId },
    select: ARTICLE_SELECT,
    orderBy: { orderIndex: 'asc' },
    take: MAX_SNIPPETS,
  });
}

const ITALIAN_STOPWORDS = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'di', 'del', 'dello', 'della', 'dei', 'degli', 'delle',
  'e', 'o', 'che', 'per', 'con', 'un', 'uno', 'una', 'sul', 'sullo', 'sulla', 'come', 'cosa',
  'quali', 'quale', 'sono', 'cambia', 'cambiato', 'legge', 'leggi', 'articolo', 'articoli',
  'dice', 'dire', 'nella', 'nel', 'negli', 'alla', 'agli', 'questa', 'questo', 'questi', 'più',
  // Generic legislative filler words that appear in almost every act's text
  // regardless of topic — keeping these out of `extractKeywords` avoids
  // false-positive full-text matches that would otherwise look like real
  // local coverage for an unrelated query (see `isTopicallyRelevant`).
  'nuovo', 'nuova', 'nuovi', 'nuove', 'disposizioni', 'disposizione', 'misure', 'norme', 'norma',
  'urgenti', 'urgente', 'modifiche', 'modifica', 'materia', 'ambito', 'testo', 'decreto', 'decreti',
]);

function extractKeywords(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/[^a-zà-ù0-9]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length > 3 && !ITALIAN_STOPWORDS.has(w));
  return words.length > 0 ? [...new Set(words)] : [query.trim()].filter(Boolean);
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}

/** Cross-act keyword retrieval: matches any keyword (the raw query's own
 * tokens plus the AI-expanded terms from `parseQueryIntent`) against the
 * act's own title/subject fields as well as the article's heading/text
 * fields, then diversifies the result so a single dominant act can't crowd
 * out the comparative, cross-norm answers this step exists to enable. */
async function retrieveByQuery(query: string, expandedTerms: string[] = []): Promise<RetrievedArticle[]> {
  const terms = dedupe([...extractKeywords(query), ...expandedTerms]).slice(0, 16);

  const orConditions: Prisma.ArticleWhereInput[] = terms.flatMap((term) => [
    { heading: { contains: term, mode: 'insensitive' } },
    { original: { contains: term, mode: 'insensitive' } },
    { simple: { contains: term, mode: 'insensitive' } },
    { act: { is: { popularTitle: { contains: term, mode: 'insensitive' } } } },
    { act: { is: { officialTitle: { contains: term, mode: 'insensitive' } } } },
    { act: { is: { materia: { contains: term, mode: 'insensitive' } } } },
  ]);

  const candidates = await prisma.article.findMany({
    where: { OR: orConditions },
    select: ARTICLE_SELECT,
    take: MAX_SNIPPETS * 4, // over-fetch, then diversify across acts below
    orderBy: [{ act: { urgency: 'desc' } }, { act: { date: 'desc' } }],
  });

  const perAct = new Map<string, number>();
  const diversified: RetrievedArticle[] = [];
  for (const article of candidates) {
    const usedForThisAct = perAct.get(article.act.id) ?? 0;
    if (usedForThisAct >= MAX_PER_ACT) continue;
    diversified.push(article);
    perAct.set(article.act.id, usedForThisAct + 1);
    if (diversified.length >= MAX_SNIPPETS) break;
  }
  return diversified;
}

const PLACEHOLDER_TEXT_PATTERN = /non\s+(?:ancora\s+)?(?:[eè]\s+stato\s+)?acquisit[oi]/i;

/** An article whose `original` is too short or is itself an honest
 * ingestion-scope placeholder (see `scripts/ingest_normattiva.ts`'s HONESTY
 * NOTE) can't ground a real answer — it needs to be treated as a local miss
 * so the proactive external fallback can try to do better. */
function isSubstantiveArticle(article: RetrievedArticle): boolean {
  const text = article.original ?? '';
  return text.trim().length >= MIN_SUBSTANTIVE_CHARS && !PLACEHOLDER_TEXT_PATTERN.test(text);
}

function countDistinctTermMatches(haystack: string, terms: string[]): number {
  const lower = haystack.toLowerCase();
  return terms.filter((term) => lower.includes(term.toLowerCase())).length;
}

/** `retrieveByQuery`'s OR-based full-text match can technically be
 * "substantive" (real, long-enough text) while still being completely
 * off-topic — a single generic word shared with an unrelated bill, or an
 * AI-expanded term that's merely correlated with the topic (e.g. "Legge di
 * Bilancio" surfacing the budget law itself for an unrelated tax question).
 * A local hit only really counts as coverage if the CITIZEN'S OWN words
 * show up in the act/article's own title-level fields, or if at least two
 * DISTINCT terms (own words or AI-expanded) agree somewhere in the body
 * text — a much stronger relevance signal than one incidental word.
 * Otherwise it's exactly the "fragmentary/insufficient" context that must
 * trigger the proactive external fallback. */
function isTopicallyRelevant(article: RetrievedArticle, baseTerms: string[], allTerms: string[]): boolean {
  if (baseTerms.length === 0 && allTerms.length === 0) return true;
  const titleFields = `${article.heading} ${article.act.popularTitle} ${article.act.officialTitle} ${article.act.materia}`;
  if (baseTerms.length > 0 && countDistinctTermMatches(titleFields, baseTerms) >= 1) return true;
  const bodyFields = `${article.original} ${article.simple} ${article.structured}`;
  return countDistinctTermMatches(bodyFields, allTerms) >= 2;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

// ---------------------------------------------------------------------------
// 2. UNIFIED GROUNDING SOURCE — local corpus rows and on-demand resolved
//    norms are normalized to the same shape, so citation-building, the
//    comparative table, the neutral dossier, the deterministic fallback and
//    the synthesis prompt all operate over one list regardless of where a
//    given source actually came from.
// ---------------------------------------------------------------------------

type AnswerSource = {
  actCode: string;
  actTitle: string;
  articleNumber: string;
  verbatimText: string;
  actId?: string;
  officialSourceUrl?: string;
  isExternallyResolved: boolean;
  simpleSummary?: string;
  structuredSummary?: string;
  prosObjective: string[];
  consObjective: string[];
  impacts: ComparativeDeepGrounding[];
};

function fromLocalArticle(article: RetrievedArticle): AnswerSource {
  return {
    actCode: article.act.code,
    actTitle: article.act.popularTitle || article.act.officialTitle,
    articleNumber: article.number,
    verbatimText: article.original,
    actId: article.act.id,
    officialSourceUrl: article.act.sourceUrl || undefined,
    isExternallyResolved: false,
    simpleSummary: article.simple || undefined,
    structuredSummary: article.structured || undefined,
    prosObjective: article.prosObjective,
    consObjective: article.consObjective,
    impacts: article.impacts.map((impact) => ({
      modifiedActCode: impact.modifiedActCode,
      targetArticle: impact.targetArticle,
      impactType: impact.impactType,
      previousRuleSummary: impact.previousRuleSummary,
      newEffectSummary: impact.newEffectSummary,
      officialSourceUrl: impact.officialSourceUrl ?? undefined,
    })),
  };
}

function fromExternalNorm(norm: ResolvedHistoricalAct): AnswerSource {
  return {
    actCode: norm.actCode,
    actTitle: norm.officialTitle,
    articleNumber: norm.articleNumber,
    verbatimText: norm.verbatimText,
    officialSourceUrl: norm.sourceUrl,
    isExternallyResolved: true,
    prosObjective: [],
    consObjective: [],
    impacts: [],
  };
}

function buildCitations(sources: AnswerSource[]): RagCitation[] {
  return sources.map((source, i) => ({
    index: i + 1,
    actId: source.actId,
    actCode: source.actCode,
    actTitle: source.actTitle,
    articleNumber: source.articleNumber,
    snippetVerbatim: truncate(source.verbatimText, SNIPPET_PREVIEW_LENGTH),
    officialSourceUrl: source.officialSourceUrl,
    isExternallyResolved: source.isExternallyResolved,
  }));
}

function buildComparativeTable(sources: AnswerSource[]): ComparativeDeepGrounding[] {
  return sources.flatMap((source) => source.impacts);
}

function buildNeutralDossier(sources: AnswerSource[]): ExtendedHistoricalAnalysis['neutralTechnicalDossier'] {
  return {
    pros: dedupe(sources.flatMap((s) => s.prosObjective)).slice(0, 5),
    cons: dedupe(sources.flatMap((s) => s.consObjective)).slice(0, 5),
  };
}

/** Deterministic answer (also the `stage: 'stage1'` fast path, and the
 * fallback when Gemini is unavailable/fails): combines each source's own
 * citizen-level summary (for local rows) or its verbatim text (for on-demand
 * resolved norms, which don't have an AI summary yet) with the same numbered
 * citations the LLM path would have used — never a 500, never fabricated. */
function fallbackAnswer(sources: AnswerSource[], citations: RagCitation[]): string {
  return sources
    .map((source, i) => {
      const n = citations[i]?.index ?? i + 1;
      const summary = [source.simpleSummary, source.structuredSummary].filter(Boolean).join(' ') || source.verbatimText;
      return `${truncate(summary, 500)} [${n}]`;
    })
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// 3. INTENT PARSING & QUERY EXPANSION (pre-routing)
// ---------------------------------------------------------------------------

type QueryIntent = {
  civicIntent: string;
  expandedTerms: string[];
  candidateActCodes: string[];
  materiaHint?: string;
};

function heuristicIntent(query: string): QueryIntent {
  return { civicIntent: query, expandedTerms: extractKeywords(query), candidateActCodes: [] };
}

const INTENT_SYSTEM_INSTRUCTION =
  'Sei il modulo di pre-comprensione semantica del motore di ricerca civico "La Gazzetta Civica". Data la domanda di ' +
  "un cittadino italiano — anche formulata in linguaggio comune e non tecnico — individua l'intento civico reale e le " +
  'materie giuridiche sottostanti. Esempio: "costruzioni" implica il Testo Unico dell\'Edilizia (D.P.R. 380/2001), la ' +
  'legge urbanistica (L. 1150/1942) e il Codice dei Contratti Pubblici. Restituisci SOLO JSON conforme allo schema: ' +
  '"civicIntent" (una frase che descrive cosa vuole davvero sapere il cittadino); "expandedTerms" (5-10 parole chiave ' +
  'italiane, sinonimi e termini istituzionali collegati, utili per una ricerca testuale); "candidateActCodes" (0-5 ' +
  'codici normativi plausibilmente pertinenti, nel formato esatto "D.Lgs. NNN/AAAA", "D.P.R. NNN/AAAA", "L. NNN/AAAA" ' +
  'o "DL NNN/AAAA" — solo se sei ragionevolmente sicuro del numero e dell\'anno, altrimenti lascia l\'elenco vuoto ' +
  'piuttosto che inventare un riferimento); "materiaHint" (una sola parola tra: codice_strada, lavoro, sanita, fisco, ' +
  'giustizia, enti_locali, ambiente, pubblica_amministrazione — solo se applicabile con sicurezza).';

const INTENT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    civicIntent: { type: Type.STRING, description: "Cosa vuole davvero sapere il cittadino, in una frase." },
    expandedTerms: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Parole chiave italiane espanse.' },
    candidateActCodes: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Codici normativi plausibili, solo se certi.' },
    materiaHint: { type: Type.STRING, description: 'Materia giuridica prevalente, se identificabile con sicurezza.' },
  },
  required: ['civicIntent', 'expandedTerms', 'candidateActCodes'],
};

function isValidIntentShape(
  value: unknown,
): value is { civicIntent: string; expandedTerms: unknown[]; candidateActCodes: unknown[]; materiaHint?: unknown } {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.civicIntent === 'string' && Array.isArray(v.expandedTerms) && Array.isArray(v.candidateActCodes);
}

/** Pre-routing step: expands the raw query into search terms and candidate
 * act codes before any retrieval happens. Degrades to a deterministic
 * keyword heuristic — never blocks, never throws — when Gemini is
 * unavailable or its response doesn't match the expected shape. */
async function parseQueryIntent(query: string): Promise<QueryIntent> {
  const heuristic = heuristicIntent(query);
  if (!genAI) return heuristic;

  try {
    const response = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: `DOMANDA DEL CITTADINO: "${query}"`,
      config: {
        systemInstruction: INTENT_SYSTEM_INSTRUCTION,
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: INTENT_SCHEMA,
      },
    });
    const text = response.text?.trim();
    if (!text) return heuristic;
    const parsed = JSON.parse(text);
    if (!isValidIntentShape(parsed)) return heuristic;

    const expandedTerms = dedupe([
      ...heuristic.expandedTerms,
      ...parsed.expandedTerms.filter((t): t is string => typeof t === 'string'),
    ]).slice(0, 12);
    const candidateActCodes = dedupe(parsed.candidateActCodes.filter((c): c is string => typeof c === 'string')).slice(0, 6);
    const materiaHint = typeof parsed.materiaHint === 'string' && parsed.materiaHint.trim() ? parsed.materiaHint.trim() : undefined;

    return { civicIntent: parsed.civicIntent, expandedTerms, candidateActCodes, materiaHint };
  } catch (error) {
    console.warn('[api/rag] Intent parsing failed, using heuristic fallback:', error instanceof Error ? error.message : error);
    return heuristic;
  }
}

// ---------------------------------------------------------------------------
// 4. PROACTIVE EXTERNAL FALLBACK — triggers only when local retrieval came
//    back empty/insufficient (`lib/services/normattiva_resolver.ts`)
// ---------------------------------------------------------------------------

function toHistoricalStatute(norm: ResolvedHistoricalAct): RetrievedHistoricalStatute {
  return {
    actCode: norm.actCode,
    articleNumber: norm.articleNumber,
    officialTitle: norm.officialTitle,
    verbatimSnippet: truncate(norm.verbatimText, HISTORICAL_SNIPPET_LENGTH),
    sourceUrl: norm.sourceUrl,
    isLocallyCached: norm.isLocallyCached,
    isUnavailableNotice: norm.isUnavailableNotice,
  };
}

function buildExternalReferences(
  candidateActCodes: string[],
  seedCodes: string[],
  thematicQuery: string,
  materiaHint: string | undefined,
): ResolveNormOptions[] {
  const references: ResolveNormOptions[] = [];
  const seen = new Set<string>();
  const add = (actCode: string, articleNumber?: string) => {
    const key = actCode.toLowerCase().replace(/[.\s]+/g, '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    references.push(articleNumber ? { actCode, articleNumber } : { actCode });
  };

  for (const code of seedCodes) add(code);
  for (const code of candidateActCodes) add(code);
  for (const foundationAct of matchThematicCorpus(thematicQuery, materiaHint)) {
    add(foundationAct.actCode, foundationAct.defaultArticles[0]);
  }

  return references.slice(0, MAX_EXTERNAL_FALLBACK_SOURCES);
}

/**
 * Requirement #2/#4: when local retrieval has nothing substantive, this
 * proactively resolves the AI-identified candidates and thematic foundation
 * statutes via the resolver (local DB -> durable Supabase cache -> live
 * Normattiva fetch), and — only if that still produced nothing quotable —
 * falls through to a free-text keyword search against Normattiva's own
 * OpenData index. Splits results into `usable` (real verbatim text, safe to
 * cite) and `unavailable` (a known act whose live text just couldn't be
 * fetched in time — never quoted, only used to point the citizen at the
 * official source).
 */
async function resolveExternalFallback(
  candidateActCodes: string[],
  seedCodes: string[],
  query: string,
  expandedTerms: string[],
  materiaHint: string | undefined,
): Promise<{ usable: ResolvedHistoricalAct[]; unavailable: ResolvedHistoricalAct[] }> {
  const thematicQuery = [query, ...expandedTerms].join(' ');
  const references = buildExternalReferences(candidateActCodes, seedCodes, thematicQuery, materiaHint);

  let resolved: ResolvedHistoricalAct[] = [];
  if (references.length > 0) {
    try {
      resolved = await resolveMultipleHistoricalNorms(references);
    } catch (error) {
      console.warn('[api/rag] External reference resolution failed (non-fatal):', error instanceof Error ? error.message : error);
    }
  }

  let usable = resolved.filter((r) => !r.isUnavailableNotice);
  const unavailable = resolved.filter((r) => r.isUnavailableNotice);

  if (usable.length === 0) {
    try {
      usable = await searchNormattivaByKeyword(thematicQuery, MAX_EXTERNAL_FALLBACK_SOURCES);
    } catch (error) {
      console.warn('[api/rag] Keyword-based external search failed (non-fatal):', error instanceof Error ? error.message : error);
    }
  }

  return { usable: usable.slice(0, MAX_EXTERNAL_FALLBACK_SOURCES), unavailable };
}

/** Used only when NOTHING at all — local or external — resolved to real
 * text: a constructive, honest next step rather than a bare dead end. */
function buildNoMatchGuidance(query: string): string {
  return (
    "Non ho trovato, né nell'archivio consultabile né tramite una verifica diretta sui portali istituzionali, un " +
    `testo normativo puntuale su "${query}". Per un riscontro immediato puoi consultare direttamente Normattiva ` +
    '(https://www.normattiva.it), il sito della Camera dei Deputati (https://www.camera.it) o quello del Senato della ' +
    "Repubblica (https://www.senato.it), oppure riformulare la domanda citando la legge, il decreto o l'ambito " +
    'specifico di interesse (es. "codice della strada", "superbonus", "fisco").'
  );
}

/** Used when a specific act's identity IS known (from the AI intent parser,
 * the thematic taxonomy, or the act being resolved itself) but its live
 * text couldn't be fetched — points the citizen at the real official link
 * instead of quoting the "service unavailable" notice as if it were law. */
function buildUnavailableGuidance(unavailable: ResolvedHistoricalAct[]): string {
  if (unavailable.length === 0) return '';
  const list = unavailable.map((n) => `${n.officialTitle} (${n.actCode}) — fonte ufficiale: ${n.sourceUrl}`).join('; ');
  return (
    `Il riferimento normativo più pertinente per questa domanda risulta essere: ${list}. Il portale ufficiale non ha ` +
    'risposto in tempo reale a questa richiesta: consulta il testo integrale direttamente al link indicato, oppure riprova tra qualche istante.'
  );
}

// ---------------------------------------------------------------------------
// 5. DEEP-DIVE / HISTORICAL GROUNDING (thesaurus + resolver)
// ---------------------------------------------------------------------------

/** Combines explicit citations embedded in the retrieved text itself with
 * implicit thematic foundation statutes for the query's domain, deduped and
 * capped so the resolver's network/DB fan-out per request stays bounded. */
function buildHistoricalReferences(sources: AnswerSource[], query: string, scopedMateria?: string): ResolveNormOptions[] {
  const references: ResolveNormOptions[] = [];
  const seen = new Set<string>();

  const add = (actCode: string, articleNumber?: string) => {
    const key = `${actCode.toLowerCase().replace(/[.\s]+/g, '')}::${articleNumber ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    references.push(articleNumber ? { actCode, articleNumber } : { actCode });
  };

  for (const source of sources) {
    for (const reference of extractReferencedActCodes(source.verbatimText)) {
      add(reference.actCode, reference.articleNumber);
    }
  }

  for (const foundationAct of matchThematicCorpus(query, scopedMateria)) {
    add(foundationAct.actCode, foundationAct.defaultArticles[0]);
  }

  return references.slice(0, MAX_HISTORICAL_STATUTES);
}

async function resolveHistoricalStatutes(references: ResolveNormOptions[]): Promise<RetrievedHistoricalStatute[]> {
  if (references.length === 0) return [];
  const resolved = await resolveMultipleHistoricalNorms(references);
  return resolved.map(toHistoricalStatute);
}

// ---------------------------------------------------------------------------
// 6. SYNTHESIS — gemini-3.6-flash, grounded strictly on verified sources
// ---------------------------------------------------------------------------

const SYSTEM_INSTRUCTION =
  'Sei il Servizio Studi imparziale del Parlamento italiano, al servizio della piattaforma di trasparenza civica ' +
  '"La Gazzetta Civica". Ti vengono fornite fonti normative autentiche (testi vigenti sull\'argomento e, quando ' +
  'disponibili, statuti storici collegati). Genera ESATTAMENTE due testi in italiano, senza mai introdurre fatti, ' +
  'cifre o riferimenti normativi non presenti nel materiale ricevuto: ' +
  '"answer" — risposta civica diretta e concreta alla domanda, con una citazione numerica tra parentesi quadre ' +
  '(es. [1], oppure [1][2] se più fonti) dopo OGNI affermazione fattuale tratta dalle fonti principali; ' +
  '"historicalContext" — breve narrativa (3-6 frasi) sull\'evoluzione sistemica del quadro normativo negli ultimi ' +
  'decenni, che collega le fonti principali agli statuti storici di fondazione citandoli per nome/codice (senza usare ' +
  'i numeri delle citazioni di "answer"). Se il materiale ricevuto non copre del tutto un aspetto della domanda, ' +
  "dillo in modo diretto e utile per il cittadino (es. indicando dove approfondire), ma non usare MAI espressioni " +
  'tecniche interne come "Stage 1", "Stage 2", "estratti", "estratti normativi", "snippet", "prompt", "fonti fornite" ' +
  'o "contesto insufficiente": scrivi sempre come se stessi spiegando la materia direttamente a un cittadino che non ' +
  'conosce il funzionamento interno del sistema. Tono tecnico ma accessibile, chiaro e politicamente neutrale.';

const SYNTHESIS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    answer: { type: Type.STRING, description: 'Risposta civica diretta con citazioni numeriche [n] sulle fonti principali.' },
    historicalContext: { type: Type.STRING, description: "Narrativa sull'evoluzione storica del quadro normativo." },
  },
  required: ['answer', 'historicalContext'],
};

function buildSynthesisPrompt(
  query: string,
  sources: AnswerSource[],
  citations: RagCitation[],
  historicalStatutes: RetrievedHistoricalStatute[],
): string {
  const primarySources = citations
    .map((citation, i) => {
      const source = sources[i];
      return (
        `[${citation.index}] ${citation.actCode} — ${citation.actTitle}, Art. ${citation.articleNumber}\n` +
        `"""${truncate(source.verbatimText, SNIPPET_PROMPT_LENGTH)}"""`
      );
    })
    .join('\n\n');

  const realHistoricalStatutes = historicalStatutes.filter((s) => !s.isUnavailableNotice);
  const historicalSources =
    realHistoricalStatutes.length > 0
      ? realHistoricalStatutes
          .map((statute) => `${statute.actCode} — ${statute.officialTitle}, Art. ${statute.articleNumber}\n"""${statute.verbatimSnippet}"""`)
          .join('\n\n')
      : '(nessuno statuto storico di fondazione ulteriore identificato come rilevante per questa domanda)';

  return (
    `DOMANDA DEL CITTADINO: "${query}"\n\n` +
    `FONTI VERIFICATE (usa SOLO queste per "answer", citando ogni affermazione con [n]):\n${primarySources}\n\n` +
    `QUADRO STORICO DI RIFERIMENTO (usa insieme alle fonti verificate per "historicalContext"):\n${historicalSources}\n\n` +
    'Genera "answer" e "historicalContext" come specificato nelle istruzioni di sistema.'
  );
}

function fallbackHistoricalContext(historicalStatutes: RetrievedHistoricalStatute[]): string {
  const real = historicalStatutes.filter((s) => !s.isUnavailableNotice);
  if (real.length === 0) {
    return 'Nessuno statuto storico di fondazione aggiuntivo è stato identificato come direttamente collegato a questa domanda.';
  }
  const list = real.map((statute) => `${statute.actCode} (${statute.officialTitle})`).join('; ');
  return `Il quadro normativo di riferimento include anche: ${list}. Consultare i testi integrali riportati per il dettaglio delle disposizioni storiche tuttora vigenti o richiamate.`;
}

function isValidSynthesisShape(value: unknown): value is { answer: string; historicalContext: string } {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.answer === 'string' && v.answer.length > 0 && typeof v.historicalContext === 'string' && v.historicalContext.length > 0;
}

async function synthesizeExtended(
  query: string,
  sources: AnswerSource[],
  citations: RagCitation[],
  historicalStatutes: RetrievedHistoricalStatute[],
): Promise<{ answer: string; historicalContext: string }> {
  const fallback = { answer: fallbackAnswer(sources, citations), historicalContext: fallbackHistoricalContext(historicalStatutes) };
  if (!genAI) return fallback;

  try {
    const response = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: buildSynthesisPrompt(query, sources, citations, historicalStatutes),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: SYNTHESIS_SCHEMA,
      },
    });
    const text = response.text?.trim();
    if (!text) throw new Error('Gemini returned an empty response');
    const parsed = JSON.parse(text);
    if (!isValidSynthesisShape(parsed)) throw new Error('Gemini response did not match the expected synthesis schema');
    return parsed;
  } catch (error) {
    console.warn('[api/rag] Gemini synthesis failed, using deterministic fallback:', error instanceof Error ? error.message : error);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// 7. SEMANTIC CACHE (`RagQueryCache`)
// ---------------------------------------------------------------------------

/** Exact formula requested: a plain, human-readable normalized query with
 * the act scope folded in as a suffix — this is `RagQueryCache`'s only
 * unique column, so scope has to live inside the key itself. */
function normalizedCacheQuery(query: string, actId?: string): string {
  return query.trim().toLowerCase() + (actId ? `::${actId}` : '');
}

function readCachedResponse(
  query: string,
  cached: { answer: string; citations: Prisma.JsonValue; extendedAnalysis: Prisma.JsonValue },
): RagResponse {
  return {
    query,
    answer: cached.answer,
    citations: (cached.citations as unknown as RagCitation[]) ?? [],
    extendedAnalysis: (cached.extendedAnalysis as unknown as ExtendedHistoricalAnalysis) ?? EMPTY_EXTENDED_ANALYSIS,
    isCached: true,
  };
}

// ---------------------------------------------------------------------------
// 8. ROUTE HANDLER
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const payload = (body ?? {}) as { query?: unknown; actId?: unknown; stage?: unknown };
  const query = typeof payload.query === 'string' ? payload.query.trim() : '';
  const actId = typeof payload.actId === 'string' && payload.actId.trim() ? payload.actId.trim() : undefined;
  const stage: RagStage = payload.stage === 'stage1' || payload.stage === 'stage2' ? payload.stage : 'all';

  if (!query) {
    return NextResponse.json({ error: 'Missing required "query" string in the request body.' }, { status: 400 });
  }

  const key = normalizedCacheQuery(query, actId);

  // --- Step 0: semantic cache lookup — instant, zero-token path. Served
  // regardless of the requested `stage`, since a cached full result is
  // always at least as complete as any partial stage would produce. ---
  try {
    const cached = await prisma.ragQueryCache.findUnique({ where: { normalizedQuery: key } });
    if (cached) {
      prisma.ragQueryCache.update({ where: { id: cached.id }, data: { hitCount: { increment: 1 } } }).catch((error) => {
        console.warn('[api/rag] Failed to increment cache hitCount (non-fatal):', error);
      });
      return NextResponse.json(readCachedResponse(query, cached));
    }
  } catch (error) {
    console.warn('[api/rag] Cache lookup failed, continuing without cache:', error);
  }

  // --- Step 1: intent parsing & query expansion (skipped, for cost, when
  // the request is already scoped to one act — retrieval there is exact). ---
  const intent = actId ? heuristicIntent(query) : await parseQueryIntent(query);

  // --- Step 2: local retrieval — a DB failure degrades to "no local
  // results" instead of a dead end, so the proactive fallback below can
  // still answer from a live external fetch even during a local outage. ---
  let retrieved: RetrievedArticle[] = [];
  try {
    retrieved = actId ? await retrieveByAct(actId) : await retrieveByQuery(query, intent.expandedTerms);
  } catch (error) {
    console.warn('[api/rag] Local retrieval failed (non-fatal, continuing with the proactive external fallback):', error);
    retrieved = [];
  }

  // A per-act request is exact by construction (every article really does
  // belong to that act), so the topical-relevance check only matters for
  // the open-ended cross-corpus search.
  const baseTerms = extractKeywords(query);
  const retrievalTerms = dedupe([...baseTerms, ...intent.expandedTerms]);
  const substantiveLocal = retrieved.filter(
    (article) => isSubstantiveArticle(article) && (Boolean(actId) || isTopicallyRelevant(article, baseTerms, retrievalTerms)),
  );
  let sources: AnswerSource[] = substantiveLocal.map(fromLocalArticle);

  // --- Step 3: proactive external fallback — only when local coverage is
  // missing or insufficient (requirement #2's mandatory Phase B). ---
  let unavailableExternal: ResolvedHistoricalAct[] = [];
  if (substantiveLocal.length === 0) {
    const seedCodes = actId && retrieved[0] ? [retrieved[0].act.code] : [];
    const { usable, unavailable } = await resolveExternalFallback(
      intent.candidateActCodes,
      seedCodes,
      query,
      intent.expandedTerms,
      intent.materiaHint,
    );
    sources = usable.map(fromExternalNorm).slice(0, MAX_SNIPPETS);
    unavailableExternal = unavailable;
  }

  // --- Absolute last resort: nothing local AND nothing external resolved
  // to real, quotable text. Never a bare error — always a constructive next
  // step, using whichever act identity (if any) we DID manage to confirm. ---
  if (sources.length === 0) {
    const historicalStatutes = unavailableExternal.map(toHistoricalStatute);
    const answer = unavailableExternal.length > 0 ? buildUnavailableGuidance(unavailableExternal) : buildNoMatchGuidance(query);
    const response: RagResponse = {
      query,
      answer,
      citations: [],
      extendedAnalysis: {
        historicalContext: fallbackHistoricalContext(historicalStatutes),
        retrievedHistoricalStatutes: historicalStatutes,
        comparativeTable: [],
        neutralTechnicalDossier: { pros: [], cons: [] },
      },
    };
    // Not cached — this is a transient/coverage gap that can (and should)
    // resolve itself as the corpus grows or the external portal recovers.
    return NextResponse.json(response);
  }

  const citations = buildCitations(sources);
  const comparativeTable = buildComparativeTable(sources);
  const neutralTechnicalDossier = buildNeutralDossier(sources);
  const guidanceSuffix = buildUnavailableGuidance(unavailableExternal);

  // --- `stage: 'stage1'` fast path: deterministic, no synthesis Gemini
  // call, no deep-dive fan-out — never written to cache since it's
  // intentionally partial (a later 'all'/'stage2' request must still
  // compute and cache the full pipeline). ---
  if (stage === 'stage1') {
    const response: RagResponse = {
      query,
      answer: [fallbackAnswer(sources, citations), guidanceSuffix].filter(Boolean).join('\n\n'),
      citations,
      extendedAnalysis: { ...EMPTY_EXTENDED_ANALYSIS, comparativeTable, neutralTechnicalDossier },
    };
    return NextResponse.json(response);
  }

  // --- Step 4: deep-dive historical grounding. ---
  const scopedMateria = actId ? substantiveLocal[0]?.act.materia : undefined;
  const historicalReferences = buildHistoricalReferences(sources, query, scopedMateria);
  let historicalStatutes: RetrievedHistoricalStatute[] = [];
  try {
    historicalStatutes = await resolveHistoricalStatutes(historicalReferences);
  } catch (error) {
    console.warn('[api/rag] Deep-dive historical grounding failed (non-fatal, continuing without it):', error);
  }
  // Avoid showing the same source twice (once as a primary citation, once
  // again as a "historical foundation statute" card).
  const citedKeys = new Set(citations.map((c) => `${c.actCode.toLowerCase().replace(/[.\s]+/g, '')}::${c.articleNumber}`));
  historicalStatutes = historicalStatutes.filter((s) => !citedKeys.has(`${s.actCode.toLowerCase().replace(/[.\s]+/g, '')}::${s.articleNumber}`));

  // --- Step 5: synthesis (Gemini, with a guaranteed-200 fallback). ---
  const synthesized = await synthesizeExtended(query, sources, citations, historicalStatutes);
  const answer = [synthesized.answer, guidanceSuffix].filter(Boolean).join('\n\n');

  const extendedAnalysis: ExtendedHistoricalAnalysis = {
    historicalContext: synthesized.historicalContext,
    retrievedHistoricalStatutes: historicalStatutes,
    comparativeTable,
    neutralTechnicalDossier,
  };

  const response: RagResponse = { query, answer, citations, extendedAnalysis };

  // --- Step 6: write-through cache (best-effort — never blocks the response). ---
  try {
    await prisma.ragQueryCache.upsert({
      where: { normalizedQuery: key },
      update: {
        actId: actId ?? null,
        answer: response.answer,
        citations: citations as unknown as Prisma.InputJsonValue,
        extendedAnalysis: extendedAnalysis as unknown as Prisma.InputJsonValue,
        hitCount: { increment: 1 },
      },
      create: {
        normalizedQuery: key,
        actId: actId ?? null,
        answer: response.answer,
        citations: citations as unknown as Prisma.InputJsonValue,
        extendedAnalysis: extendedAnalysis as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.warn('[api/rag] Failed to write RAG cache entry (non-fatal):', error);
  }

  return NextResponse.json(response);
}
