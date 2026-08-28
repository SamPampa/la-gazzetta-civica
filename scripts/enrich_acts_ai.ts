/**
 * SUBPHASE 3.1 — Batch AI Enrichment Pipeline (live Gemini pass).
 *
 * Walks every `Article` in the database and generates the "Livello 1/2/3"
 * reading experience (🟢 cittadino / 🟡 approfondimento / 🔴 giurista) plus
 * objective pros/cons and refined `NormImpact` cross-reference summaries —
 * straight from the real `original` legal text already sitting in the DB
 * (populated by `ingest_parliament.ts` / `ingest_senato.ts` /
 * `ingest_normattiva.ts`).
 *
 * AI PROVIDER: `@google/genai`, targeting `gemini-3.6-flash` (configurable
 * via `GEMINI_MODEL`), using `GEMINI_API_KEY` from `.env` — billed tier, no
 * lite-model fallback. Structured output is enforced with a
 * `responseSchema` (not just prompt instructions), so the SDK itself
 * rejects malformed shapes before they ever reach our code.
 *
 * HONESTY NOTE ON SCOPE (unchanged from the pre-Gemini version of this
 * script): if `GEMINI_API_KEY` is missing, or a specific call fails/returns
 * something that still doesn't validate, that one article silently degrades
 * to a deterministic, fully-functional extractive-summarization heuristic
 * built directly from the article's own `original`/`structured` text —
 * never a hallucinated placeholder, and never a halted batch (requirement
 * #3 in the original spec). Articles whose `original` text is still one of
 * the earlier ingestion scripts' honest "testo integrale non ancora
 * acquisito" placeholders are detected and skipped for prose generation
 * entirely (no Gemini call spent on non-existent legal text) — they get a
 * short, clearly-labelled scope note instead.
 *
 * RATE LIMITING: a fixed delay is awaited after every *real* Gemini call
 * (not after heuristic/placeholder paths, which make no network call) to
 * stay comfortably under free-tier RPM quotas.
 *
 * Usage: npm run db:enrich:ai
 */
import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BATCH_SIZE = 5; // acts processed concurrently, per requirement #5
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Model pinned strictly to `gemini-3.6-flash` per project requirement — the
// account now has active billing credits, which lifts the free-tier
// 20-requests/day ceiling that was previously hit on this exact model.
// Override via `GEMINI_MODEL` only if you deliberately need a different one.
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';
// Baseline delay awaited after every real Gemini call, per requirement #2.3.
const RATE_LIMIT_DELAY_MS = Number(process.env.GEMINI_RATE_LIMIT_MS ?? 500);
// Requests-per-minute ceiling, global to the project+model, enforced via the
// gate below independent of how many acts/articles are processed
// concurrently. Billed-tier quotas are materially higher than the free
// tier's 5 RPM, so the default is raised accordingly; the retry/backoff
// logic in `aiEnrich` still adapts to whatever the API reports live via
// 429 `Retry-After`, so this is a starting point, not a hard assumption.
const GEMINI_RPM = Number(process.env.GEMINI_RPM ?? 30);

const genAI = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Global RPM gate — a simple mutex-protected sliding window shared by every
// concurrent act worker, so BATCH_SIZE (act-level) concurrency never causes
// more than GEMINI_RPM Gemini calls to actually be in flight per minute.
// ---------------------------------------------------------------------------
class RpmGate {
  private timestamps: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  async acquire(): Promise<void> {
    const runNext = this.queue.then(async () => {
      for (;;) {
        const now = Date.now();
        this.timestamps = this.timestamps.filter((t) => now - t < 60_000);
        if (this.timestamps.length < GEMINI_RPM) {
          this.timestamps.push(now);
          return;
        }
        const waitMs = 60_000 - (now - this.timestamps[0]) + 50;
        await sleep(waitMs);
      }
    });
    this.queue = runNext;
    return runNext;
  }

  /** Called after a 429 to force every future acquisition to wait out the
   * server-reported Retry-After, on top of the sliding window above. */
  async penalize(retryAfterMs: number): Promise<void> {
    this.queue = this.queue.then(() => sleep(retryAfterMs));
    await this.queue;
  }
}

