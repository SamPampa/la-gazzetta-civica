/**
 * 2-year backfill — Camera SPARQL, Senato SPARQL, Normattiva OpenData.
 *
 * Window: 2024-08-01 → today (August 2026), processed in 60-day SPARQL
 * slices so each query stays inside the 10s timeout / WAF budget.
 * Throttled slices retry with exponential backoff (1s, 2s, 4s) before
 * the worker moves on.
 *
 * Normattiva `ricerca/semplice` has no date filter (only `orderType:
 * recente` + `paginaCorrente`). Promulgated LEGGE / D.L. / D.Lgs. are
 * crawled once for the full window, then bucketed into the same 60-day
 * slices as Camera/Senato so progress still reads `[Month X/24]`.
 *
 * Usage:
 *   npm run db:backfill:2years
 *   npx tsx scripts/etl/backfill_2years.ts --dry-run
 *   npx tsx scripts/etl/backfill_2years.ts --max-slices=1 --newest-first
 */
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { PrismaClient } from '@prisma/client';
import {
  BACKFILL_START_ISO,
  REQUEST_TIMEOUT_MS,
  SLICE_DAYS,
  dateSlices,
  harvestRange,
  isIsoInClosedRange,
  monthProgress,
  todayIso,
  type DateSlice,
} from './harvest_utils';
import {
  harvestCamera,
  harvestNormattiva,
  harvestSenato,
  logSourceResults,
  mergeHarvestActs,
  persistHarvestAct,
  sleep,
  withExponentialBackoff,
  POLITENESS_MS,
  type HarvestAct,
  type SourceResult,
} from './harvest_pipeline';

try {
  loadEnvFile(path.join(__dirname, '..', '..', '.env'));
} catch {
  // CI injects env; local `.env` is optional.
}

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient(
  databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
);

type CliOptions = {
  dryRun: boolean;
  newestFirst: boolean;
  maxSlices: number | null;
  startIso: string;
  endIso: string;
};

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parseCli(): CliOptions {
  const maxRaw = argValue('max-slices');
  const maxSlices = maxRaw ? Number(maxRaw) : null;
  if (maxSlices !== null && (!Number.isFinite(maxSlices) || maxSlices < 1)) {
    throw new Error('--max-slices must be a positive integer');
  }
  return {
    dryRun: process.argv.includes('--dry-run'),
    newestFirst: process.argv.includes('--newest-first'),
    maxSlices,
    startIso: argValue('start') ?? BACKFILL_START_ISO,
    endIso: argValue('end') ?? todayIso(),
  };
}

function bucketNormattiva(acts: HarvestAct[], slice: DateSlice): HarvestAct[] {
  return acts.filter((act) => isIsoInClosedRange(act.publishedAt ?? act.date, slice.startIso, slice.endIso));
}

