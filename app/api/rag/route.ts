/**
 * PHASE 3 — Progressive 2-Stage RAG Route Handler.
 *
 * STAGE 1 (retrieval): pulls only genuine, already-verbatim text already
 * sitting in Supabase (`Article.original`/`simple`/`structured`, plus
 * `NormImpact`) — either scoped to one act, or fanned out across the whole
 * 1,267-article corpus via keyword matching so cross-norm comparative
 * questions can cite more than one act. This is the source of every
 * numbered `[n]` citation the end user sees.
 *
 * STAGE 2 (dynamic historical grounding): detects which older "foundation"
 * statutes the Stage 1 snippets implicate — both explicitly (citations
 * embedded in the verbatim text itself, via
 * `lib/taxonomy/legalThesaurus.ts#extractReferencedActCodes`) and
 * implicitly (thematic domain matching via `matchThematicCorpus`) — then
 * resolves their real text on demand via
 * `lib/services/normattiva_resolver.ts#resolveMultipleHistoricalNorms`
 * (local DB first, live Normattiva fetch second).
 *
 * SYNTHESIS: hands BOTH stages' authentic snippets to `gemini-3.6-flash`
 * under a strict "impartial Servizio Studi" system instruction — numbered
 * bracket citations `[n]` in `answer` (Stage 1 only), a historical
 * narrative in `extendedAnalysis.historicalContext` (both stages). The
 * comparative table and pros/cons dossier are built directly from real DB
 * rows (`NormImpact`, `Article.prosObjective`/`consObjective`) rather than
 * left to the LLM, consistent with this project's "never invent legal
 * facts" rule — the LLM only ever writes prose over already-verified data.
 *
 * PROGRESSIVE STAGES: `stage: 'stage1'` returns a fast, deterministic,
 * Stage-1-only preview (no Gemini call, no Stage 2 network fetches, not
 * cached); `stage: 'stage2'` and the default `'all'` both run the full
 * pipeline and write through to `RagQueryCache`. A cache hit is served
 * regardless of the requested stage, since a cached full result is always
 * at least as complete as any partial stage would produce.
 *
 * SEMANTIC CACHE: every (query, actId) pair is looked up in `RagQueryCache`
 * before doing any retrieval/synthesis work, and written back afterwards —
 * so a repeated question is served straight out of Postgres in well under
 * 50ms, at zero further Gemini cost.
 *
 * RELIABILITY: this route NEVER 500s on a missing/failing Gemini call or a
 * failing Stage 2 network fetch — see `synthesizeExtended`'s deterministic
 * fallback and the try/catch around historical resolution.
 *
 * Usage: POST /api/rag  { query: string; actId?: string; stage?: 'all' | 'stage1' | 'stage2' }
 */
import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { extractReferencedActCodes, matchThematicCorpus } from '@/lib/taxonomy/legalThesaurus';
import { resolveMultipleHistoricalNorms, type ResolveNormOptions } from '@/lib/services/normattiva_resolver';
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
const MAX_HISTORICAL_STATUTES = 4; // caps Stage 2 network/DB fan-out per request
const SNIPPET_PREVIEW_LENGTH = 900; // shown to the end user in `citations`
const SNIPPET_PROMPT_LENGTH = 1500; // shown to Gemini (a bit more context to ground on)
const HISTORICAL_SNIPPET_LENGTH = 700; // shown in `retrievedHistoricalStatutes`/to Gemini

const EMPTY_EXTENDED_ANALYSIS: ExtendedHistoricalAnalysis = {
  historicalContext: '',
  retrievedHistoricalStatutes: [],
  comparativeTable: [],
  neutralTechnicalDossier: { pros: [], cons: [] },
};

// ---------------------------------------------------------------------------
// 1. STAGE 1 — RETRIEVAL (Supabase, 1,267 authentic articles)
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
]);

function extractKeywords(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/[^a-zà-ù0-9]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length > 3 && !ITALIAN_STOPWORDS.has(w));
  return words.length > 0 ? [...new Set(words)] : [query.trim()].filter(Boolean);
}

/** Cross-act keyword retrieval: matches any keyword against the act's own
 * title/subject fields as well as the article's heading/text fields, then
 * diversifies the result so a single dominant act can't crowd out the
 * comparative, cross-norm answers this stage exists to enable. */