const rpmGate = new RpmGate();

function parseRetryAfterMs(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/"retryDelay":"(\d+(?:\.\d+)?)s"/) ?? message.match(/retry in (\d+(?:\.\d+)?)s/i);
  if (!match) return null;
  return Math.ceil(Number(match[1]) * 1000);
}

function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('RESOURCE_EXHAUSTED') || message.includes('"code":429');
}

function isTransientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return isRateLimitError(error) || message.includes('UNAVAILABLE') || message.includes('"code":503');
}

// ---------------------------------------------------------------------------
// 1. TYPES
// ---------------------------------------------------------------------------

type ArticleForEnrichment = {
  id: string;
  number: string;
  heading: string;
  original: string;
  structured: string;
  simple: string;
  act: {
    code: string;
    formalTitle: string;
    officialTitle: string;
    materia: string;
    ministry: string;
  };
  impacts: { id: string; modifiedActCode: string; targetArticle: string; impactType: string }[];
};

type EnrichmentImpact = {
  modifiedActCode: string;
  targetArticle: string;
  impactType?: string;
  previousRuleSummary: string;
  newEffectSummary: string;
  officialSourceUrl?: string | null;
};

type EnrichmentResult = {
  simple: string;
  structured: string;
  exhaustiveAnalysis: string;
  prosObjective: string[];
  consObjective: string[];
  impacts: EnrichmentImpact[];
};

// ---------------------------------------------------------------------------
// 2. PLACEHOLDER DETECTION — never generate analysis from text we already
//    know isn't the real verbatim article (see HONESTY NOTE above).
// ---------------------------------------------------------------------------

// Matches every phrasing used by the earlier ingestion scripts for "we don't
// have the real verbatim text yet" ("non ancora acquisito", "non è stato
// acquisito", "non acquisito", ...) — deliberately a loose regex rather than
// an exact-phrase list, since missing a variant here would silently let
// Gemini (or the heuristic) "analyze" an honesty placeholder as real text
// and burn a real API call on it.
const PLACEHOLDER_PATTERN = /non\s+(?:ancora\s+)?(?:[eè]\s+stato\s+)?acquisit[oi]/i;

function isPlaceholderText(text: string): boolean {
  return PLACEHOLDER_PATTERN.test(text);
}

function placeholderResult(article: ArticleForEnrichment): EnrichmentResult {
  const note =
    `Analisi non generata: il testo integrale di questo articolo non è ancora stato acquisito nella pipeline di ingestion ` +
    `(v. scope note in ${article.act.code}). Nessuna analisi viene inventata in assenza del testo verbatim.`;
  return {
    simple: `🟢 Livello 1 — Per il cittadino\n${note}`,
    structured: `🟡 Livello 2 — Analisi approfondita\n${note}`,
    exhaustiveAnalysis: `🔴 Livello 3 — Analisi giuridica\n${note}`,
    prosObjective: [],
    consObjective: [],
    impacts: [],
  };
}

// ---------------------------------------------------------------------------
// 3. DETERMINISTIC HEURISTIC PATH — real extractive summarization over the
//    real `original`/`structured` text, no invented legal content. Used
//    whenever Gemini is unavailable, errors, or (despite the schema) still
//    returns something we can't validate.
// ---------------------------------------------------------------------------

const MATERIA_LABEL: Record<string, string> = {
  fisco: 'fiscale/economica',
  sanita: 'sanitaria',
  lavoro: 'del lavoro',
  giustizia: 'della giustizia',
  codice_strada: 'della circolazione stradale',
};

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.;])\s+(?=[A-ZÀ-Ù0-9«])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

