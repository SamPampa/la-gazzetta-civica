import type { Prisma } from '@prisma/client';
import { type ActListItem, type ActSortKey, type GetActsParams, type GetActsResult } from '@/lib/archive';
import { prisma } from '@/lib/db/prisma';
import {
  MOCK_ACTS,
  currentYear,
  getActById as getMockActById,
  isRecentAct,
  resolveActId,
  searchActs,
  type Act,
  type Copertura,
  type Iniziativa,
  type IterStatus,
  type LawArticle,
  type Materia,
  type NormImpact,
} from '@/src/data/mockActs';

export {
  ARCHIVE_PAGE_SIZE,
  parseArchiveSearchParams,
  type ActListItem,
  type ActSortKey,
  type GetActsParams,
  type GetActsResult,
  type TimeRange,
} from '@/lib/archive';

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

export type ActWithRelations = Act & { voteBreakdown?: VoteBreakdownDTO | null };

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 24;

const LIST_SELECT = {
  id: true,
  code: true,
  formalTitle: true,
  officialTitle: true,
  popularTitle: true,
  date: true,
  iniziativa: true,
  materia: true,
  copertura: true,
  iterStatus: true,
  decreesMissing: true,
  decreeDeadline: true,
  urgency: true,
  ministry: true,
} satisfies Prisma.ActSelect;

type DbActListRow = Prisma.ActGetPayload<{ select: typeof LIST_SELECT }>;

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

function asOmnibusRisk(value: Prisma.JsonValue | null): Act['omnibusRisk'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as unknown as Act['omnibusRisk'];
}

function asLobbyCheck(value: Prisma.JsonValue | null): Act['lobbyCheck'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as unknown as Act['lobbyCheck'];
}

function asDemocraticBypass(value: Prisma.JsonValue | null): NonNullable<Act['democraticBypass']> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.executiveDominanceScore !== 'number' || typeof row.summaryDescription !== 'string') {
    return null;
  }
  const status = row.statusLevel;
  if (status !== 'ordinario' && status !== 'accelerato' && status !== 'bypass_elevato') return null;
  return {
    executiveDominanceScore: row.executiveDominanceScore,
    statusLevel: status,
    confidenceVotePlaced: row.confidenceVotePlaced === true,
    summaryDescription: row.summaryDescription,
  };
}

type DbArticleWithImpacts = Prisma.ArticleGetPayload<{ include: { impacts: true } }>;
type DbActWithRelations = Prisma.ActGetPayload<{
  include: { articles: { include: { impacts: true } }; votes: true };
}>;
type DbVoteBreakdown = NonNullable<DbActWithRelations['votes']>;

const CAMERA_QUORUM = 201;
const SENATO_QUORUM = 101;

type ActVoteMeta = {
  code: string;
  iterStatus: string;
  preamble: string;
  date: string;
};

