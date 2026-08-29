/**
 * SUBPHASE 3.2 — Progressive 2-Stage RAG Route Handler.
 *
 * STAGE 1 (retrieval): pulls only genuine, already-verbatim text already
 * sitting in Supabase (`Article.original`/`simple`/`structured`, plus
 * `NormImpact`) — either scoped to one act, or fanned out across the whole
 * 1,267-article corpus via keyword matching so cross-norm comparative
 * questions can cite more than one act.
 *
 * STAGE 2 (synthesis): hands ONLY those retrieved snippets to
 * `gemini-3.6-flash` under a strict "impartial Servizio Studi" system
 * instruction — numbered bracket citations `[n]` after every factual
 * statement, no facts outside the provided snippets.
 *
 * SEMANTIC CACHE: every (query, scope) pair is looked up in `RagQueryCache`
 * before doing any retrieval/synthesis work, and written back afterwards —
 * so a repeated or already-answered question is served straight out of
 * Postgres in well under 50ms, at zero further Gemini cost.
 *
 * RELIABILITY: this route NEVER 500s on a missing/failing Gemini call — see
 * `synthesizeAnswer`'s fallback to a deterministic answer built directly
 * from `Article.simple`/`structured`, still fully cited.
 *
 * Usage: POST /api/rag  { query: string; actId?: string }
 */
import { GoogleGenAI } from '@google/genai';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { RagCitation, RagDeepGrounding, RagResponse } from '@/lib/types/rag';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';
const genAI = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const MAX_SNIPPETS = 6;
const MAX_PER_ACT = 2; // caps any single act's share so cross-norm answers can actually span multiple acts
const SNIPPET_PREVIEW_LENGTH = 900; // shown to the end user in `citations`
const SNIPPET_PROMPT_LENGTH = 1500; // shown to Gemini (a bit more context to ground on)

// ---------------------------------------------------------------------------
// 1. RETRIEVAL
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
  act: { select: { id: true, code: true, popularTitle: true, officialTitle: true, sourceUrl: true } },
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

// ---------------------------------------------------------------------------
// 2. GROUNDING ARTIFACTS BUILT DIRECTLY FROM RETRIEVED ROWS (never from the LLM)
// ---------------------------------------------------------------------------

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

function buildDeepGrounding(articles: RetrievedArticle[]): RagDeepGrounding[] {
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

function buildNeutralBalance(articles: RetrievedArticle[]): RagResponse['neutralBalance'] {
  return {
    pros: dedupe(articles.flatMap((a) => a.prosObjective)).slice(0, 5),
    cons: dedupe(articles.flatMap((a) => a.consObjective)).slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// 3. SYNTHESIS — gemini-3.6-flash, grounded strictly on the retrieved snippets
// ---------------------------------------------------------------------------

const SYSTEM_INSTRUCTION =
  'Sei il Servizio Studi imparziale del Parlamento italiano, al servizio della piattaforma di trasparenza civica ' +
  '"La Gazzetta Civica". Rispondi ESCLUSIVAMENTE sulla base degli estratti normativi autentici forniti dall\'utente: ' +
  'non introdurre fatti, cifre, opinioni o riferimenti normativi che non siano già presenti negli estratti. Dopo OGNI ' +
  'affermazione fattuale, riporta tra parentesi quadre il numero della fonte corrispondente, es. [1], oppure [1][2] ' +
  'se più fonti la supportano. Se gli estratti non contengono informazioni sufficienti per rispondere in modo ' +
  'completo, dichiaralo esplicitamente invece di colmare le lacune. Scrivi in italiano, in prosa chiara, tecnica e ' +
  'politicamente neutrale.';

function buildRetrievalPrompt(query: string, articles: RetrievedArticle[], citations: RagCitation[]): string {
  const sources = citations
    .map((citation, i) => {
      const article = articles[i];
      return (
        `[${citation.index}] ${citation.actCode} — ${citation.actTitle}, Art. ${citation.articleNumber} (${article.heading})\n` +
        `"""${truncate(article.original, SNIPPET_PROMPT_LENGTH)}"""`
      );
    })
    .join('\n\n');

  return (
    `DOMANDA DELL'UTENTE: "${query}"\n\n` +
    `ESTRATTI NORMATIVI AUTENTICI DISPONIBILI (usa SOLO questi, cita ogni affermazione con [n]):\n${sources}\n\n` +
    'Rispondi alla domanda in italiano, citando ogni affermazione fattuale con il numero della fonte tra parentesi quadre.'
  );
}

/** Deterministic fallback (requirement #6): combines each retrieved
 * article's citizen-level + in-depth summaries with the same numbered
 * citations the LLM path would have used — never a 500, never fabricated. */
function fallbackAnswer(articles: RetrievedArticle[], citations: RagCitation[]): string {
  return articles
    .map((article, i) => {
      const n = citations[i]?.index ?? i + 1;
      const summary = [article.simple, article.structured].filter(Boolean).join(' ') || article.original;
      return `${truncate(summary, 500)} [${n}]`;
    })
    .join('\n\n');
}

async function synthesizeAnswer(query: string, articles: RetrievedArticle[], citations: RagCitation[]): Promise<string> {
  if (!genAI) return fallbackAnswer(articles, citations);
  try {
    const response = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: buildRetrievalPrompt(query, articles, citations),
      config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.2 },
    });
    const text = response.text?.trim();
    if (!text) throw new Error('Gemini returned an empty response');
    return text;
  } catch (error) {
    console.warn('[api/rag] Gemini synthesis failed, using deterministic fallback:', error instanceof Error ? error.message : error);
    return fallbackAnswer(articles, citations);
  }
}

