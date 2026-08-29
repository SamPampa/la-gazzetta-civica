import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  MOCK_ACTS,
  currentYear,
  getActById as getMockActById,
  isRecentAct,
  searchActs,
  type Act,
  type Copertura,
  type Iniziativa,
  type IterStatus,
  type LawArticle,
  type Materia,
  type NormImpact,
} from '@/src/data/mockActs';

export type TimeRange = 'all' | 'recent' | 'historic';

export type GetActsParams = {
  page?: number;
  pageSize?: number;
  timeRange?: TimeRange;
  query?: string;
  iter?: IterStatus;
  iniziativa?: Iniziativa;
  materia?: Materia;
  copertura?: Copertura;
};

export type VoteBreakdownDTO = {
  favorevoli: number;
  contrari: number;
  astenuti: number;
  pctFav: number;
  pctCont: number;
  pctAst: number;
  totalVoters?: number;
  chamber?: 'Camera' | 'Senato' | 'Bicamerale' | string;
  voteDate?: string;
  quorumNotice?: string;
};

/** Same shape the rest of the app already knows (`ArchiveExplorer`,
 * `ActCard`, `LawReader`), plus an optional `voteBreakdown` the DB can
 * supply once the UI is wired up to it - additive only, so every existing
 * consumer typed against `Act` keeps working untouched. */
export type ActWithRelations = Act & { voteBreakdown?: VoteBreakdownDTO | null };

