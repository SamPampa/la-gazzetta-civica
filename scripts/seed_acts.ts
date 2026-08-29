/**
 * Seeds Supabase Postgres with every act in `src/data/mockActs.ts`
 * (currently spanning 2000-2026, including the 2021-2026 legislative
 * window), inserting the full relational graph: `Article` rows per act,
 * `NormImpact` rows per article, and one deterministic `VoteBreakdown`
 * row per act.
 *
 * Idempotent: re-running upserts the `Act`/`VoteBreakdown` rows and fully
 * replaces each act's `Article` rows (which cascade-deletes their
 * `NormImpact` children), so the script can be run repeatedly (e.g. after
 * editing mockActs.ts) without ever duplicating data.
 *
 * Usage: npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import { refreshActAudits } from '../lib/services/audit_enrichment';
import { MOCK_ACTS, type Act, type LawArticle } from '../src/data/mockActs';

const prisma = new PrismaClient();

/** Deterministic pseudo-random generator seeded by act id, so re-running
 * the seed produces the exact same (plausible, but obviously synthetic)
 * vote breakdown every time instead of a fresh random split per run. */
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

function synthesizeVoteBreakdown(act: Act) {
  const rand = seededRandom(`vote:${act.id}`);
  // Weight the split loosely by urgency: higher-urgency government bills
  // tend to pass with a wider majority in this synthetic model; it's a
  // placeholder until real roll-call data is wired in.
  const favBias = 0.45 + (act.urgency / 100) * 0.25;
  const astenuti = Math.round(2 + rand() * 8); // 2-10%
  const remaining = 100 - astenuti;
  const favorevoli = Math.round(remaining * Math.min(0.9, Math.max(0.35, favBias + (rand() - 0.5) * 0.1)));
  const contrari = Math.max(0, remaining - favorevoli);

  const totalVotanti = 600; // rough size of a joint Camera+Senato roll call
  return {
    favorevoli: Math.round((favorevoli / 100) * totalVotanti),
    contrari: Math.round((contrari / 100) * totalVotanti),
    astenuti: Math.round((astenuti / 100) * totalVotanti),
    pctFav: favorevoli,
    pctCont: contrari,
    pctAst: astenuti,
  };
}

function articleCreateInput(article: LawArticle, orderIndex: number) {
  return {
    number: article.number,
    heading: article.heading,
    original: article.original,
    structured: article.structured,
    simple: article.simple,
    orderIndex,
    impacts: article.impact
      ? {
          create: [
            {
              modifiedActCode: article.impact.modifiedActCode,
              targetArticle: article.impact.targetArticle,
              impactType: article.impact.impactType,
              previousRuleSummary: article.impact.previousRuleSummary,
              newEffectSummary: article.impact.newEffectSummary,
              officialSourceUrl: article.impact.officialSourceUrl ?? null,
            },
          ],
        }
      : undefined,
  };
}

async function seedAct(act: Act) {
  await prisma.act.upsert({
    where: { id: act.id },
    update: {
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
      iniziativa: act.iniziativa,
      materia: act.materia,
      copertura: act.copertura,
      iterStatus: act.iterStatus,
      decreesMissing: act.decreesMissing,
      decreeDeadline: act.decreeDeadline,
      financialNote: act.financialNote,
      omnibusRisk: act.omnibusRisk ?? undefined,
      lobbyCheck: act.lobbyCheck ?? undefined,
      urgency: act.urgency,
      ministry: act.ministry,
      preamble: act.preamble,
    },
    create: {
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
      iniziativa: act.iniziativa,
      materia: act.materia,
      copertura: act.copertura,
      iterStatus: act.iterStatus,
      decreesMissing: act.decreesMissing,
      decreeDeadline: act.decreeDeadline,
      financialNote: act.financialNote,
      omnibusRisk: act.omnibusRisk ?? undefined,
      lobbyCheck: act.lobbyCheck ?? undefined,
      urgency: act.urgency,
      ministry: act.ministry,
      preamble: act.preamble,
    },
  });

  // Replace this act's articles wholesale rather than diffing them - simpler
  // and safe for a reference/mock dataset. `onDelete: Cascade` on
  // `NormImpact.article` means this also clears out stale impacts.
  await prisma.article.deleteMany({ where: { actId: act.id } });
  for (const [index, article] of act.articles.entries()) {
    await prisma.article.create({
      data: { actId: act.id, ...articleCreateInput(article, index) },
    });
  }

  const vote = synthesizeVoteBreakdown(act);
  await prisma.voteBreakdown.upsert({
    where: { actId: act.id },
    update: vote,
    create: { actId: act.id, ...vote },
  });

  await refreshActAudits(prisma, act.id);
}

async function main() {
  console.log(`Seeding ${MOCK_ACTS.length} acts into Supabase...`);

  let done = 0;
  for (const act of MOCK_ACTS) {
    await seedAct(act);
    done += 1;
    console.log(`  [${done}/${MOCK_ACTS.length}] ${act.code} — ${act.popularTitle}`);
  }

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