function heuristicResult(article: ArticleForEnrichment): EnrichmentResult {
  const sentences = splitSentences(article.original || article.structured);
  const materiaLabel = MATERIA_LABEL[article.act.materia] ?? article.act.materia;

  const bulletCount = Math.min(3, Math.max(2, sentences.length));
  const simpleBullets = sentences
    .slice(0, bulletCount)
    .map((s) => `• ${s.length > 220 ? `${s.slice(0, 217)}...` : s}`);
  if (simpleBullets.length === 0) {
    simpleBullets.push(`• L'art. ${article.number} disciplina materia ${materiaLabel}, come da titolo: ${article.heading}.`);
  }

  const structuredParts = sentences.slice(0, 6).map((s, i) => `(${i + 1}) ${s}`);
  const structured =
    structuredParts.length > 0
      ? `Scomposizione per commi/proposizioni del testo ufficiale:\n${structuredParts.join('\n')}`
      : `Nessuna scomposizione disponibile: il testo ufficiale dell'art. ${article.number} è più breve di quanto serva per un'analisi comma-per-comma.`;

  const exhaustiveAnalysis =
    `Analisi tecnico-giuridica (estrattiva, generata da euristica deterministica — Gemini non disponibile o fallback attivo, ` +
    `v. HONESTY NOTE nello script):\n` +
    `Riferimento: ${article.act.code}, art. ${article.number} (${article.heading}). Materia ${materiaLabel}. ` +
    `Amministrazione competente: ${article.act.ministry}.\n` +
    (sentences.length > 0
      ? `Testo ufficiale integrale riportato per intero in "original"; sintesi tecnica basata sulle prime proposizioni: ${sentences.slice(0, 3).join(' ')}`
      : `Testo ufficiale non sufficientemente estensivo per una sintesi tecnica automatica; consultare "original" per il dettato integrale.`);

  const prosObjective = [
    `Dichiarato obiettivo istituzionale: intervenire in materia ${materiaLabel} tramite ${article.act.code}.`,
    sentences.length > 0
      ? `L'art. ${article.number} introduce una disciplina specifica su: ${article.heading.toLowerCase()}.`
      : `L'art. ${article.number} (${article.heading}) fa parte del corpus normativo di ${article.act.code}.`,
  ];

  const consObjective = [
    `Vincolo strutturale: l'effettiva applicazione dipende dall'eventuale adozione di provvedimenti attuativi collegati all'atto ${article.act.code} (v. scheda atto per lo stato di attuazione).`,
    `Nota di scope: questa sintesi è generata euristicamente dal solo testo ufficiale, senza il contesto dei lavori preparatori o della relazione tecnica.`,
  ];

  const impacts: EnrichmentImpact[] = article.impacts.map((impact) => ({
    modifiedActCode: impact.modifiedActCode,
    targetArticle: impact.targetArticle,
    impactType: impact.impactType,
    previousRuleSummary: `[Riepilogo euristico] Prima di ${article.act.code}, art. ${article.number}, la disciplina di riferimento era regolata da ${impact.modifiedActCode}, ${impact.targetArticle}.`,
    newEffectSummary: `[Riepilogo euristico] Con l'entrata in vigore di ${article.act.code}, art. ${article.number}, tale disciplina risulta modificata (tipo intervento: ${impact.impactType}).`,
    officialSourceUrl: normattivaSearchUrl(impact.modifiedActCode),
  }));

  return {
    simple: `🟢 Livello 1 — Per il cittadino\n${simpleBullets.join('\n')}`,
    structured: `🟡 Livello 2 — Analisi approfondita\n${structured}`,
    exhaustiveAnalysis: `🔴 Livello 3 — Analisi giuridica\n${exhaustiveAnalysis}`,
    prosObjective,
    consObjective,
    impacts,
  };
}

/** Best-effort, always-valid fallback link for a `NormImpact.officialSourceUrl`
 * when the impact was mined without one — points at Normattiva's real public
 * search UI (not a fabricated permalink) scoped to the modified act's code,
 * since we don't have that act's exact `dataGU`/`codiceRedazionale` here. */
function normattivaSearchUrl(modifiedActCode: string): string {
  return `https://www.normattiva.it/ricerca/avanzata?testoRicercato=${encodeURIComponent(modifiedActCode)}`;
}

// ---------------------------------------------------------------------------
// 4. GEMINI PATH — @google/genai, JSON-schema-constrained structured output.
// ---------------------------------------------------------------------------