async function retrieveByQuery(query: string): Promise<RetrievedArticle[]> {
  const terms = extractKeywords(query);

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

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function buildCitations(articles: RetrievedArticle[]): RagCitation[] {
  return articles.map((article, i) => ({
    index: i + 1,
    actId: article.act.id,
    actCode: article.act.code,
    actTitle: article.act.popularTitle || article.act.officialTitle,
    articleNumber: article.number,
    snippetVerbatim: truncate(article.original, SNIPPET_PREVIEW_LENGTH),
    officialSourceUrl: article.act.sourceUrl || undefined,
  }));
}

function buildComparativeTable(articles: RetrievedArticle[]): ComparativeDeepGrounding[] {
  return articles.flatMap((article) =>
    article.impacts.map((impact) => ({
      modifiedActCode: impact.modifiedActCode,
      targetArticle: impact.targetArticle,
      impactType: impact.impactType,
      previousRuleSummary: impact.previousRuleSummary,
      newEffectSummary: impact.newEffectSummary,
      officialSourceUrl: impact.officialSourceUrl ?? undefined,
    })),
  );
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}

function buildNeutralDossier(articles: RetrievedArticle[]): ExtendedHistoricalAnalysis['neutralTechnicalDossier'] {
  return {
    pros: dedupe(articles.flatMap((a) => a.prosObjective)).slice(0, 5),
    cons: dedupe(articles.flatMap((a) => a.consObjective)).slice(0, 5),
  };
}

/** Deterministic answer (also the Stage-1-only fast path, and the fallback
 * when Gemini is unavailable/fails): combines each retrieved article's
 * citizen-level + in-depth summaries with the same numbered citations the
 * LLM path would have used — never a 500, never fabricated. */
function fallbackAnswer(articles: RetrievedArticle[], citations: RagCitation[]): string {
  return articles
    .map((article, i) => {
      const n = citations[i]?.index ?? i + 1;
      const summary = [article.simple, article.structured].filter(Boolean).join(' ') || article.original;
      return `${truncate(summary, 500)} [${n}]`;
    })
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// 2. STAGE 2 — DYNAMIC HISTORICAL GROUNDING (thesaurus + Normattiva resolver)
// ---------------------------------------------------------------------------

/** Combines explicit citations embedded in the Stage 1 snippets themselves
 * with implicit thematic foundation statutes for the query's domain, deduped
 * and capped so `resolveMultipleHistoricalNorms`'s network/DB fan-out per
 * request stays bounded. */
function buildHistoricalReferences(articles: RetrievedArticle[], query: string, scopedMateria?: string): ResolveNormOptions[] {
  const references: ResolveNormOptions[] = [];
  const seen = new Set<string>();

  const add = (actCode: string, articleNumber?: string) => {
    const key = `${actCode.toLowerCase().replace(/[.\s]+/g, '')}::${articleNumber ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    references.push(articleNumber ? { actCode, articleNumber } : { actCode });
  };

  for (const article of articles) {
    for (const reference of extractReferencedActCodes(article.original)) {
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
  return resolved.map((statute) => ({
    actCode: statute.actCode,
    articleNumber: statute.articleNumber,
    officialTitle: statute.officialTitle,
    verbatimSnippet: truncate(statute.verbatimText, HISTORICAL_SNIPPET_LENGTH),
    sourceUrl: statute.sourceUrl,
    isLocallyCached: statute.isLocallyCached,
  }));
}

// ---------------------------------------------------------------------------
// 3. SYNTHESIS — gemini-3.6-flash, grounded strictly on both stages' snippets
// ---------------------------------------------------------------------------

const SYSTEM_INSTRUCTION =
  'Sei il Servizio Studi imparziale del Parlamento italiano, al servizio della piattaforma di trasparenza civica ' +
  '"La Gazzetta Civica". Ti vengono forniti due gruppi di estratti normativi autentici: Stage 1 (articoli vigenti ' +
  'sull\'argomento) e Stage 2 (statuti storici di fondazione collegati). Genera ESATTAMENTE due testi in italiano, ' +
  'senza mai introdurre fatti, cifre o riferimenti normativi non presenti negli estratti: ' +
  '"answer" — risposta civica diretta alla domanda, basata ESCLUSIVAMENTE sugli estratti Stage 1, con una citazione ' +
  'numerica tra parentesi quadre (es. [1], oppure [1][2] se più fonti) dopo OGNI affermazione fattuale; ' +
  '"historicalContext" — breve narrativa (3-6 frasi) sull\'evoluzione sistemica del quadro normativo negli ultimi ' +
  'decenni, che collega gli estratti Stage 1 agli statuti storici di Stage 2 citandoli per nome/codice (senza usare ' +
  'i numeri delle citazioni di "answer"). Se un gruppo di estratti non contiene informazioni sufficienti, dichiaralo ' +
  'esplicitamente invece di colmare le lacune. Tono tecnico, chiaro e politicamente neutrale.';

const SYNTHESIS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    answer: { type: Type.STRING, description: 'Risposta civica diretta con citazioni numeriche [n] sugli estratti Stage 1.' },
    historicalContext: { type: Type.STRING, description: 'Narrativa sull\'evoluzione storica del quadro normativo, Stage 1 + Stage 2.' },
  },
  required: ['answer', 'historicalContext'],
};

function buildSynthesisPrompt(
  query: string,
  articles: RetrievedArticle[],
  citations: RagCitation[],
  historicalStatutes: RetrievedHistoricalStatute[],
): string {
  const stage1Sources = citations
    .map((citation, i) => {
      const article = articles[i];
      return (
        `[${citation.index}] ${citation.actCode} — ${citation.actTitle}, Art. ${citation.articleNumber} (${article.heading})\n` +
        `"""${truncate(article.original, SNIPPET_PROMPT_LENGTH)}"""`
      );
    })
    .join('\n\n');

  const stage2Sources =
    historicalStatutes.length > 0
      ? historicalStatutes
          .map((statute) => `${statute.actCode} — ${statute.officialTitle}, Art. ${statute.articleNumber}\n"""${statute.verbatimSnippet}"""`)
          .join('\n\n')
      : '(nessuno statuto storico di fondazione identificato come rilevante per questa domanda)';

  return (
    `DOMANDA DELL'UTENTE: "${query}"\n\n` +
    `STAGE 1 — ESTRATTI VERIFICATI (usa SOLO questi per "answer", citando ogni affermazione con [n]):\n${stage1Sources}\n\n` +
    `STAGE 2 — STATUTI STORICI DI FONDAZIONE (usa questi insieme a Stage 1 per "historicalContext"):\n${stage2Sources}\n\n` +
    'Genera "answer" e "historicalContext" come specificato nelle istruzioni di sistema.'
  );
}

function fallbackHistoricalContext(historicalStatutes: RetrievedHistoricalStatute[]): string {
  if (historicalStatutes.length === 0) {
    return 'Nessuno statuto storico di fondazione è stato identificato come direttamente collegato a questa domanda.';
  }
  const list = historicalStatutes.map((statute) => `${statute.actCode} (${statute.officialTitle})`).join('; ');
  return `Il quadro normativo di riferimento include anche: ${list}. Consultare i testi integrali riportati per il dettaglio delle disposizioni storiche tuttora vigenti o richiamate.`;
}

function isValidSynthesisShape(value: unknown): value is { answer: string; historicalContext: string } {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.answer === 'string' && v.answer.length > 0 && typeof v.historicalContext === 'string' && v.historicalContext.length > 0;
}

async function synthesizeExtended(
  query: string,
  articles: RetrievedArticle[],
  citations: RagCitation[],
  historicalStatutes: RetrievedHistoricalStatute[],
): Promise<{ answer: string; historicalContext: string }> {
  const fallback = { answer: fallbackAnswer(articles, citations), historicalContext: fallbackHistoricalContext(historicalStatutes) };
  if (!genAI) return fallback;

  try {
    const response = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: buildSynthesisPrompt(query, articles, citations, historicalStatutes),
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
// 4. SEMANTIC CACHE (`RagQueryCache`)
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
// 5. ROUTE HANDLER
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

  // --- Step 1: semantic cache lookup — instant, zero-token path. Served
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

  // --- Step 2: Stage 1 retrieval — real Article/NormImpact rows only. ---
  let retrieved: RetrievedArticle[];
  try {
    retrieved = actId ? await retrieveByAct(actId) : await retrieveByQuery(query);
  } catch (error) {
    console.error('[api/rag] Stage 1 retrieval failed:', error);
    const degraded: RagResponse = {
      query,
      answer: 'La banca dati normativa non è al momento raggiungibile. Riprova tra qualche istante.',
      citations: [],
      extendedAnalysis: EMPTY_EXTENDED_ANALYSIS,
    };
    return NextResponse.json(degraded, { status: 200 });
  }

  if (retrieved.length === 0) {
    const empty: RagResponse = {
      query,
      answer: 'Nessun articolo pertinente è stato trovato nella banca dati per rispondere a questa domanda.',
      citations: [],
      extendedAnalysis: EMPTY_EXTENDED_ANALYSIS,
    };
    return NextResponse.json(empty);
  }

  const citations = buildCitations(retrieved);
  const comparativeTable = buildComparativeTable(retrieved);
  const neutralTechnicalDossier = buildNeutralDossier(retrieved);

  // --- `stage: 'stage1'` fast path: deterministic, no Gemini call, no
  // Stage 2 network fetches — never written to cache since it's
  // intentionally incomplete (a later 'all'/'stage2' request must still
  // compute and cache the full pipeline). ---
  if (stage === 'stage1') {
    const response: RagResponse = {
      query,
      answer: fallbackAnswer(retrieved, citations),
      citations,
      extendedAnalysis: { ...EMPTY_EXTENDED_ANALYSIS, comparativeTable, neutralTechnicalDossier },
    };
    return NextResponse.json(response);
  }

  // --- Step 3: Stage 2 historical grounding. ---
  const scopedMateria = actId ? retrieved[0]?.act.materia : undefined;
  const historicalReferences = buildHistoricalReferences(retrieved, query, scopedMateria);
  let historicalStatutes: RetrievedHistoricalStatute[] = [];
  try {
    historicalStatutes = await resolveHistoricalStatutes(historicalReferences);
  } catch (error) {
    console.warn('[api/rag] Stage 2 historical grounding failed (non-fatal, continuing without it):', error);
  }

  // --- Step 4: synthesis (Gemini, with a guaranteed-200 fallback). ---
  const { answer, historicalContext } = await synthesizeExtended(query, retrieved, citations, historicalStatutes);

  const extendedAnalysis: ExtendedHistoricalAnalysis = {
    historicalContext,
    retrievedHistoricalStatutes: historicalStatutes,
    comparativeTable,
    neutralTechnicalDossier,
  };

  const response: RagResponse = { query, answer, citations, extendedAnalysis };

  // --- Step 5: write-through cache (best-effort — never blocks the response). ---
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