async function harvestSliceSparql(slice: DateSlice): Promise<{ camera: SourceResult; senato: SourceResult }> {
  try {
    const camera = await withExponentialBackoff(
      `slice ${slice.index}/${slice.total} Camera`,
      () => harvestCamera(slice),
      (result) => !result.ok,
    );
    await sleep(POLITENESS_MS);
    const senato = await withExponentialBackoff(
      `slice ${slice.index}/${slice.total} Senato`,
      () => harvestSenato(slice),
      (result) => !result.ok,
    );
    return { camera, senato };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[etl] slice ${slice.index} threw — ${reason} — continuing`);
    return {
      camera: { ok: false, acts: [], warning: reason },
      senato: { ok: false, acts: [], warning: reason },
    };
  }
}

async function persistActs(
  acts: HarvestAct[],
  dryRun: boolean,
): Promise<{ created: number; updated: number; errors: number }> {
  let created = 0;
  let updated = 0;
  let errors = 0;
  for (const act of acts) {
    if (dryRun) {
      console.log(`  (dry-run) ${act.code} (${act.source}, ${act.iterStatus})`);
      created += 1;
      continue;
    }
    try {
      const outcome = await persistHarvestAct(prisma, act);
      if (outcome === 'created') created += 1;
      else updated += 1;
      const aliasTag = act.aliases.length > 0 ? ` [${act.aliases.join(', ')}]` : '';
      console.log(`  ${act.code} (${act.source}, ${act.iterStatus}) — ${outcome}${aliasTag}`);
    } catch (error) {
      errors += 1;
      console.error(`  !! ${act.code}:`, error instanceof Error ? error.message.split('\n')[0] : error);
    }
  }
  return { created, updated, errors };
}

async function main(): Promise<void> {
  const cli = parseCli();
  console.log('=== La Gazzetta Civica — 2-year parliamentary backfill ===');
  if (!cli.dryRun && !process.env.DATABASE_URL && !process.env.DIRECT_URL) {
    throw new Error('DATABASE_URL (or DIRECT_URL) is required (or pass --dry-run)');
  }

  const window = harvestRange(cli.startIso, cli.endIso);
  if (window.endIso < window.startIso) {
    throw new Error(`Invalid window ${window.startIso} → ${window.endIso}`);
  }

  let slices = dateSlices(window.startIso, window.endIso, SLICE_DAYS);
  if (cli.newestFirst) slices = [...slices].reverse();
  if (cli.maxSlices) slices = slices.slice(0, cli.maxSlices);

  const months = monthProgress(window.endIso, window.startIso, window.endIso);
  console.log(`Window: ${window.startIso} → ${window.endIso} (${months.total} calendar months)`);
  console.log(`Slices: ${slices.length} × ${SLICE_DAYS}d${cli.newestFirst ? ' (newest first)' : ''}${cli.dryRun ? ' · DRY RUN' : ''}`);
  console.log(`Request timeout: ${REQUEST_TIMEOUT_MS}ms · legislature: XIX\n`);

  const guStart = slices.reduce((min, slice) => (slice.startIso < min ? slice.startIso : min), slices[0].startIso);
  const guEnd = slices.reduce((max, slice) => (slice.endIso > max ? slice.endIso : max), slices[0].endIso);
  const guRange = harvestRange(guStart, guEnd);

  console.log(`Normattiva OpenData — paginating recente for ${guRange.startIso} → ${guRange.endIso}…`);
  const normattivaFull = await withExponentialBackoff(
    'Normattiva window crawl',
    () => harvestNormattiva(guRange),
    (result) => !result.ok,
  );
  if (!normattivaFull.ok) {
    console.warn(`  ! normattiva: ${normattivaFull.warning ?? 'skipped'} — continuing with SPARQL slices`);
  } else {
    console.log(`  ✓ normattiva: ${normattivaFull.acts.length} promulgated LEGGE/D.L./D.Lgs. in window\n`);
  }

  let created = 0;
  let updated = 0;
  let errors = 0;
  let harvested = 0;

  for (const slice of slices) {
    const progress = monthProgress(slice.startIso, window.startIso, window.endIso);
    console.log(
      `[Month ${progress.month}/${progress.total}] Slice ${slice.index}/${slice.total} ${slice.startIso} → ${slice.endIso}`,
    );

    const { camera, senato } = await harvestSliceSparql(slice);
    const gu: SourceResult = {
      ok: normattivaFull.ok,
      acts: bucketNormattiva(normattivaFull.acts, slice),
      warning: normattivaFull.warning,
    };
    logSourceResults([
      { name: 'camera', result: camera },
      { name: 'senato', result: senato },
      { name: 'normattiva', result: gu },
    ]);

    const acts = mergeHarvestActs([camera, senato, gu]);
    harvested += acts.length;
    console.log(`[Month ${progress.month}/${progress.total}] Harvested ${acts.length} acts (${harvested} cumulative)…`);

    const persisted = await persistActs(acts, cli.dryRun);
    created += persisted.created;
    updated += persisted.updated;
    errors += persisted.errors;
    await sleep(POLITENESS_MS);
  }

  console.log('\n=== 2-year backfill summary ===');
  console.log(`Slices: ${slices.length} · harvested: ${harvested}`);
  console.log(
    cli.dryRun
      ? `Dry-run listed: ${created} · errors: ${errors}`
      : `Created: ${created} · updated: ${updated} · errors: ${errors}`,
  );
  if (!cli.dryRun && harvested > 0 && created + updated === 0) {
    throw new Error('Backfill produced acts but none could be persisted');
  }
}

main()
  .catch((error) => {
    console.error('2-year backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
