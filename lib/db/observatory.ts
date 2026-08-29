import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { MOCK_ACTS } from '@/src/data/mockActs';

export interface MinistryDelayStat {
  ministry: string;
  totalActs: number;
  totalMissingDecrees: number;
  actsWithDelays: number;
  averageDelayDays: number;
  maxDelayDays: number;
}

export interface FinancialCoverageStat {
  copertura: 'a_debito' | 'tagli_spesa' | 'invarianza';
  count: number;
  percentage: number;
}

export interface IterVelocityStat {
  materia: string;
  averageUrgency: number;
  promulgatedCount: number;
  inProgressCount: number;
}

export interface ObservatoryDashboardData {
  summary: {
    totalActsTracked: number;
    totalMissingDecrees: number;
    overallAverageDelayDays: number;
    invarianzaFinancialPercentage: number;
    confidenceVoteRate: number;
    omnibusAlertsCount: number;
  };
  ministryLeaderboard: MinistryDelayStat[];
  coverageDistribution: FinancialCoverageStat[];
  iterVelocity: IterVelocityStat[];
  topDelayedActs: {
    id: string;
    code: string;
    popularTitle: string;
    ministry: string;
    decreesMissing: number;
    decreeDeadline: string | null;
    delayDays: number;
  }[];
}

const COPERTURA_ORDER = ['a_debito', 'tagli_spesa', 'invarianza'] as const;
type CoperturaKind = (typeof COPERTURA_ORDER)[number];

const TOP_DELAYED_ACTS_LIMIT = 10;
const MS_PER_DAY = 86_400_000;

const observatoryActSelect = {
  id: true,
  code: true,
  popularTitle: true,
  ministry: true,
  copertura: true,
  materia: true,
  iterStatus: true,
  decreesMissing: true,
  decreeDeadline: true,
  omnibusRisk: true,
  urgency: true,
} satisfies Prisma.ActSelect;

type ObservatoryActRow = Prisma.ActGetPayload<{ select: typeof observatoryActSelect }>;

let warnedNoDatabase = false;
let warnedConnectionFailure = false;

function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

