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
 * Usage:
 *   npm run db:enrich:ai
 *   npx tsx scripts/enrich_acts_ai.ts --force
 */
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { GoogleGenAI, Type, type Schema } from '@google/genai';
import { PrismaClient } from '@prisma/client';

try {
  loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // CI / env già esportato.
}

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient(
  databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
);

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
const GEMINI_TEMPERATURE = 0.2;
const GEMINI_MAX_OUTPUT_TOKENS = 8192;
/** Below this length, `simple` / `structured` are treated as too short and re-enriched. */
const MIN_PROSE_CHARS = 200;
const FORCE_REENRICH = process.argv.includes('--force');

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
  exhaustiveAnalysis: string | null;
  act: {
    code: string;
    formalTitle: string;
    officialTitle: string;
    materia: string;
    ministry: string;
    preamble: string;
    financialNote: string;
    decreesMissing: number;
    decreeDeadline: string | null;
    copertura: string;
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
  const source = article.original || article.structured;
  const sentences = splitSentences(source);
  const materiaLabel = MATERIA_LABEL[article.act.materia] ?? article.act.materia;
  const who =
    article.act.materia === 'codice_strada'
      ? 'automobilisti, conducenti e imprese di trasporto'
      : article.act.materia === 'lavoro'
        ? 'lavoratori, datori di lavoro e famiglie'
        : article.act.materia === 'sanita'
          ? 'pazienti, operatori sanitari e strutture del SSN'
          : article.act.materia === 'giustizia'
            ? 'cittadini in giudizio, avvocati e uffici giudiziari'
            : 'famiglie, imprese e amministrazioni pubbliche';

  const bulletSeeds = sentences.slice(0, 4);
  while (bulletSeeds.length < 3) {
    bulletSeeds.push(
      `L'art. ${article.number} (${article.heading}) interviene in materia ${materiaLabel} nell'ambito di ${article.act.code}.`,
    );
  }
  const simpleBullets = bulletSeeds.slice(0, 4).map((seed, index) => {
    const body = seed.length > 420 ? `${seed.slice(0, 417)}…` : seed;
    if (index === 0) {
      return `• Cosa cambia: ${body} Il testo ufficiale riguarda in particolare ${who}. Ogni obbligo, beneficio, sanzione, cifra o scadenza va letto nel dettato integrale dell'articolo: se non è scritto, non è qui ricostruito.`;
    }
    if (index === 1) {
      return `• Chi è toccato: ${who}. ${body}`;
    }
    if (index === 2) {
      return `• Obblighi, sanzioni o benefici: ${body} Le eventuali sanzioni pecuniarie, scadenze e importi sono riportati solo se figurano nel testo ufficiale sopra.`;
    }
    return `• Tempistiche e applicazione: ${body} L'autorità di riferimento nei metadati dell'atto è ${article.act.ministry}.`;
  });

  const commaBlocks = sentences.slice(0, 10).map((sentence, index) => {
    return `Comma / proposizione ${index + 1}. ${sentence}\nSoggetti e ambito: la disposizione si legge nel contesto di ${article.act.code} (materia ${materiaLabel}). Termini tecnici restano quelli del testo ufficiale; non se ne inventa il significato oltre quanto il periodo stesso rende esplicito. Condizioni, deroghe e autorità competenti, se presenti, sono quelle enunciate in questa proposizione.`;
  });
  const structured =
    commaBlocks.length > 0
      ? `Trattazione comma per comma (estrattiva — euristica, non perizia Gemini):\n\n${commaBlocks.join('\n\n')}\n\nQuadro procedurale: ministero competente nei metadati: ${article.act.ministry}. Copertura finanziaria dichiarata in scheda: ${article.act.copertura}. Decreti attuativi mancanti nei metadati: ${article.act.decreesMissing}${article.act.decreeDeadline ? ` (scadenza indicata: ${article.act.decreeDeadline})` : ''}.`
      : `Nessuna scomposizione comma-per-comma: il testo ufficiale dell'art. ${article.number} è troppo breve. Consultare il campo original.`;

  const exhaustiveAnalysis =
    `Perizia estrattiva (euristica deterministica — Gemini non disponibile o risposta non valida; v. HONESTY NOTE).\n\n` +
    `Ratio e oggetto. ${article.act.code}, art. ${article.number} (${article.heading}), materia ${materiaLabel}. ` +
    `Amministrazione competente nei metadati: ${article.act.ministry}. ` +
    `Il preambolo in banca dati recita: «${article.act.preamble.slice(0, 600)}${article.act.preamble.length > 600 ? '…' : ''}».\n\n` +
    `Tecnica legislativa. L'articolo è analizzato sul solo testo verbatim in original; non si attribuiscono novelle, abrogazioni o rinvii euro-unitari/costituzionali se il testo non li enuncia.\n\n` +
    (sentences.length > 0
      ? `Novelle e contenuto dispositivo (prime proposizioni del testo ufficiale):\n${sentences.slice(0, 8).map((s, i) => `${i + 1}. ${s}`).join('\n')}`
      : `Il testo ufficiale non è sufficientemente estensivo per una sintesi tecnica automatica.`) +
    `\n\nNota finanziaria di ingestione (non è la relazione tecnica parlamentare): ${article.act.financialNote}`;

  const prosObjective = [
    `Finalità dichiarata in scheda: ${article.act.code} interviene in materia ${materiaLabel} (${article.heading}), secondo il titolo ufficiale e il testo dell'art. ${article.number}.`,
    `Destinatari: la disciplina si applica, in base al dettato, a ${who}; ogni estensione soggettiva ulteriore deve risultare dal testo, non da congetture.`,
    `Quadro istituzionale: il ministero indicato nei metadati è ${article.act.ministry}. Eventuali obiettivi di semplificazione, sicurezza o allineamento europeo sono riportati solo se il testo o il preambolo li enunciano.`,
  ];

  const consObjective = [
    `Attuazione: nei metadati risultano ${article.act.decreesMissing} decreti attuativi mancanti${article.act.decreeDeadline ? ` (scadenza: ${article.act.decreeDeadline})` : ''}. Senza i provvedimenti attuativi previsti dal testo, l'efficacia può restare parziale.`,
    `Copertura: la scheda classifica la copertura come «${article.act.copertura}». ${article.act.financialNote} Non si inventano stanziamenti assenti dal testo.`,
    `Limite di metodo: questa sintesi è estrattiva sul solo testo ufficiale, senza lavori preparatori né dossier parlamentari esterni; i termini giuridici non definiti nell'articolo restano quelli del legislatore.`,
  ];

  const impacts: EnrichmentImpact[] = article.impacts.map((impact) => ({
    modifiedActCode: impact.modifiedActCode,
    targetArticle: impact.targetArticle,
    impactType: impact.impactType,
    previousRuleSummary: `[Euristica estrattiva] Disciplina previgente: ${impact.modifiedActCode}, ${impact.targetArticle}. ${article.act.code}, art. ${article.number}, interviene su quel riferimento (tipo: ${impact.impactType}). Il contenuto precedente non è ricostruito oltre quanto il dettato attuale consente.`,
    newEffectSummary: `[Euristica estrattiva] Nuovo assetto: con ${article.act.code}, art. ${article.number}, ${impact.modifiedActCode} ${impact.targetArticle} è oggetto di ${impact.impactType}. Confronto puntuale: attenersi al testo verbatim; non si inventano commi previgenti assenti dalla banca dati.`,
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
    previousRuleSummary: { type: Type.STRING, description: 'Disciplina previgente desumibile dal testo o dai riferimenti già elencati.' },
    newEffectSummary: { type: Type.STRING, description: 'Nuovo assetto: confronto dettagliato previgente vs novella.' },
    officialSourceUrl: { type: Type.STRING },
  },
  required: ['modifiedActCode', 'targetArticle', 'previousRuleSummary', 'newEffectSummary'],
};

const ENRICHMENT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    simple: {
      type: Type.STRING,
      description:
        '🟢 Livello 1 — Per il cittadino. Minimo 3-4 bullet corposi (ciascuno più frasi). Cosa cambia nella vita quotidiana; chi è toccato (lavoratori, famiglie, automobilisti, imprese); sanzioni, obblighi o benefici con cifre, scadenze e tempistiche SOLO se scritte nel testo. Inizia con "🟢 Livello 1 — Per il cittadino". Prosa ampia, mai un riassunto di due righe.',
    },
    structured: {
      type: Type.STRING,
      description:
        '🟡 Livello 2 — Analisi approfondita. Trattazione multi-paragrafo comma per comma: soggetti obbligati, condizioni, iter, deroghe, autorità competenti, spiegazione di ogni termine tecnico. Inizia con "🟡 Livello 2 — Analisi approfondita".',
    },
    exhaustiveAnalysis: {
      type: Type.STRING,
      description:
        '🔴 Livello 3 — Analisi giuridica. Perizia estesa: ratio legis, tecnica legislativa, compatibilità costituzionale/UE solo se il testo o i metadati la evocano, novelle puntuali (sostituzioni, abrogazioni esplicite o implicite). Inizia con "🔴 Livello 3 — Analisi giuridica".',
    },
    prosObjective: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Minimo 3 punti dettagliati: finalità dichiarate e impatti positivi perseguiti, desunti solo dal testo e dai metadati forniti (nessun dossier inventato).',
    },
    consObjective: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Minimo 3 punti dettagliati: criticità procedurali, decreti attuativi, coperture/invarianza, oneri burocratici — solo se desumibili dal testo o dai metadati.',
    },
    impacts: { type: Type.ARRAY, items: IMPACT_SCHEMA },
  },
  required: ['simple', 'structured', 'exhaustiveAnalysis', 'prosObjective', 'consObjective', 'impacts'],
};