function inferChamber(act: Pick<ActVoteMeta, 'code' | 'iterStatus' | 'preamble'>): VoteBreakdownDTO['chamber'] {
  const code = act.code.toLowerCase();
  const preamble = act.preamble.toLowerCase();
  if (act.iterStatus === 'promulgata' || preamble.includes('camera dei deputati e il senato')) {
    return 'Bicamerale';
  }
  if (act.iterStatus === 'navetta_senato' || /\ba\.?s\.?\b/.test(code) || code.includes('senato')) {
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

function mapArticle(article: DbArticleWithImpacts): LawArticle {
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
  const articles = [...act.articles].sort((a, b) => a.orderIndex - b.orderIndex).map(mapArticle);

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
    democraticBypass: asDemocraticBypass(act.democraticBypass),
    urgency: act.urgency,
    keywords: [],
    ministry: act.ministry,
    preamble: act.preamble,
    articles,
    voteBreakdown: act.votes ? toVoteBreakdownDTO(act, act.votes) : null,
  };
}

function toListItem(act: Pick<Act, keyof ActListItem> | DbActListRow): ActListItem {
  return {
    id: act.id,
    code: act.code,
    formalTitle: act.formalTitle,
    officialTitle: act.officialTitle,
    popularTitle: act.popularTitle,
    date: act.date,
    iniziativa: act.iniziativa as Iniziativa,
    materia: act.materia as Materia,
    copertura: act.copertura as Copertura,
    iterStatus: act.iterStatus as IterStatus,
    decreesMissing: act.decreesMissing,
    decreeDeadline: act.decreeDeadline,
    urgency: act.urgency,
    ministry: act.ministry,
  };
}

function sortActs<T extends { urgency: number; date: string }>(rows: T[], sort: ActSortKey): T[] {
  return [...rows].sort((a, b) =>
    sort === 'date' ? b.date.localeCompare(a.date) || b.urgency - a.urgency : b.urgency - a.urgency || b.date.localeCompare(a.date),
  );
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

function getActsFromMock(params: GetActsParams): GetActsResult {
  const page = Math.max(1, params.page ?? DEFAULT_PAGE);
  const pageSize = Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE);
  const sort = params.sort ?? 'urgency';

  const query = params.query?.trim();
  const base = query ? searchActs(query) : [...MOCK_ACTS];
  const filtered = sortActs(
    base.filter((act) => matchesMockFilters(act, params)),
    sort,
  );

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map(toListItem);

  return { items, total, page: safePage, pageSize, totalPages };
}

function buildWhereClause(params: GetActsParams): Prisma.ActWhereInput {
  const where: Prisma.ActWhereInput = {};

  if (params.iter) where.iterStatus = params.iter;
  if (params.iniziativa) where.iniziativa = params.iniziativa;
  if (params.materia) where.materia = params.materia;
  if (params.copertura) where.copertura = params.copertura;

  const timeRange = params.timeRange ?? 'all';
  if (timeRange !== 'all') {
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

export async function getActs(params: GetActsParams = {}): Promise<GetActsResult> {
  if (!isDatabaseConfigured()) {
    warnFallbackToMock('unconfigured');
    return getActsFromMock(params);
  }

  const page = Math.max(1, params.page ?? DEFAULT_PAGE);
  const pageSize = Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE);
  const sort = params.sort ?? 'urgency';

  try {
    const where = buildWhereClause(params);
    const orderBy: Prisma.ActOrderByWithRelationInput[] =
      sort === 'date' ? [{ date: 'desc' }, { urgency: 'desc' }] : [{ urgency: 'desc' }, { date: 'desc' }];

    const total = await prisma.act.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);

    const rows = await prisma.act.findMany({
      where,
      select: LIST_SELECT,
      orderBy,
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    });

    return {
      items: rows.map(toListItem),
      total,
      page: safePage,
      pageSize,
      totalPages,
    };
  } catch (error) {
    warnFallbackToMock('error', error);
    return getActsFromMock(params);
  }
}

function mockDetail(id: string): ActWithRelations | null {
  const act = getMockActById(id);
  if (!act) return null;
  return { ...act, voteBreakdown: null };
}

/**
 * Full act graph for `/atti/[id]`. Returns `null` when the id is not in
 * Supabase (or, if the DB is down, not in the bundled mock catalog).
 * Never invents a law for an unknown identifier.
 */
export async function getActById(id: string): Promise<ActWithRelations | null> {
  const resolved = resolveActId(id);

  if (!isDatabaseConfigured()) {
    warnFallbackToMock('unconfigured');
    return mockDetail(resolved);
  }

  try {
    const include = { articles: { include: { impacts: true as const } }, votes: true as const };
    let act = await prisma.act.findUnique({ where: { id: resolved }, include });
    if (!act && resolved !== id) {
      act = await prisma.act.findUnique({ where: { id }, include });
    }
    if (!act) return null;
    return mapAct(act);
  } catch (error) {
    warnFallbackToMock('error', error);
    return mockDetail(resolved);
  }
}
