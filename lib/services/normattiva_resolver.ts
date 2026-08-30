/**
 * PHASE 2 — Dynamic Historical Resolver for Pre-Biennium Statutes.
 *
 * The ingestion pipeline (`ingest_normattiva.ts`/`ingest_parliament.ts`/
 * `ingest_senato.ts`) only ever populates `Act`/`Article` for the recent
 * (~2021-2026) legislative window. But the RAG pipeline, the taxonomy graph
 * (`lib/taxonomy/legalThesaurus.ts`) and article-level `NormImpact` rows
 * constantly reference much OLDER "foundation" statutes that novellas
 * amend — the Codice della Strada (1992), lo Statuto dei Lavoratori (1970),
 * il TUEL (2000), and so on — which never got their own `Act` row.
 *
 * This service resolves a single `{ actCode, articleNumber }` reference to
 * its real, verbatim text on demand:
 *   1. Local DB first — if the act/article already exists in Supabase
 *      (e.g. a foundation code that DID get ingested, or was hit before),
 *      serve it straight from there (`isLocallyCached: true`).
 *   2. Otherwise, fetch it live from Normattiva's `caricaAKN` endpoint —
 *      the same official source used by `scripts/fetch_full_legislative_texts.ts`
 *      — using either a precisely-known URN from the taxonomy graph or a
 *      best-effort parse of `actCode` itself.
 *   3. Cache whatever was resolved (DB or network) in a module-level Map
 *      for the lifetime of the process, so repeated lookups for the same
 *      statute during a session never re-hit the network or the DB.
 *
 * HONESTY NOTE: unlike the ingestion scripts (which must never write a
 * "not yet available" placeholder into the database), this is a live,
 * on-demand network service — Normattiva can genuinely time out or throttle
 * a request. In that case (and only when the act's identity itself is
 * actually known, see `buildInstitutionalFallback`) this resolver returns a
 * clearly-labelled "service temporarily unavailable" notice — flagged via
 * `isUnavailableNotice: true` so callers never mistake it for real verbatim
 * text — rather than silently failing or fabricating legal content.
 *
 * PHASE 4 additions:
 *   - A durable, Supabase-backed cache (`NormResolverCache`) sits between the
 *     local `Act`/`Article` check and the live network fetch: the resolver's
 *     module-level `Map` only survives one warm process, which is close to
 *     useless on serverless — so every genuine live fetch is also persisted
 *     to Postgres, and read back first on the next lookup, any process.
 *   - `searchNormattivaByKeyword` resolves by free-text subject/keyword
 *     against Normattiva's own OpenData search index (`ricerca/semplice`,
 *     the same real endpoint `scripts/ingest_normattiva.ts` uses) rather
 *     than requiring a precisely-known `actCode`/URN up front — the router
 *     of last resort when neither the local corpus nor a guessed act code
 *     covers the topic a citizen actually asked about.
 */
import { prisma } from '@/lib/db/prisma';
import { LEGAL_THEMATIC_DOMAINS } from '@/lib/taxonomy/legalThesaurus';

const NORMATTIVA_TIMEOUT_MS = 9000;
const NORMATTIVA_OPENDATA_API = 'https://api.normattiva.it/t/normattiva.api/bff-opendata/v1';
const PLACEHOLDER_PATTERN = /non\s+(?:ancora\s+)?(?:[eè]\s+stato\s+)?acquisit[oi]/i;

// ---------------------------------------------------------------------------
// 1. PUBLIC TYPES
// ---------------------------------------------------------------------------

export interface ResolvedHistoricalAct {
  actCode: string;
  articleNumber: string;
  officialTitle: string;
  popularTitle?: string;
  verbatimText: string;
  sourceUrl: string;
  isLocallyCached: boolean;
  /** True only for the clearly-labelled "servizio non disponibile" notice
   * built by `buildInstitutionalFallback` — `verbatimText` is NOT real
   * normative text in that case, so callers must never quote it as a
   * citation, only use it to point the user at the official source. */
  isUnavailableNotice: boolean;
}