function buildPrompt(article: ArticleForEnrichment): string {
  const impactsList = article.impacts
    .map((i) => `- ${i.modifiedActCode}, ${i.targetArticle} (tipo: ${i.impactType})`)
    .join('\n');

  return `Sei l'analista legislativo di "La Gazzetta Civica", piattaforma di trasparenza civica italiana, non partigiana.
Produci analisi AMPIE, multi-paragrafo ed esaustive. Vietati i riassunti di poche righe generiche. Ogni campo deve essere autonomamente leggibile da un cittadino o da un giurista senza rileggere l'articolo.

VINCOLO DI ONESTÀ: analizza SOLO il testo ufficiale e i metadati sotto. Non inventare fatti, importi, sanzioni, scadenze, articoli di Costituzione/UE, novelle o dossier parlamentari che non siano già scritti qui. Se un dato non c'è, dichiaralo esplicitamente ("non indicato nel testo ufficiale").

ATTO: ${article.act.code} — ${article.act.formalTitle}
TITOLO UFFICIALE: ${article.act.officialTitle}
MINISTERO COMPETENTE: ${article.act.ministry}
MATERIA: ${article.act.materia}
COPERTURA (metadato di scheda): ${article.act.copertura}
DECRETI ATTUATIVI MANCANTI (metadato): ${article.act.decreesMissing}${article.act.decreeDeadline ? ` — scadenza metadato: ${article.act.decreeDeadline}` : ''}
NOTA FINANZIARIA DI INGESTIONE (non è la relazione tecnica): ${article.act.financialNote}
ARTICOLO: Art. ${article.number} — ${article.heading}

PREAMBOLO (metadato):
"""
${article.act.preamble}
"""

TESTO UFFICIALE (verbatim):
"""
${article.original}
"""

RIFERIMENTI NORMATIVI GIÀ RILEVATI (arricchiscine il confronto previgente vs nuovo assetto; NON aggiungerne altri):
${impactsList || '(nessuno — restituisci impacts: [])'}

Genera JSON con:
- "simple": 🟢 Livello 1 — Per il cittadino. Inizia con "🟢 Livello 1 — Per il cittadino". Almeno 3-4 punti elenco ("• ...") CORPOSI (ciascuno più frasi, non frasette). Spiega: (1) cosa cambia nella vita quotidiana; (2) chi è toccato (lavoratori, famiglie, automobilisti, imprese, altri soggetti del testo); (3) nuove sanzioni, obblighi o benefici economici, con CIFRE, SCADENZE e TEMPISTICHE solo se desunte dal testo; (4) come si applica in pratica. Minimo ~800 caratteri.
- "structured": 🟡 Livello 2 — Analisi approfondita. Inizia con "🟡 Livello 2 — Analisi approfondita". Trattazione multi-paragrafo, comma per comma: soggetti obbligati, condizioni di applicabilità, iter procedurali, deroghe, autorità amministrative competenti. Spiega ogni termine tecnico o giuridico usato nel testo. Minimo ~1200 caratteri.
- "exhaustiveAnalysis": 🔴 Livello 3 — Analisi giuridica. Inizia con "🔴 Livello 3 — Analisi giuridica". Perizia estesa: ratio legis; tecnica legislativa; compatibilità costituzionale/UE SOLO se il testo o i metadati la richiamano; novellazioni puntuali (sostituzioni, abrogazioni esplicite o implicite). Minimo ~1500 caratteri.
- "prosObjective": ARRAY di almeno 3 stringhe dettagliate. Finalità dichiarate e impatti positivi perseguiti (deflazione del contenzioso, tutela della sicurezza, allineamento europeo, ecc.) SOLO se desumibili dal testo, dal preambolo o dai metadati. Nessuna opinione partigiana. Nessun dossier inventato.
- "consObjective": ARRAY di almeno 3 stringhe dettagliate. Criticità procedurali e vincoli oggettivi (rischio stallo per decreti attuativi, coperture/invarianza, oneri su enti locali o cittadini) SOLO se desumibili dal testo o dai metadati.
- "impacts": SOLO i riferimenti già elencati. Per ciascuno: previousRuleSummary = disciplina previgente; newEffectSummary = nuovo assetto, confronto dettagliato. Se l'elenco è vuoto, array vuoto.`;
}