export type GetActsResult = {
  items: ActWithRelations[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 24;

let warnedNoDatabase = false;
let warnedConnectionFailure = false;

function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

function warnFallbackToMock(reason: 'unconfigured' | 'error', error?: unknown) {
  if (reason === 'unconfigured' && !warnedNoDatabase) {
    warnedNoDatabase = true;
    console.warn(
      '[lib/db/acts] DATABASE_URL is not set - serving acts from src/data/mockActs.ts instead of Supabase.',
    );
  }
  if (reason === 'error' && !warnedConnectionFailure) {
    warnedConnectionFailure = true;
    console.warn(
      '[lib/db/acts] Could not reach the Supabase database - falling back to src/data/mockActs.ts.',
      error,
    );
  }
}

/** Prisma's `Json?` columns come back as `Prisma.JsonValue`; the app-level
 * `Act` type expects the exact literal shape authored in mockActs.ts. Both
 * `omnibusRisk` and `lobbyCheck` are only ever written by our own seed
 * script/API, so a straight cast is safe here. */
function asOmnibusRisk(value: Prisma.JsonValue | null): Act['omnibusRisk'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as unknown as Act['omnibusRisk'];
}

function asLobbyCheck(value: Prisma.JsonValue | null): Act['lobbyCheck'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as unknown as Act['lobbyCheck'];
}

type DbArticleWithImpacts = Prisma.ArticleGetPayload<{ include: { impacts: true } }>;
type DbActWithRelations = Prisma.ActGetPayload<{
  include: { articles: { include: { impacts: true } }; votes: true };
}>;
type DbVoteBreakdown = NonNullable<DbActWithRelations['votes']>;

/** Camera: 400 deputies, sitting quorum = majority of members (201).
 * Senato: 200 elected senators, sitting quorum = 101. */
const CAMERA_QUORUM = 201;
const SENATO_QUORUM = 101;

function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  }
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

type ActVoteMeta = {
  code: string;
  iterStatus: string;
  preamble: string;
  date: string;
};

function inferChamber(act: Pick<ActVoteMeta, 'code' | 'iterStatus' | 'preamble'>): VoteBreakdownDTO['chamber'] {
  const code = act.code.toLowerCase();
  const preamble = act.preamble.toLowerCase();
  if (
    act.iterStatus === 'promulgata' ||
    preamble.includes('camera dei deputati e il senato')
  ) {
    return 'Bicamerale';
  }
  if (
    act.iterStatus === 'navetta_senato' ||
    /\ba\.?s\.?\b/.test(code) ||
    code.includes('senato')
  ) {
    return 'Senato';
  }
  return 'Camera';
}

function buildQuorumNotice(
  chamber: VoteBreakdownDTO['chamber'],
  favorevoli: number,
  contrari: number,
  totalVoters: number,
): string {
  const looksLikeCamera = chamber === 'Camera' || (chamber === 'Bicamerale' && totalVoters >= 250);
  const threshold = looksLikeCamera ? CAMERA_QUORUM : SENATO_QUORUM;
  const quorumOk = totalVoters >= threshold;
  const passed = favorevoli > contrari;
  const quorumBit = quorumOk ? 'Quorum costitutivo raggiunto' : 'Quorum costitutivo non raggiunto';
  const outcome = passed
    ? 'provvedimento approvato a maggioranza dei votanti'
    : 'maggioranza dei votanti non raggiunta';
  return `${quorumBit} · ${outcome}.`;
}

function toVoteBreakdownDTO(
  act: ActVoteMeta,
  votes: Pick<DbVoteBreakdown, 'favorevoli' | 'contrari' | 'astenuti' | 'pctFav' | 'pctCont' | 'pctAst'>,
): VoteBreakdownDTO {
  const totalVoters = votes.favorevoli + votes.contrari + votes.astenuti;
  const chamber = inferChamber(act);
  return {
    favorevoli: votes.favorevoli,
    contrari: votes.contrari,
    astenuti: votes.astenuti,
    pctFav: votes.pctFav,
    pctCont: votes.pctCont,
    pctAst: votes.pctAst,
    totalVoters,
    chamber,
    voteDate: act.date,
    quorumNotice: buildQuorumNotice(chamber, votes.favorevoli, votes.contrari, totalVoters),
  };
}

/**
 * Deterministic, plausible roll-call used only when the live `VoteBreakdown`
 * row is missing *and* the act is past commission (mock catalog / fallback
 * acts). Never invented for `in_commissione` — those stay `null` so the
 * chart can hide without fabricating an Aula result.
 */
function synthesizeFallbackVotes(act: Act): VoteBreakdownDTO {
  const rand = seededRandom(`vote:${act.id}`);
  const favBias = 0.45 + (act.urgency / 100) * 0.25;
  const pctAst = Math.round(2 + rand() * 8);
  const remaining = 100 - pctAst;
  const pctFav = Math.round(
    remaining * Math.min(0.9, Math.max(0.35, favBias + (rand() - 0.5) * 0.1)),
  );
  const pctCont = Math.max(0, remaining - pctFav);

  const chamber = inferChamber(act);
  const totalVotanti = chamber === 'Senato' ? 200 : chamber === 'Camera' ? 400 : 600;
  const favorevoli = Math.round((pctFav / 100) * totalVotanti);
  const contrari = Math.round((pctCont / 100) * totalVotanti);
  const astenuti = Math.round((pctAst / 100) * totalVotanti);
  const totalVoters = favorevoli + contrari + astenuti;

  return {
    favorevoli,
    contrari,
    astenuti,
    pctFav,
    pctCont,
    pctAst,
    totalVoters,
    chamber,
    voteDate: act.date,
    quorumNotice: buildQuorumNotice(chamber, favorevoli, contrari, totalVoters),
  };
}

/** Attach a vote payload to mock/fallback acts so `/atti/[id]` can render
 * the chart without a live `VoteBreakdown` row. Commission-stage acts stay
 * `null` and the UI shows the pending state instead. */
function attachVoteBreakdown(act: Act): ActWithRelations {
  if (act.iterStatus === 'in_commissione') {
    return { ...act, voteBreakdown: null };
  }
  return { ...act, voteBreakdown: synthesizeFallbackVotes(act) };
}

function mapArticle(article: DbArticleWithImpacts): LawArticle {
  // The current reader UI (`LawReader`) only ever renders one novella
  // callout per article, mirroring how every hand-authored mock article
  // has at most one `impact`. The schema allows many `NormImpact` rows per
  // article for future multi-novella articles, so we surface the first one
  // here rather than dropping the relation's richer cardinality on the
  // floor at the schema level.
  const [firstImpact] = article.impacts;
  const impact: NormImpact | undefined = firstImpact
    ? {
        modifiedActCode: firstImpact.modifiedActCode,
        targetArticle: firstImpact.targetArticle,
        impactType: firstImpact.impactType as NormImpact['impactType'],
        previousRuleSummary: firstImpact.previousRuleSummary,
        newEffectSummary: firstImpact.newEffectSummary,
        officialSourceUrl: firstImpact.officialSourceUrl ?? undefined,
      }
    : undefined;

  return {
    number: article.number,
    heading: article.heading,
    original: article.original,
    structured: article.structured,
    simple: article.simple,
    ...(impact ? { impact } : {}),
  };
}

function mapAct(act: DbActWithRelations): ActWithRelations {
  const articles = [...act.articles]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map(mapArticle);

  return {
    id: act.id,
    code: act.code,
    formalTitle: act.formalTitle,
    officialTitle: act.officialTitle,
    popularTitle: act.popularTitle,
    summary: act.summary,
    date: act.date,
    publishedAt: act.publishedAt,
    inForceAt: act.inForceAt,
    sourceUrl: act.sourceUrl,
    sourceLabel: act.sourceLabel,
    iniziativa: act.iniziativa as Iniziativa,
    materia: act.materia as Materia,
    copertura: act.copertura as Copertura,
    iterStatus: act.iterStatus as IterStatus,
    decreesMissing: act.decreesMissing,
    decreeDeadline: act.decreeDeadline,
    financialNote: act.financialNote,
    omnibusRisk: asOmnibusRisk(act.omnibusRisk),
    lobbyCheck: asLobbyCheck(act.lobbyCheck),
    urgency: act.urgency,
    // Not modeled in the Postgres schema (see prisma/schema.prisma) - kept
    // empty rather than omitted so DB-sourced acts still satisfy the `Act`
    // type every component already imports.
    keywords: [],
    ministry: act.ministry,
    preamble: act.preamble,
    articles,
    voteBreakdown: act.votes ? toVoteBreakdownDTO(act, act.votes) : null,
  };
}

function matchesMockFilters(act: Act, params: GetActsParams): boolean {
  const timeRange = params.timeRange ?? 'all';
  if (timeRange === 'recent' && !isRecentAct(act)) return false;
  if (timeRange === 'historic' && isRecentAct(act)) return false;
  if (params.iter && act.iterStatus !== params.iter) return false;
  if (params.iniziativa && act.iniziativa !== params.iniziativa) return false;
  if (params.materia && act.materia !== params.materia) return false;
  if (params.copertura && act.copertura !== params.copertura) return false;
  return true;
}

/** Mirrors `getActs`'s contract exactly, but sourced from the in-memory
 * mock catalog - used both as the explicit "no DATABASE_URL" mode and as
 * the safety net when a configured Supabase connection is unreachable. */
function getActsFromMock(params: GetActsParams): GetActsResult {
  const page = Math.max(1, params.page ?? DEFAULT_PAGE);
  const pageSize = Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE);

  const query = params.query?.trim();
  const base = query ? searchActs(query) : [...MOCK_ACTS];
  const filtered = base.filter((act) => matchesMockFilters(act, params));
  const sorted = [...filtered].sort((a, b) => b.urgency - a.urgency || b.date.localeCompare(a.date));

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (Math.min(page, totalPages) - 1) * pageSize;
  const items = sorted.slice(start, start + pageSize);

  return { items, total, page, pageSize, totalPages };
}

