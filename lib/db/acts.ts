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
    voteBreakdown: act.votes
      ? {
          favorevoli: act.votes.favorevoli,
          contrari: act.votes.contrari,
          astenuti: act.votes.astenuti,
          pctFav: act.votes.pctFav,
          pctCont: act.votes.pctCont,
          pctAst: act.votes.pctAst,
        }
      : null,
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
    return getMockActById(id);
  }

  try {
    const act = await prisma.act.findUnique({
      where: { id },
      include: { articles: { include: { impacts: true } }, votes: true },
    });

    if (!act) return getMockActById(id);
    return mapAct(act);
  } catch (error) {
    warnFallbackToMock('error', error);
    return getMockActById(id);
  }
}