function isValidEnrichmentShape(value: unknown): value is EnrichmentResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.simple === 'string' &&
    v.simple.length >= MIN_PROSE_CHARS &&
    typeof v.structured === 'string' &&
    v.structured.length >= MIN_PROSE_CHARS &&
    typeof v.exhaustiveAnalysis === 'string' &&
    v.exhaustiveAnalysis.length >= MIN_PROSE_CHARS &&
    Array.isArray(v.prosObjective) &&
    v.prosObjective.length >= 3 &&
    v.prosObjective.every((x) => typeof x === 'string' && x.length > 0) &&
    Array.isArray(v.consObjective) &&
    v.consObjective.length >= 3 &&
    v.consObjective.every((x) => typeof x === 'string' && x.length > 0) &&
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
          temperature: GEMINI_TEMPERATURE,
          maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
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
  articlesSkippedCurrent: number;
  errors: number;
};

function isShortProse(text: string | null | undefined): boolean {
  return !text || text.trim().length < MIN_PROSE_CHARS;
}

function shouldEnrichArticle(article: ArticleForEnrichment, isPlaceholder: boolean): boolean {
  if (FORCE_REENRICH) return true;
  if (isPlaceholder) {
    return isShortProse(article.exhaustiveAnalysis) && isShortProse(article.simple);
  }
  return isShortProse(article.simple) || isShortProse(article.structured);
}