function warnFallbackToMock(reason: 'unconfigured' | 'error', error?: unknown) {
  if (reason === 'unconfigured' && !warnedNoDatabase) {
    warnedNoDatabase = true;
    console.warn(
      '[lib/db/observatory] DATABASE_URL is not set - aggregating from src/data/mockActs.ts instead of Supabase.',
    );
  }
  if (reason === 'error' && !warnedConnectionFailure) {
    warnedConnectionFailure = true;
    console.warn(
      '[lib/db/observatory] Could not reach the Supabase database - falling back to src/data/mockActs.ts.',
      error,
    );
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function asCopertura(value: string): CoperturaKind | null {
  if (value === 'a_debito' || value === 'tagli_spesa' || value === 'invarianza') {
    return value;
  }
  return null;
}

function hasOmnibusAlert(value: Prisma.JsonValue | null): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function utcCalendarDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseDeadlineUtcDay(deadlineStr: string): number | null {
  const trimmed = deadlineStr.trim();
  if (!trimmed) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) {
    return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return utcCalendarDay(new Date(parsed));
}

/**
 * Calendar-day lateness of a decreto-attuativo deadline versus `referenceDate`
 * (default: now). Null or still-future deadlines return 0; a past deadline
 * returns the UTC date-only difference in days. Matches `daysLate` in
 * `src/data/mockActs.ts` so observatory KPIs stay consistent with ActCard.
 */
export function calculateDelayDays(
  deadlineStr: string | null,
  referenceDate: Date = new Date(),
): number {
  if (!deadlineStr) return 0;
  const deadlineUtc = parseDeadlineUtcDay(deadlineStr);
  if (deadlineUtc === null) return 0;

  const referenceUtc = utcCalendarDay(referenceDate);
  if (deadlineUtc >= referenceUtc) return 0;
  return Math.round((referenceUtc - deadlineUtc) / MS_PER_DAY);
}

function fromMockActs(): ObservatoryActRow[] {
  return MOCK_ACTS.map((act) => ({
    id: act.id,
    code: act.code,
    popularTitle: act.popularTitle,
    ministry: act.ministry,
    copertura: act.copertura,
    materia: act.materia,
    iterStatus: act.iterStatus,
    decreesMissing: act.decreesMissing,
    decreeDeadline: act.decreeDeadline,
    omnibusRisk: act.omnibusRisk,
    urgency: act.urgency,
  }));
}

async function loadObservatoryActs(): Promise<ObservatoryActRow[]> {
  if (!isDatabaseConfigured()) {
    warnFallbackToMock('unconfigured');
    return fromMockActs();
  }

  try {
    return await prisma.act.findMany({ select: observatoryActSelect });
  } catch (error) {
    warnFallbackToMock('error', error);
    return fromMockActs();
  }
}

function buildMinistryLeaderboard(
  rows: ObservatoryActRow[],
  referenceDate: Date,
): MinistryDelayStat[] {
  const grouped = new Map<string, ObservatoryActRow[]>();
  for (const row of rows) {
    const ministry = row.ministry.trim() || 'Ministero non indicato';
    const bucket = grouped.get(ministry);
    if (bucket) bucket.push(row);
    else grouped.set(ministry, [row]);
  }

  const stats: MinistryDelayStat[] = [];
  for (const [ministry, acts] of grouped) {
    const pendingDelays = acts
      .filter((act) => act.decreesMissing > 0)
      .map((act) => calculateDelayDays(act.decreeDeadline, referenceDate));
    const delayed = pendingDelays.filter((days) => days > 0);

    stats.push({
      ministry,
      totalActs: acts.length,
      totalMissingDecrees: acts.reduce((sum, act) => sum + act.decreesMissing, 0),
      actsWithDelays: delayed.length,
      averageDelayDays: round1(mean(pendingDelays)),
      maxDelayDays: pendingDelays.length === 0 ? 0 : Math.max(...pendingDelays),
    });
  }

  return stats.sort(
    (a, b) =>
      b.totalMissingDecrees - a.totalMissingDecrees ||
      b.maxDelayDays - a.maxDelayDays ||
      a.ministry.localeCompare(b.ministry, 'it'),
  );
}

function buildCoverageDistribution(rows: ObservatoryActRow[]): FinancialCoverageStat[] {
  const counts: Record<CoperturaKind, number> = {
    a_debito: 0,
    tagli_spesa: 0,
    invarianza: 0,
  };

  for (const row of rows) {
    const copertura = asCopertura(row.copertura);
    if (copertura) counts[copertura] += 1;
  }

  const total = rows.length;
  return COPERTURA_ORDER.map((copertura) => ({
    copertura,
    count: counts[copertura],
    percentage: total === 0 ? 0 : round1((counts[copertura] / total) * 100),
  }));
}

function buildIterVelocity(rows: ObservatoryActRow[]): IterVelocityStat[] {
  const grouped = new Map<string, ObservatoryActRow[]>();
  for (const row of rows) {
    const materia = row.materia.trim() || 'non_classificata';
    const bucket = grouped.get(materia);
    if (bucket) bucket.push(row);
    else grouped.set(materia, [row]);
  }

  const stats: IterVelocityStat[] = [];
  for (const [materia, acts] of grouped) {
    const promulgatedCount = acts.filter((act) => act.iterStatus === 'promulgata').length;
    stats.push({
      materia,
      averageUrgency: round1(mean(acts.map((act) => act.urgency))),
      promulgatedCount,
      inProgressCount: acts.length - promulgatedCount,
    });
  }

  return stats.sort(
    (a, b) => b.averageUrgency - a.averageUrgency || a.materia.localeCompare(b.materia, 'it'),
  );
}

function buildTopDelayedActs(
  rows: ObservatoryActRow[],
  referenceDate: Date,
): ObservatoryDashboardData['topDelayedActs'] {
  return rows
    .map((act) => ({
      id: act.id,
      code: act.code,
      popularTitle: act.popularTitle,
      ministry: act.ministry,
      decreesMissing: act.decreesMissing,
      decreeDeadline: act.decreeDeadline,
      delayDays: calculateDelayDays(act.decreeDeadline, referenceDate),
    }))
    .filter((act) => act.decreesMissing > 0 && act.delayDays > 0)
    .sort(
      (a, b) =>
        b.delayDays - a.delayDays ||
        b.decreesMissing - a.decreesMissing ||
        a.code.localeCompare(b.code, 'it'),
    )
    .slice(0, TOP_DELAYED_ACTS_LIMIT);
}

function buildSummary(
  rows: ObservatoryActRow[],
  coverage: FinancialCoverageStat[],
  referenceDate: Date,
): ObservatoryDashboardData['summary'] {
  const pendingDelays = rows
    .filter((act) => act.decreesMissing > 0)
    .map((act) => calculateDelayDays(act.decreeDeadline, referenceDate));

  const invarianza = coverage.find((row) => row.copertura === 'invarianza');

  return {
    totalActsTracked: rows.length,
    totalMissingDecrees: rows.reduce((sum, act) => sum + act.decreesMissing, 0),
    overallAverageDelayDays: round1(mean(pendingDelays)),
    invarianzaFinancialPercentage: invarianza?.percentage ?? 0,
    // Act has no questione-di-fiducia column. Returning 0 rather than
    // inferring fiducia from decreto-legge classification (that would
    // invent parliamentary procedure). Wire a real flag when ingested.
    confidenceVoteRate: 0,
    omnibusAlertsCount: rows.filter((act) => hasOmnibusAlert(act.omnibusRisk)).length,
  };
}

function aggregateObservatory(
  rows: ObservatoryActRow[],
  referenceDate: Date = new Date(),
): ObservatoryDashboardData {
  const coverageDistribution = buildCoverageDistribution(rows);
  return {
    summary: buildSummary(rows, coverageDistribution, referenceDate),
    ministryLeaderboard: buildMinistryLeaderboard(rows, referenceDate),
    coverageDistribution,
    iterVelocity: buildIterVelocity(rows),
    topDelayedActs: buildTopDelayedActs(rows, referenceDate),
  };
}

/**
 * Live observatory KPIs from `prisma.act`. Falls back to the bundled mock
 * catalog when `DATABASE_URL` is missing or Supabase is unreachable, matching
 * `lib/db/acts.ts` so `/api/observatory` never hard-fails.
 */
export async function getObservatoryMetrics(): Promise<ObservatoryDashboardData> {
  const rows = await loadObservatoryActs();
  return aggregateObservatory(rows);
}