const IMPACT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    modifiedActCode: { type: Type.STRING },
    targetArticle: { type: Type.STRING },
    impactType: { type: Type.STRING, enum: ['sostituzione', 'abrogazione', 'integrazione', 'deroga'] },
    previousRuleSummary: { type: Type.STRING },
    newEffectSummary: { type: Type.STRING },
    officialSourceUrl: { type: Type.STRING },
  },
  required: ['modifiedActCode', 'targetArticle', 'previousRuleSummary', 'newEffectSummary'],
};

const ENRICHMENT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    simple: { type: Type.STRING, description: '🟢 Livello Cittadino: 2-3 bullet point in italiano semplice, impatto diretto.' },
    structured: { type: Type.STRING, description: '🟡 Livello Approfondito: analisi comma per comma, termini istituzionali spiegati.' },
    exhaustiveAnalysis: { type: Type.STRING, description: '🔴 Livello Giurista: analisi tecnico-giuridica, tecnica legislativa, riferimenti ai codici modificati.' },
    prosObjective: { type: Type.ARRAY, items: { type: Type.STRING } },
    consObjective: { type: Type.ARRAY, items: { type: Type.STRING } },
    impacts: { type: Type.ARRAY, items: IMPACT_SCHEMA },
  },
  required: ['simple', 'structured', 'exhaustiveAnalysis', 'prosObjective', 'consObjective', 'impacts'],
};

function buildPrompt(article: ArticleForEnrichment): string {
  const impactsList = article.impacts
    .map((i) => `- ${i.modifiedActCode}, ${i.targetArticle} (tipo: ${i.impactType})`)
    .join('\n');

  return `Sei un assistente legislativo per "La Gazzetta Civica", una piattaforma di trasparenza civica italiana.
Analizza SOLO il testo ufficiale fornito sotto. Non inventare fatti, numeri o riferimenti normativi che non siano già presenti nel testo o nei metadati forniti.

ATTO: ${article.act.code} — ${article.act.formalTitle}
TITOLO UFFICIALE: ${article.act.officialTitle}
MINISTERO COMPETENTE: ${article.act.ministry}
MATERIA: ${article.act.materia}
ARTICOLO: Art. ${article.number} — ${article.heading}

TESTO UFFICIALE (verbatim):
"""
${article.original}
"""

RIFERIMENTI NORMATIVI GIÀ RILEVATI IN QUESTO ARTICOLO (se presenti, arricchiscine il confronto prima/dopo — non aggiungerne altri oltre a questi):
${impactsList || '(nessuno)'}

Genera:
- "simple": 🟢 Livello Cittadino — 2-3 bullet point ("• ...") in italiano di tutti i giorni, sull'impatto diretto per cittadini/famiglie/imprese. Fai iniziare il testo con "🟢 Livello 1 — Per il cittadino".
- "structured": 🟡 Livello Approfondito — spiegazione comma per comma, con i termini istituzionali chiariti. Fai iniziare il testo con "🟡 Livello 2 — Analisi approfondita".
- "exhaustiveAnalysis": 🔴 Livello Giurista — analisi tecnico-giuridica, tecnica legislativa, riferimenti precisi ai codici/articoli modificati. Fai iniziare il testo con "🔴 Livello 3 — Analisi giuridica".
- "prosObjective": 2-3 obiettivi/benefici dichiarati, derivati SOLO dal testo e dai dossier istituzionali (nessuna opinione partisan).
- "consObjective": 2-3 vincoli strutturali, colli di bottiglia attuativi o trade-off finanziari.
- "impacts": SOLO i riferimenti normativi già elencati sopra, arricchiti con un confronto prima/dopo e (se noto) un link a normattiva.it. Se non ce ne sono, restituisci un array vuoto.`;
}

function isValidEnrichmentShape(value: unknown): value is EnrichmentResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.simple === 'string' &&
    v.simple.length > 0 &&
    typeof v.structured === 'string' &&
    v.structured.length > 0 &&
    typeof v.exhaustiveAnalysis === 'string' &&
    v.exhaustiveAnalysis.length > 0 &&
    Array.isArray(v.prosObjective) &&
    v.prosObjective.every((x) => typeof x === 'string') &&
    Array.isArray(v.consObjective) &&
    v.consObjective.every((x) => typeof x === 'string') &&
    Array.isArray(v.impacts) &&
    v.impacts.every(
      (x) =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as Record<string, unknown>).modifiedActCode === 'string' &&
        typeof (x as Record<string, unknown>).targetArticle === 'string' &&
        typeof (x as Record<string, unknown>).previousRuleSummary === 'string' &&
        typeof (x as Record<string, unknown>).newEffectSummary === 'string',
    )
  );
}

