/**
 * Runs the three Phase-2 audit services against an act and returns the JSON
 * payloads persisted on `Act` (`lobbyCheck`, `omnibusRisk`, `democraticBypass`).
 *
 * Called from ingest/seed after articles exist — never at HTTP request time.
 * Missing parliamentary facts (fiducia, ore d'Aula, ghigliottina) are not
 * invented: bypass uses `actCode` + declared `urgency`, plus optional Aula
 * facts only when the caller actually observed them.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { computeDemocraticBypass, type DemocraticBypassStatus } from './democratic_bypass';
import { detectLobbyMatches } from './lobby_matcher';
import { scanActForOmnibusAlerts } from './omnibus_detector';

export type AuditArticle = {
  number: string;
  heading: string;
  original: string;
};

export type AulaFacts = {
  isConfidenceVote?: boolean;
  confidenceVoteChamber?: 'Camera' | 'Senato' | 'Entrambe';
  actualDebateHours?: number;
  amendmentsPresented?: number;
  amendmentsGuillotined?: number;
};

export type AuditInput = {
  id: string;
  code: string;
  materia: string;
  preamble: string;
  urgency: number;
  articles: AuditArticle[];
  aula?: AulaFacts;
};

export type LobbyCheckStored = {
  similarity: number;
  source: string;
};

export type OmnibusRiskStored = {
  article: string;
  description: string;
};

export type DemocraticBypassStored = {
  executiveDominanceScore: number;
  statusLevel: DemocraticBypassStatus;
  confidenceVotePlaced: boolean;
  summaryDescription: string;
};

export type ActAuditPayload = {
  lobbyCheck: LobbyCheckStored | null;
  omnibusRisk: OmnibusRiskStored | null;
  democraticBypass: DemocraticBypassStored;
};

function jsonField(value: object | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export async function computeActAudits(input: AuditInput): Promise<ActAuditPayload> {
  const articles = input.articles.map((article) => ({
    number: article.number,
    heading: article.heading,
    original: article.original,
  }));

  const matches = await detectLobbyMatches({ actId: input.id, articles });
  const best = matches.find((match) => match.hasHighSimilarity) ?? null;
  const lobbyCheck: LobbyCheckStored | null = best
    ? { similarity: best.similarityScore, source: `${best.organization} — ${best.memoTitle}` }
    : null;

  const alerts = scanActForOmnibusAlerts({
    actCode: input.code,
    preamble: input.preamble,
    mainMateria: input.materia,
    articles,
  });
  const top = alerts[0];
  const omnibusRisk: OmnibusRiskStored | null = top
    ? { article: `Art. ${top.articleNumber}`, description: top.reasoning }
    : null;

  const bypass = computeDemocraticBypass({
    actCode: input.code,
    decreeUrgencyLevel: input.urgency,
    isConfidenceVote: input.aula?.isConfidenceVote,
    confidenceVoteChamber: input.aula?.confidenceVoteChamber,
    actualDebateHours: input.aula?.actualDebateHours,
    amendmentsPresented: input.aula?.amendmentsPresented,
    amendmentsGuillotined: input.aula?.amendmentsGuillotined,
  });

  return {
    lobbyCheck,
    omnibusRisk,
    democraticBypass: {
      executiveDominanceScore: bypass.executiveDominanceScore,
      statusLevel: bypass.statusLevel,
      confidenceVotePlaced: bypass.confidenceVotePlaced,
      summaryDescription: bypass.summaryDescription,
    },
  };
}

export function auditUpdateData(payload: ActAuditPayload): Prisma.ActUpdateInput {
  return {
    lobbyCheck: jsonField(payload.lobbyCheck),
    omnibusRisk: jsonField(payload.omnibusRisk),
    democraticBypass: payload.democraticBypass as Prisma.InputJsonValue,
  };
}

/** Recompute and persist audits for an act already stored with its articles. */
export async function refreshActAudits(
  db: PrismaClient,
  actId: string,
  aula?: AulaFacts,
): Promise<ActAuditPayload | null> {
  const act = await db.act.findUnique({
    where: { id: actId },
    select: {
      id: true,
      code: true,
      materia: true,
      preamble: true,
      urgency: true,
      articles: { select: { number: true, heading: true, original: true }, orderBy: { orderIndex: 'asc' } },
    },
  });
  if (!act) return null;

  const payload = await computeActAudits({
    id: act.id,
    code: act.code,
    materia: act.materia,
    preamble: act.preamble,
    urgency: act.urgency,
    articles: act.articles,
    aula,
  });

  await db.act.update({
    where: { id: actId },
    data: auditUpdateData(payload),
  });

  return payload;
}