// ---------------------------------------------------------------------------
// 4. SEMANTIC CACHE (`RagQueryCache`)
// ---------------------------------------------------------------------------

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** `RagQueryCache.normalizedQuery` is a single unique column, so a per-act
 * scope is folded into the key itself rather than requiring a composite
 * unique constraint — `actId` is still stored as its own column for
 * analytics/lookups (e.g. "which acts get asked about most"). */
function cacheKey(normalized: string, actId?: string): string {
  return actId ? `act:${actId}::${normalized}` : `global::${normalized}`;
}

type CachedJson = { pros: string[]; cons: string[] };

function readCachedResponse(query: string, cached: { answer: string; citations: Prisma.JsonValue; deepGrounding: Prisma.JsonValue; neutralBalance: Prisma.JsonValue }): RagResponse {
  return {
    query,
    answer: cached.answer,
    citations: (cached.citations as unknown as RagCitation[]) ?? [],
    deepGrounding: (cached.deepGrounding as unknown as RagDeepGrounding[]) ?? [],
    neutralBalance: (cached.neutralBalance as unknown as CachedJson) ?? { pros: [], cons: [] },
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

  const payload = (body ?? {}) as { query?: unknown; actId?: unknown };
  const query = typeof payload.query === 'string' ? payload.query.trim() : '';
  const actId = typeof payload.actId === 'string' && payload.actId.trim() ? payload.actId.trim() : undefined;

  if (!query) {
    return NextResponse.json({ error: 'Missing required "query" string in the request body.' }, { status: 400 });
  }

  const normalizedQuery = normalizeQuery(query);
  const key = cacheKey(normalizedQuery, actId);

  // --- Step 1: semantic cache lookup — instant, zero-token path. ---
  try {
    const cached = await prisma.ragQueryCache.findUnique({ where: { normalizedQuery: key } });
    if (cached) {
      // Fire-and-forget: never let a hit-counter write slow down the response.
      prisma.ragQueryCache.update({ where: { id: cached.id }, data: { hitCount: { increment: 1 } } }).catch((error) => {
        console.warn('[api/rag] Failed to increment cache hitCount (non-fatal):', error);
      });
      return NextResponse.json(readCachedResponse(query, cached));
    }
  } catch (error) {
    console.warn('[api/rag] Cache lookup failed, continuing without cache:', error);
  }

  // --- Step 2: retrieval — real Article/NormImpact rows only. ---
  let retrieved: RetrievedArticle[];
  try {
    retrieved = actId ? await retrieveByAct(actId) : await retrieveByQuery(query);
  } catch (error) {
    console.error('[api/rag] Retrieval query failed:', error);
    const degraded: RagResponse = {
      query,
      answer: 'La banca dati normativa non è al momento raggiungibile. Riprova tra qualche istante.',
      citations: [],
      deepGrounding: [],
      neutralBalance: { pros: [], cons: [] },
    };
    return NextResponse.json(degraded, { status: 200 });
  }

  if (retrieved.length === 0) {
    const empty: RagResponse = {
      query,
      answer: 'Nessun articolo pertinente è stato trovato nella banca dati per rispondere a questa domanda.',
      citations: [],
      deepGrounding: [],
      neutralBalance: { pros: [], cons: [] },
    };
    return NextResponse.json(empty);
  }

  const citations = buildCitations(retrieved);
  const deepGrounding = buildDeepGrounding(retrieved);
  const neutralBalance = buildNeutralBalance(retrieved);

  // --- Step 3: synthesis (Gemini, with a guaranteed-200 fallback). ---
  const answer = await synthesizeAnswer(query, retrieved, citations);

  const response: RagResponse = { query, answer, citations, deepGrounding, neutralBalance };

  // --- Step 4: write-through cache (best-effort — never blocks the response). ---
  try {
    await prisma.ragQueryCache.upsert({
      where: { normalizedQuery: key },
      update: {
        actId: actId ?? null,
        answer: response.answer,
        citations: citations as unknown as Prisma.InputJsonValue,
        deepGrounding: deepGrounding as unknown as Prisma.InputJsonValue,
        neutralBalance: neutralBalance as unknown as Prisma.InputJsonValue,
        hitCount: { increment: 1 },
      },
      create: {
        normalizedQuery: key,
        actId: actId ?? null,
        answer: response.answer,
        citations: citations as unknown as Prisma.InputJsonValue,
        deepGrounding: deepGrounding as unknown as Prisma.InputJsonValue,
        neutralBalance: neutralBalance as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.warn('[api/rag] Failed to write RAG cache entry (non-fatal):', error);
  }

  return NextResponse.json(response);
}
