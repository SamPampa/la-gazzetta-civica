/**
 * Database diagnostic — AI enrichment coverage for every Act/Article.
 *
 * An article is fully enriched when `exhaustiveAnalysis` is present and is
 * not an honesty placeholder (ingestion "testo non ancora acquisito" or the
 * enricher's "Analisi non generata" scope note). Heuristic Gemini-fallback
 * prose counts as enriched: it is extractive, not a placeholder.
 *
 * Usage: npx tsx scripts/check_enrichment_status.ts
 */
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { PrismaClient } from '@prisma/client';
import { PLACEHOLDER_ARTICLE_PATTERN } from './etl/harvest_utils';

try {
  loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // CI injects env; local `.env` is optional.
}

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient(
  databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
);

/** Matches enricher scope notes and ingestion honesty placeholders. */
const ENRICHMENT_PLACEHOLDER_PATTERN = new RegExp(
  `${PLACEHOLDER_ARTICLE_PATTERN.source}|analisi non generata|in attesa di rigenerazione ai`,
  'i',
);

export function isArticleEnriched(exhaustiveAnalysis: string | null | undefined): boolean {
  if (exhaustiveAnalysis == null) return false;
  const text = exhaustiveAnalysis.trim();
  if (text.length === 0) return false;
  return !ENRICHMENT_PLACEHOLDER_PATTERN.test(text);
}

type ActRow = {
  code: string;
  title: string;
  total: number;
  enriched: number;
  pending: number;
  pendingPct: number;
};

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return 'n/a';
  return `${value.toFixed(1)}%`;
}

function pad(value: string, width: number, align: 'left' | 'right' = 'left'): string {
  if (value.length >= width) return value;
  const gap = ' '.repeat(width - value.length);
  return align === 'right' ? gap + value : value + gap;
}

function printTable(rows: ActRow[]): void {
  const rankW = Math.max(4, String(rows.length).length + 2);
  const codeW = Math.max(10, ...rows.map((row) => row.code.length));
  const fracW = Math.max(
    22,
    ...rows.map((row) => `${row.pending} / ${row.total}`.length),
  );
  const pctW = 10;

  const header =
    pad('[Rank]', rankW) +
    '  ' +
    pad('[Act Code]', codeW) +
    '  ' +
    pad('[Pending / Total Articles]', fracW) +
    '  ' +
    pad('[Pending %]', pctW) +
    '  [Act Popular/Formal Title]';

  console.log(header);
  console.log('-'.repeat(Math.min(120, header.length + 40)));

  rows.forEach((row, index) => {
    const rank = String(index + 1);
    const frac = `${row.pending} / ${row.total}`;
    console.log(
      pad(rank, rankW, 'right') +
        '  ' +
        pad(row.code, codeW) +
        '  ' +
        pad(frac, fracW, 'right') +
        '  ' +
        pad(formatPct(row.pendingPct), pctW, 'right') +
        '  ' +
        row.title,
    );
  });
}

async function main(): Promise<void> {
  console.log('=== La Gazzetta Civica — AI enrichment diagnostic ===\n');
  if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
    throw new Error('DATABASE_URL (or DIRECT_URL) is required');
  }

  const [actCount, articles] = await Promise.all([
    prisma.act.count(),
    prisma.article.findMany({
      select: {
        exhaustiveAnalysis: true,
        act: { select: { code: true, popularTitle: true, formalTitle: true } },
      },
    }),
  ]);

  const articleCount = articles.length;
  let enrichedCount = 0;
  const byAct = new Map<
    string,
    { title: string; total: number; enriched: number }
  >();

  for (const article of articles) {
    const enriched = isArticleEnriched(article.exhaustiveAnalysis);
    if (enriched) enrichedCount += 1;

    const existing = byAct.get(article.act.code);
    if (!existing) {
      byAct.set(article.act.code, {
        title: article.act.popularTitle?.trim() || article.act.formalTitle,
        total: 1,
        enriched: enriched ? 1 : 0,
      });
    } else {
      existing.total += 1;
      if (enriched) existing.enriched += 1;
    }
  }

  const pendingCount = articleCount - enrichedCount;
  const enrichmentPct = articleCount === 0 ? 100 : (enrichedCount / articleCount) * 100;

  console.log('1. GLOBAL METRICS');
  console.log(`   Total acts:                          ${actCount}`);
  console.log(`   Total articles:                      ${articleCount}`);
  console.log(`   Articles fully enriched (AI/heuristic, non-placeholder): ${enrichedCount}`);
  console.log(`   Articles pending enrichment:         ${pendingCount}`);
  console.log(`   Overall platform enrichment:         ${formatPct(enrichmentPct)}`);
  console.log('');

  const pendingActs: ActRow[] = [...byAct.entries()]
    .map(([code, stats]) => {
      const pending = stats.total - stats.enriched;
      return {
        code,
        title: stats.title,
        total: stats.total,
        enriched: stats.enriched,
        pending,
        pendingPct: stats.total === 0 ? 0 : (pending / stats.total) * 100,
      };
    })
    .filter((row) => row.pending > 0)
    .sort((a, b) => {
      if (b.pendingPct !== a.pendingPct) return b.pendingPct - a.pendingPct;
      if (b.pending !== a.pending) return b.pending - a.pending;
      return a.code.localeCompare(b.code, 'it');
    });

  console.log('2. ACTS WITH PENDING ENRICHMENT');
  if (pendingActs.length === 0) {
    console.log('   (none)');
  } else {
    console.log(`   ${pendingActs.length} act(s) with at least one pending article, ordered by pending %.\n`);
    printTable(pendingActs);
  }

  console.log('\n3. SUMMARY');
  if (pendingCount === 0) {
    console.log('   All articles in the database are fully enriched!');
  } else {
    console.log(`   ${pendingCount} article(s) still pending. Resume enrichment with:`);
    console.log('   npm run db:enrich:ai');
  }
}

main()
  .catch((error) => {
    console.error('Enrichment diagnostic failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