export interface ResolveNormOptions {
  /** e.g. "D.Lgs. 285/1992", "L. 241/1990", "D.P.R. 380/2001" */
  actCode: string;
  /** e.g. "173", "18", "7" — omit for the act's opening article. */
  articleNumber?: string;
}

// ---------------------------------------------------------------------------
// 2. TRANSIENT (MODULE-LEVEL) CACHE
// ---------------------------------------------------------------------------

const transientCache = new Map<string, ResolvedHistoricalAct>();

function normalizeActCode(code: string): string {
  return code.toLowerCase().replace(/[.\s]+/g, '').trim();
}

function normalizeArticleToken(articleNumber: string): string {
  return articleNumber.toLowerCase().replace(/^art(?:icolo)?\.?\s*/, '').replace(/[^\da-z-]/g, '');
}

function cacheKey(actCode: string, articleNumber?: string): string {
  return `${normalizeActCode(actCode)}::${articleNumber ? normalizeArticleToken(articleNumber) : ''}`;
}

// ---------------------------------------------------------------------------
// 3. STEP 1 — LOCAL DATABASE CHECK
// ---------------------------------------------------------------------------

async function resolveFromDatabase(actCode: string, articleNumber?: string): Promise<ResolvedHistoricalAct | null> {
  try {
    const normalizedTarget = normalizeActCode(actCode);

    let act = await prisma.act.findUnique({ where: { code: actCode } });
    if (!act) {
      // Codes in the DB may be formatted slightly differently than the exact
      // string a caller passes in (e.g. "D.Lgs. 285/1992" vs "DLgs 285/1992"),
      // so fall back to a normalized scan across the (small, ~136-row) table.
      const candidates = await prisma.act.findMany({ select: { id: true, code: true } });
      const match = candidates.find((candidate) => normalizeActCode(candidate.code) === normalizedTarget);
      if (match) act = await prisma.act.findUnique({ where: { id: match.id } });
    }
    if (!act) return null;

    const articles = await prisma.article.findMany({ where: { actId: act.id }, orderBy: { orderIndex: 'asc' } });
    if (articles.length === 0) return null;

    const article = articleNumber
      ? articles.find((candidate) => normalizeArticleToken(candidate.number) === normalizeArticleToken(articleNumber))
      : articles[0];
    if (!article) return null;

    // A placeholder row (ingestion honesty-note text) is not real verbatim
    // text — treat it as a local miss so step 2 can still try to fetch the
    // genuine article live instead of serving a non-answer.
    if (!article.original || PLACEHOLDER_PATTERN.test(article.original)) return null;

    return {
      actCode: act.code,
      articleNumber: article.number,
      officialTitle: act.officialTitle,
      popularTitle: act.popularTitle,
      verbatimText: article.original,
      sourceUrl: act.sourceUrl,
      isLocallyCached: true,
      isUnavailableNotice: false,
    };
  } catch (error) {
    // A DB outage must never block resolution — step 2 (durable cache) and
    // step 3 (live fetch) don't depend on this database at all.
    console.warn('[normattiva_resolver] Local DB check failed (non-fatal, continuing):', error instanceof Error ? error.message : error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3bis. STEP 2 — DURABLE SUPABASE CACHE (survives across serverless cold
//       starts, unlike the module-level `transientCache` below)
// ---------------------------------------------------------------------------

async function resolveFromDurableCache(actCode: string, articleNumber: string | undefined, key: string): Promise<ResolvedHistoricalAct | null> {
  try {
    const row = await prisma.normResolverCache.findUnique({ where: { cacheKey: key } });
    if (!row) return null;
    return {
      actCode: row.actCode,
      articleNumber: row.articleNumber,
      officialTitle: row.officialTitle,
      popularTitle: row.popularTitle ?? undefined,
      verbatimText: row.verbatimText,
      sourceUrl: row.sourceUrl,
      isLocallyCached: true,
      isUnavailableNotice: false,
    };
  } catch (error) {
    console.warn('[normattiva_resolver] Durable cache read failed (non-fatal, continuing):', error instanceof Error ? error.message : error);
    return null;
  }
}

async function persistToDurableCache(resolved: ResolvedHistoricalAct, key: string): Promise<void> {
  try {
    await prisma.normResolverCache.upsert({
      where: { cacheKey: key },
      update: {
        actCode: resolved.actCode,
        articleNumber: resolved.articleNumber,
        officialTitle: resolved.officialTitle,
        popularTitle: resolved.popularTitle ?? null,
        verbatimText: resolved.verbatimText,
        sourceUrl: resolved.sourceUrl,
      },
      create: {
        cacheKey: key,
        actCode: resolved.actCode,
        articleNumber: resolved.articleNumber,
        officialTitle: resolved.officialTitle,
        popularTitle: resolved.popularTitle ?? null,
        verbatimText: resolved.verbatimText,
        sourceUrl: resolved.sourceUrl,
      },
    });
  } catch (error) {
    // Best-effort — a failed cache write must never fail the resolution
    // that's already in the caller's hands.
    console.warn('[normattiva_resolver] Durable cache write failed (non-fatal):', error instanceof Error ? error.message : error);
  }
}

// ---------------------------------------------------------------------------
// 4. SHARED NORMATTIVA/TEXT HELPERS (self-contained — see
//    `scripts/fetch_full_legislative_texts.ts` for the batch-ingestion
//    sibling of this same `caricaAKN`/Akoma-Ntoso approach)
// ---------------------------------------------------------------------------

type NormattivaUrn = { tipo: string; date: string; numero: string }; // date = "YYYY-MM-DD" or "YYYY"

const HTML_ENTITIES: Record<string, string> = {
  agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  laquo: '«', raquo: '»', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&([a-zA-Z]+);/g, (match, name) => HTML_ENTITIES[name] ?? match);
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normattivaPermalinkUrl(urn: NormattivaUrn): string {
  return `https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:${urn.tipo}:${urn.date};${urn.numero}`;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NORMATTIVA_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Minimal cookie jar: normattiva.it's `caricaAKN` only serves real XML to a
 * client that already holds the session cookie handed out by the act's own
 * permalink page. */
class CookieJar {
  private cookies = new Map<string, string>();

  apply(headers: Headers): void {
    const raw = 'getSetCookie' in headers ? (headers as Headers & { getSetCookie(): string[] }).getSetCookie() : [];
    for (const line of raw) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

function todayYYYYMMDD(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

/** Visits the permalink page to (a) obtain a session cookie, (b) scrape the
 * `dataGU`/`codiceRedaz` pair `caricaAKN` requires, and (c) grab a
 * human-readable title straight from the page's own `<title>` for acts we
 * don't already have curated metadata for. */
async function resolveCaricaAknParams(
  urn: NormattivaUrn,
  jar: CookieJar,
): Promise<{ dataGU: string; codiceRedaz: string; pageTitle: string | null } | null> {
  const response = await fetchWithTimeout(normattivaPermalinkUrl(urn), { redirect: 'follow' });
  jar.apply(response.headers);
  if (!response.ok) return null;
  const html = await response.text();
  const match = html.match(/caricaAKN\?dataGU=(\d{8})&amp;codiceRedaz=([A-Za-z0-9]+)/);
  if (!match) return null;
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch ? stripTags(titleMatch[1]).replace(/^normattiva\s*-\s*/i, '') : null;
  return { dataGU: match[1], codiceRedaz: match[2], pageTitle };
}

type FetchedArticle = { number: string; heading: string; original: string };

/** `<article>` elements never nest in Akoma Ntoso, so a non-greedy regex
 * match is safe here (same structure verified by hand in the batch fetcher). */
function parseAkomaNtosoArticles(xml: string): FetchedArticle[] {
  const articles: FetchedArticle[] = [];
  const articleBlocks = xml.match(/<article\b[^>]*>[\s\S]*?<\/article>/g) ?? [];

  for (const block of articleBlocks) {
    const numMatch = block.match(/<num>([\s\S]*?)<\/num>/);
    const headingMatch = block.match(/<heading>([\s\S]*?)<\/heading>/);
    const rawNum = numMatch ? stripTags(numMatch[1]) : '';
    const number = rawNum.replace(/^Art\.?\s*/i, '').replace(/\.\s*$/, '').trim() || String(articles.length + 1);
    const heading = headingMatch ? stripTags(headingMatch[1]).replace(/^[.\s]+|[.\s]+$/g, '') : '';

    const paragraphBlocks = block.match(/<paragraph\b[^>]*>[\s\S]*?<\/paragraph>/g) ?? [];
    const lines: string[] = [];
    let impliedNumber = 1;
    for (const para of paragraphBlocks) {
      const contentMatch = para.match(/<content>([\s\S]*?)<\/content>/);
      if (!contentMatch) continue;
      const text = stripTags(contentMatch[1]);
      if (!text) continue;
      const paraNumMatch = para.match(/<num>([\s\S]*?)<\/num>/);
      const alreadyNumbered = /^\(*\d+[a-z-]*\.\s/.test(text);
      const commaNum = paraNumMatch ? stripTags(paraNumMatch[1]) : `${impliedNumber}.`;
      lines.push(alreadyNumbered ? text : `${commaNum} ${text}`);
      impliedNumber += 1;
    }

    if (lines.length === 0) {
      const directContent = block.match(/<content>([\s\S]*?)<\/content>/);
      if (directContent) {
        const text = stripTags(directContent[1]);
        if (text) lines.push(text);
      }
    }

    const headingLine = heading ? `(${heading})` : '';
    const original = [`Art. ${number}.`, headingLine, ...lines].filter(Boolean).join('\n');
    if (original.trim().length > 0) {
      articles.push({ number, heading, original });
    }
  }

  return articles;
}

/** Downloads the full Akoma Ntoso XML for the act (current in-force
 * "vigente" text) and returns either the requested article or the opening
 * one, plus a best-effort human title scraped from the permalink page. */
async function fetchArticleFromNormattiva(
  urn: NormattivaUrn,
  articleNumber?: string,
): Promise<{ article: FetchedArticle; pageTitle: string | null } | null> {
  const jar = new CookieJar();
  const params = await resolveCaricaAknParams(urn, jar);
  if (!params) return null;

  const akn = `https://www.normattiva.it/do/atto/caricaAKN?dataGU=${params.dataGU}&codiceRedaz=${params.codiceRedaz}&dataVigenza=${todayYYYYMMDD()}`;
  let response = await fetchWithTimeout(akn, { headers: { Cookie: jar.header() } });
  let xml = await response.text();

  // Some very recent acts don't have a "vigenza" snapshot for today yet —
  // retry with the publication date itself (always a valid snapshot date).
  if (!xml.startsWith('<?xml')) {
    const fallbackAkn = `https://www.normattiva.it/do/atto/caricaAKN?dataGU=${params.dataGU}&codiceRedaz=${params.codiceRedaz}&dataVigenza=${params.dataGU}`;
    response = await fetchWithTimeout(fallbackAkn, { headers: { Cookie: jar.header() } });
    xml = await response.text();
  }
  if (!xml.startsWith('<?xml')) return null;

  const articles = parseAkomaNtosoArticles(xml);
  if (articles.length === 0) return null;

  const article = articleNumber
    ? articles.find((candidate) => normalizeArticleToken(candidate.number) === normalizeArticleToken(articleNumber))
    : articles[0];
  if (!article) return null;

  return { article, pageTitle: params.pageTitle };
}

// ---------------------------------------------------------------------------
// 5. actCode → Normattiva URN
// ---------------------------------------------------------------------------

/** Looks the act up in the Phase-1 taxonomy graph first, since several of
 * its `foundationalActs` already carry a precisely-known, hand-verified
 * `normattivaUrn` (exact promulgation date) — far more reliable than a
 * year-only guess derived from `actCode` alone. */
function findKnownFoundationAct(actCode: string): { officialTitle: string; popularTitle: string; urn: NormattivaUrn } | null {
  const normalizedTarget = normalizeActCode(actCode);
  for (const domain of LEGAL_THEMATIC_DOMAINS) {
    for (const act of domain.foundationalActs) {
      if (normalizeActCode(act.actCode) !== normalizedTarget || !act.normattivaUrn) continue;
      const match = act.normattivaUrn.match(/urn:nir:stato:([a-z.]+):([\d-]+);(\d+)/);
      if (!match) continue;
      return { officialTitle: act.officialTitle, popularTitle: act.popularTitle, urn: { tipo: match[1], date: match[2], numero: match[3] } };
    }
  }
  return null;
}

const ACT_TYPE_PREFIX_PATTERN =
  '(?:decreto\\s+legislativo|d\\.?\\s*lgs\\.?|dlgs|' +
  'decreto\\s+del\\s+presidente\\s+della\\s+repubblica|d\\.?\\s*p\\.?\\s*r\\.?|dpr|' +
  'decreto[\\s-]legge|d\\.?\\s*l\\.?(?!gs)|dl|' +
  'regio\\s+decreto|r\\.?\\s*d\\.?|' +
  'decreto\\s+ministeriale|d\\.?\\s*m\\.?|' +
  'legge|l\\.?)';

const ACT_CODE_PATTERN = new RegExp(`^(${ACT_TYPE_PREFIX_PATTERN})\\s*\\.?\\s*(\\d+)\\s*/\\s*(\\d{4})$`, 'i');

/** Best-effort fallback when the act isn't one of the taxonomy's curated
 * foundation acts: parses a bare `actCode` string into a Normattiva URN
 * using only the year (no exact day/month is derivable from the code
 * alone) — Normattiva's own permalink resolver accepts and redirects this
 * year-only URN form correctly for uniquely-numbered acts. */
function parseActCodeToUrn(actCode: string): NormattivaUrn | null {
  const match = actCode.trim().match(ACT_CODE_PATTERN);
  if (!match) return null;
  const prefix = match[1].toLowerCase().replace(/\s+/g, ' ').replace(/\./g, '').trim();
  const numero = match[2];
  const year = match[3];

  let tipo: string;
  if (prefix === 'decreto legislativo' || prefix === 'dlgs') tipo = 'decreto.legislativo';
  else if (prefix === 'decreto del presidente della repubblica' || prefix === 'dpr') tipo = 'decreto.presidente.repubblica';
  else if (prefix === 'decreto legge' || prefix === 'dl') tipo = 'decreto.legge';
  else if (prefix === 'regio decreto' || prefix === 'rd') tipo = 'regio.decreto';
  else if (prefix === 'decreto ministeriale' || prefix === 'dm') tipo = 'decreto.ministeriale';
  else tipo = 'legge';

  return { tipo, date: year, numero };
}

// ---------------------------------------------------------------------------
// 6. STEP 2 — ON-DEMAND INSTITUTIONAL FETCH (+ realistic fallback)
// ---------------------------------------------------------------------------

function buildInstitutionalFallback(
  actCode: string,
  articleNumber: string | undefined,
  known: { officialTitle: string; popularTitle: string } | null,
  urn: NormattivaUrn,
): ResolvedHistoricalAct {
  const officialTitle = known?.officialTitle ?? actCode;
  const articleLabel = articleNumber ? `art. ${articleNumber}` : 'il testo introduttivo';
  return {
    actCode,
    articleNumber: articleNumber ?? '1',
    officialTitle,
    popularTitle: known?.popularTitle,
    verbatimText:
      `[Servizio Normattiva temporaneamente non disponibile] Non è stato possibile recuperare in tempo reale ${articleLabel} ` +
      `di ${officialTitle} (${actCode}): il portale ufficiale non ha risposto entro i tempi previsti oppure ha limitato la ` +
      'richiesta. Riprova tra qualche istante oppure consulta direttamente la fonte ufficiale al link riportato.',
    sourceUrl: normattivaPermalinkUrl(urn),
    isLocallyCached: false,
    isUnavailableNotice: true,
  };
}

async function resolveFromNormattiva(actCode: string, articleNumber?: string, cacheKeyForWrite?: string): Promise<ResolvedHistoricalAct | null> {
  const known = findKnownFoundationAct(actCode);
  const urn = known?.urn ?? parseActCodeToUrn(actCode);
  if (!urn) return null; // actCode doesn't identify any recognizable act at all

  try {
    const fetched = await fetchArticleFromNormattiva(urn, articleNumber);
    if (fetched) {
      const resolved: ResolvedHistoricalAct = {
        actCode,
        articleNumber: fetched.article.number,
        officialTitle: known?.officialTitle ?? fetched.pageTitle ?? actCode,
        popularTitle: known?.popularTitle,
        verbatimText: fetched.article.original,
        sourceUrl: normattivaPermalinkUrl(urn),
        isLocallyCached: false,
        isUnavailableNotice: false,
      };
      if (cacheKeyForWrite) await persistToDurableCache(resolved, cacheKeyForWrite);
      return resolved;
    }
  } catch (error) {
    console.warn(
      `[normattiva_resolver] Live fetch failed for ${actCode}${articleNumber ? `, art. ${articleNumber}` : ''}:`,
      error instanceof Error ? error.message : error,
    );
  }

  // The act's identity is known even though the live fetch itself failed
  // (timeout, throttling, transient 5xx, unparsable response) — degrade to
  // a clearly-labelled institutional notice rather than a hard failure.
  return buildInstitutionalFallback(actCode, articleNumber, known, urn);
}

// ---------------------------------------------------------------------------
// 7. PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Resolves a single historical statute/article reference: local Supabase
 * copy first, live Normattiva fetch second, transient in-memory cache
 * wrapping both. Returns `null` only when `actCode` cannot be identified as
 * any recognizable Italian legal act at all (not even enough to build a
 * fallback notice).
 */
export async function resolveHistoricalNorm(options: ResolveNormOptions): Promise<ResolvedHistoricalAct | null> {
  const actCode = options.actCode?.trim();
  const articleNumber = options.articleNumber?.trim() || undefined;
  if (!actCode) return null;

  const key = cacheKey(actCode, articleNumber);
  const cached = transientCache.get(key);
  if (cached) return cached;

  const local = await resolveFromDatabase(actCode, articleNumber);
  if (local) {
    transientCache.set(key, local);
    return local;
  }

  const durable = await resolveFromDurableCache(actCode, articleNumber, key);
  if (durable) {
    transientCache.set(key, durable);
    return durable;
  }

  const remote = await resolveFromNormattiva(actCode, articleNumber, key);
  if (remote) {
    transientCache.set(key, remote);
    return remote;
  }

  return null;
}

/** Batch variant for grounding multiple references at once (e.g. every
 * `NormImpact` cited by a RAG answer) — resolves them concurrently and
 * silently drops any reference that couldn't be identified at all, so one
 * bad `actCode` in a batch never fails the whole request. */
export async function resolveMultipleHistoricalNorms(
  references: ResolveNormOptions[],
): Promise<ResolvedHistoricalAct[]> {
  const resolved = await Promise.all(references.map((reference) => resolveHistoricalNorm(reference)));
  return resolved.filter((entry): entry is ResolvedHistoricalAct => entry !== null);
}

// ---------------------------------------------------------------------------
// 8. ON-DEMAND KEYWORD/SUBJECT SEARCH (router of last resort)
// ---------------------------------------------------------------------------

/** Real Normattiva OpenData record shape — same endpoint and fields already
 * verified by hand in `scripts/ingest_normattiva.ts`. */
type RicercaAttoHit = {
  dataGU: string;
  codiceRedazionale: string;
  denominazioneAtto: string; // 'LEGGE' | 'DECRETO-LEGGE' | 'DECRETO LEGISLATIVO' | ...
  titoloAtto: string;
  numeroProvvedimento: string;
  annoProvvedimento: string;
  dataEmanazione: string; // "YYYY-MM-DDT..."
};

const DENOMINAZIONE_TO_URN_TYPE: Record<string, string> = {
  LEGGE: 'legge',
  'DECRETO-LEGGE': 'decreto.legge',
  'DECRETO LEGISLATIVO': 'decreto.legislativo',
};

const DENOMINAZIONE_TO_LABEL: Record<string, string> = {
  LEGGE: 'L.',
  'DECRETO-LEGGE': 'D.L.',
  'DECRETO LEGISLATIVO': 'D.Lgs.',
};

async function ricercaSemplice(testoRicerca: string, numeroElementiPerPagina: number): Promise<RicercaAttoHit[]> {
  const response = await fetchWithTimeout(`${NORMATTIVA_OPENDATA_API}/api/v1/ricerca/semplice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      testoRicerca,
      orderType: 'recente',
      paginazione: { paginaCorrente: 1, numeroElementiPerPagina },
    }),
  });
  if (!response.ok) return [];
  const json = (await response.json().catch(() => null)) as { listaAtti?: RicercaAttoHit[] } | null;
  return json?.listaAtti ?? [];
}

async function dettaglioAttoHtml(hit: RicercaAttoHit): Promise<string | null> {
  const response = await fetchWithTimeout(`${NORMATTIVA_OPENDATA_API}/api/v1/atto/dettaglio-atto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ dataGU: hit.dataGU, codiceRedazionale: hit.codiceRedazionale, formatoRichiesta: 'V' }),
  });
  if (!response.ok) return null;
  const json = (await response.json().catch(() => null)) as {
    success?: boolean;
    data?: { atto?: { articoloHtml?: string } };
  } | null;
  return json?.data?.atto?.articoloHtml ?? null;
}

/**
 * Router of last resort for requirement #4: resolves norms not by a
 * precisely-known `actCode`/URN but by free-text subject/keyword search
 * against Normattiva's own OpenData index (`ricerca/semplice` — the exact
 * same real, verified endpoint `scripts/ingest_normattiva.ts` uses for
 * ingestion). Every hit's Article 1 is fetched live via `dettaglio-atto`
 * and only kept if genuine verbatim text came back — never a fabricated or
 * placeholder result, and never an `isUnavailableNotice` entry (a hit that
 * can't be fetched is simply dropped, since — unlike a specific act the
 * user explicitly named — there is no single "known identity" worth
 * degrading to a fallback notice for here). Successful hits are cached
 * exactly like any other resolution (transient + durable Supabase).
 */
export async function searchNormattivaByKeyword(query: string, limit = 2): Promise<ResolvedHistoricalAct[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const hits = await ricercaSemplice(trimmed, Math.max(limit * 3, 6));
    const usable = hits.filter((hit) => hit.denominazioneAtto in DENOMINAZIONE_TO_LABEL).slice(0, limit);

    const resolved: ResolvedHistoricalAct[] = [];
    for (const hit of usable) {
      const label = DENOMINAZIONE_TO_LABEL[hit.denominazioneAtto];
      const actCode = `${label} ${hit.numeroProvvedimento}/${hit.annoProvvedimento}`;
      const key = cacheKey(actCode);

      const cached = transientCache.get(key);
      if (cached) {
        resolved.push(cached);
        continue;
      }

      const html = await dettaglioAttoHtml(hit);
      if (!html) continue;
      const original = stripTags(html);
      if (!original || original.length < 100) continue;

      const officialTitle = stripTags(hit.titoloAtto).replace(/\s*\(\w+\)\s*$/, '') || actCode;
      const urn: NormattivaUrn = { tipo: DENOMINAZIONE_TO_URN_TYPE[hit.denominazioneAtto], date: hit.dataEmanazione.slice(0, 10), numero: hit.numeroProvvedimento };
      const result: ResolvedHistoricalAct = {
        actCode,
        articleNumber: '1',
        officialTitle,
        verbatimText: original,
        sourceUrl: normattivaPermalinkUrl(urn),
        isLocallyCached: false,
        isUnavailableNotice: false,
      };

      transientCache.set(key, result);
      await persistToDurableCache(result, key);
      resolved.push(result);
    }
    return resolved;
  } catch (error) {
    console.warn('[normattiva_resolver] Keyword search failed (non-fatal):', error instanceof Error ? error.message : error);
    return [];
  }
}