const MAX_RETRIES = 4;

async function aiEnrich(article: ArticleForEnrichment): Promise<EnrichmentResult | null> {
  if (!genAI) return null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await rpmGate.acquire();
    try {
      const response = await genAI.models.generateContent({
        model: GEMINI_MODEL,
        contents: buildPrompt(article),
        config: {
          responseMimeType: 'application/json',
          responseSchema: ENRICHMENT_SCHEMA,
          temperature: 0.2,
        },
      });

      // Rate-limit guard (requirement #2.3) — applied right after every
      // successful call, on top of the RPM gate above.
      await sleep(RATE_LIMIT_DELAY_MS);

      const text = response.text;
      if (!text) throw new Error('Gemini response had no text content');

      const parsed = JSON.parse(text);
      if (!isValidEnrichmentShape(parsed)) throw new Error('Gemini response did not match the expected enrichment schema');
      return parsed;
    } catch (error) {
      if (isTransientError(error) && attempt < MAX_RETRIES) {
        const retryAfterMs = parseRetryAfterMs(error) ?? 2 ** attempt * 1000;
        if (isRateLimitError(error)) await rpmGate.penalize(retryAfterMs);
        else await sleep(retryAfterMs);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Gemini enrichment exhausted retries');
}

// ---------------------------------------------------------------------------
// 5. ENRICHMENT ORCHESTRATION — Gemini first, heuristic fallback, never throws.
// ---------------------------------------------------------------------------

type Counters = {
  actsTotal: number;
  actsProcessed: number;
  articlesEnriched: number;
  impactsLinked: number;
  aiCalls: number;
  aiFallbacks: number;
  placeholdersSkipped: number;
  errors: number;
};

async function enrichArticle(article: ArticleForEnrichment, actIndex: number, counters: Counters): Promise<void> {
  // Either field carrying the placeholder phrase is enough to skip prose
  // generation — no point requiring both when `original` alone already
  // tells us there's no real verbatim text to analyze (and no point
  // spending a real Gemini call on it either).
  const isPlaceholder = isPlaceholderText(article.original) || isPlaceholderText(article.structured);

  let result: EnrichmentResult;
  if (isPlaceholder) {
    result = placeholderResult(article);
    counters.placeholdersSkipped += 1;
  } else {
    try {
      const ai = await aiEnrich(article);
      if (ai) {
        result = ai;
        counters.aiCalls += 1;
      } else {
        result = heuristicResult(article);
        counters.aiFallbacks += 1;
      }
    } catch (error) {
      console.warn(
        `    (fallback euristico per art. ${article.number} di ${article.act.code}: ${error instanceof Error ? error.message : error})`,
      );
      result = heuristicResult(article);
      counters.aiFallbacks += 1;
    }
  }

  await prisma.article.update({
    where: { id: article.id },
    data: {
      simple: result.simple,
      structured: result.structured,
      exhaustiveAnalysis: result.exhaustiveAnalysis,
      prosObjective: result.prosObjective,
      consObjective: result.consObjective,
    },
  });
  counters.articlesEnriched += 1;
  console.log(`[Act ${actIndex}/${counters.actsTotal}] Processed Act: ${article.act.code} -> Enriched Article ${article.number}`);

  for (const enrichedImpact of result.impacts) {
    const existing = article.impacts.find(
      (i) => i.modifiedActCode === enrichedImpact.modifiedActCode && i.targetArticle === enrichedImpact.targetArticle,
    );
    await prisma.normImpact.upsert({
      where: { id: existing?.id ?? '__enrich_acts_ai_no_match__' },
      update: {
        previousRuleSummary: enrichedImpact.previousRuleSummary,
        newEffectSummary: enrichedImpact.newEffectSummary,
        officialSourceUrl: enrichedImpact.officialSourceUrl ?? undefined,
      },
      create: {
        articleId: article.id,
        modifiedActCode: enrichedImpact.modifiedActCode,
        targetArticle: enrichedImpact.targetArticle,
        impactType: enrichedImpact.impactType ?? existing?.impactType ?? 'integrazione',
        previousRuleSummary: enrichedImpact.previousRuleSummary,
        newEffectSummary: enrichedImpact.newEffectSummary,
        officialSourceUrl: enrichedImpact.officialSourceUrl ?? null,
      },
    });
    counters.impactsLinked += 1;
  }
}

async function processActBatch(
  acts: { id: string; code: string; articles: ArticleForEnrichment[] }[],
  startIndex: number,
  counters: Counters,
): Promise<void> {
  await Promise.all(
    acts.map(async (act, offset) => {
      const actIndex = startIndex + offset + 1;
      try {
        for (const article of act.articles) {
          await enrichArticle(article, actIndex, counters);
        }
        counters.actsProcessed += 1;
      } catch (error) {
        counters.errors += 1;
        console.error(`  !! Failed to enrich ${act.code} (${act.id}):`, error instanceof Error ? error.message : error);
      }
    }),
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// 6. MAIN
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== La Gazzetta Civica — FASE 3.1: Batch AI Enrichment ===');
  console.log(
    genAI
      ? `AI provider: Google Gemini (${GEMINI_MODEL}) via @google/genai — per-article fallback to deterministic heuristic on any failure.`
      : 'AI provider: none configured (GEMINI_API_KEY unset) — running the deterministic heuristic path for every article.',
  );
  console.log(`Batch size: ${BATCH_SIZE} acts processed concurrently. Rate limit: ${RATE_LIMIT_DELAY_MS}ms after each real Gemini call.\n`);

  const counters: Counters = {
    actsTotal: 0,
    actsProcessed: 0,
    articlesEnriched: 0,
    impactsLinked: 0,
    aiCalls: 0,
    aiFallbacks: 0,
    placeholdersSkipped: 0,
    errors: 0,
  };

  // Per requirement #2.1: fetch ALL acts and articles — this is the live
  // enrichment pass, so it re-processes everything (upgrading any content
  // from a prior heuristic-only run) rather than only rows still at their
  // initial null/default state.
  const acts = await prisma.act.findMany({
    select: {
      id: true,
      code: true,
      formalTitle: true,
      officialTitle: true,
      materia: true,
      ministry: true,
      articles: {
        select: {
          id: true,
          number: true,
          heading: true,
          original: true,
          structured: true,
          simple: true,
          impacts: { select: { id: true, modifiedActCode: true, targetArticle: true, impactType: true } },
        },
      },
    },
  });

  const actsWithArticles = acts.map((act) => ({
    id: act.id,
    code: act.code,
    articles: act.articles.map((article) => ({
      ...article,
      act: { code: act.code, formalTitle: act.formalTitle, officialTitle: act.officialTitle, materia: act.materia, ministry: act.ministry },
    })),
  }));
  counters.actsTotal = actsWithArticles.length;

  console.log(`Loaded ${actsWithArticles.length} acts from Supabase for the live enrichment pass.\n`);

  const batches = chunk(actsWithArticles, BATCH_SIZE);
  let startIndex = 0;
  for (const batch of batches) {
    await processActBatch(batch, startIndex, counters);
    startIndex += batch.length;
  }

  console.log('\n=== Batch AI Enrichment — summary ===');
  console.log(`Acts processed:        ${counters.actsProcessed} / ${actsWithArticles.length}`);
  console.log(`Articles enriched:     ${counters.articlesEnriched}`);
  console.log(`Impacts linked:        ${counters.impactsLinked}`);
  console.log(`  (via Gemini:         ${counters.aiCalls})`);
  console.log(`  (via heuristic:      ${counters.aiFallbacks})`);
  console.log(`  (placeholders skipped: ${counters.placeholdersSkipped})`);
  console.log(`Errors:                ${counters.errors}`);
}

main()
  .catch((error) => {
    console.error('Batch AI enrichment failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