async function enrichArticle(article: ArticleForEnrichment, actIndex: number, counters: Counters): Promise<void> {
  // Either field carrying the placeholder phrase is enough to skip prose
  // generation — no point requiring both when `original` alone already
  // tells us there's no real verbatim text to analyze (and no point
  // spending a real Gemini call on it either).
  const isPlaceholder = isPlaceholderText(article.original) || isPlaceholderText(article.structured);
  if (!shouldEnrichArticle(article, isPlaceholder)) {
    counters.articlesSkippedCurrent += 1;
    return;
  }

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
  console.log(`Batch size: ${BATCH_SIZE} acts concurrently. Gemini: temperature ${GEMINI_TEMPERATURE}, maxOutputTokens ${GEMINI_MAX_OUTPUT_TOKENS}. Rate limit: ${RATE_LIMIT_DELAY_MS}ms after each real call.`);
  console.log(
    FORCE_REENRICH
      ? 'Mode: --force (riscrive tutte le sintesi, comprese quelle già lunghe).\n'
      : `Mode: incrementale (ri-analizza se simple o structured hanno meno di ${MIN_PROSE_CHARS} caratteri).\n`,
  );

  const counters: Counters = {
    actsTotal: 0,
    actsProcessed: 0,
    articlesEnriched: 0,
    impactsLinked: 0,
    aiCalls: 0,
    aiFallbacks: 0,
    placeholdersSkipped: 0,
    articlesSkippedCurrent: 0,
    errors: 0,
  };

  // Default: skip articles whose simple AND structured are already ≥ 200 chars.
  // `--force` riscrive tutto (upgrade delle sintesi corte / vecchie).
  const acts = await prisma.act.findMany({
    select: {
      id: true,
      code: true,
      formalTitle: true,
      officialTitle: true,
      materia: true,
      ministry: true,
      preamble: true,
      financialNote: true,
      decreesMissing: true,
      decreeDeadline: true,
      copertura: true,
      articles: {
        select: {
          id: true,
          number: true,
          heading: true,
          original: true,
          structured: true,
          simple: true,
          exhaustiveAnalysis: true,
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
      act: {
        code: act.code,
        formalTitle: act.formalTitle,
        officialTitle: act.officialTitle,
        materia: act.materia,
        ministry: act.ministry,
        preamble: act.preamble,
        financialNote: act.financialNote,
        decreesMissing: act.decreesMissing,
        decreeDeadline: act.decreeDeadline,
        copertura: act.copertura,
      },
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
  console.log(`  (already long enough, skipped: ${counters.articlesSkippedCurrent})`);
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