function buildWhereClause(params: GetActsParams): Prisma.ActWhereInput {
  const where: Prisma.ActWhereInput = {};

  if (params.iter) where.iterStatus = params.iter;
  if (params.iniziativa) where.iniziativa = params.iniziativa;
  if (params.materia) where.materia = params.materia;
  if (params.copertura) where.copertura = params.copertura;

  const timeRange = params.timeRange ?? 'all';
  if (timeRange !== 'all') {
    // `date` is stored as an ISO `YYYY-MM-DD` string, so lexicographic
    // comparison against another ISO string is a safe stand-in for a real
    // date comparison - no need to cast the column to `date`/`timestamp`.
    const cutoff = `${currentYear() - 5}-01-01`;
    where.date = timeRange === 'recent' ? { gte: cutoff } : { lt: cutoff };
  }

  const query = params.query?.trim();
  if (query) {
    where.OR = [
      { popularTitle: { contains: query, mode: 'insensitive' } },
      { officialTitle: { contains: query, mode: 'insensitive' } },
      { formalTitle: { contains: query, mode: 'insensitive' } },
      { summary: { contains: query, mode: 'insensitive' } },
      { code: { contains: query, mode: 'insensitive' } },
    ];
  }

  return where;
}

/**
 * Paginated, faceted act listing for `/atti`. Queries Supabase via Prisma
 * when `DATABASE_URL` is configured and reachable; otherwise (or on any
 * connection failure) transparently falls back to the bundled
 * `src/data/mockActs.ts` catalog so the archive page never hard-fails.
 */
export async function getActs(params: GetActsParams = {}): Promise<GetActsResult> {
  if (!isDatabaseConfigured()) {
    warnFallbackToMock('unconfigured');
    return getActsFromMock(params);
  }

  const page = Math.max(1, params.page ?? DEFAULT_PAGE);
  const pageSize = Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE);

  try {
    const where = buildWhereClause(params);

    const [rows, total] = await Promise.all([
      prisma.act.findMany({
        where,
        include: { articles: { include: { impacts: true } }, votes: true },
        orderBy: [{ urgency: 'desc' }, { date: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.act.count({ where }),
    ]);

    return {
      items: rows.map(mapAct),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  } catch (error) {
    warnFallbackToMock('error', error);
    return getActsFromMock(params);
  }
}

/**
 * Single act with its full relational graph (articles, their norm
 * impacts, and the vote breakdown) for `/atti/[id]`. Falls back to
 * `src/data/mockActs.ts`'s `getActById` - which itself always resolves to
 * *some* act via `generateFallbackAct` - whenever the DB is unconfigured,
 * unreachable, or simply doesn't have this id yet.
 */
export async function getActById(id: string): Promise<ActWithRelations> {
  if (!isDatabaseConfigured()) {
    warnFallbackToMock('unconfigured');
    return attachVoteBreakdown(getMockActById(id));
  }

  try {
    const act = await prisma.act.findUnique({
      where: { id },
      // Always load the optional 1:1 `VoteBreakdown` so the act detail
      // page can render `<VoteBreakdownChart />` (or the pending state
      // when `votes` is still null — e.g. acts in commissione).
      include: { articles: { include: { impacts: true } }, votes: true },
    });

    if (!act) return attachVoteBreakdown(getMockActById(id));
    return mapAct(act);
  } catch (error) {
    warnFallbackToMock('error', error);
    return attachVoteBreakdown(getMockActById(id));
  }
}
