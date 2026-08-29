/**
 * PHASE 4 — Nightly incremental parliamentary ETL.
 *
 * 48-hour lookback over Camera SPARQL, Senato SPARQL + RSS, and Normattiva.
 * Shared clients live in `harvest_pipeline.ts`.
 *
 * Usage: npm run db:harvest
 */
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { PrismaClient } from '@prisma/client';
import {
  LOOKBACK_HOURS,
  REQUEST_TIMEOUT_MS,
  harvestRange,
  lookbackCutoff,
  todayIso,
} from './harvest_utils';
import {
  harvestCamera,
  harvestNormattiva,
  harvestSenato,
  harvestSenatoRss,
  logSourceResults,
  mergeHarvestActs,
  persistHarvestAct,
  sleep,
  POLITENESS_MS,
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

async function main(): Promise<void> {
  console.log('=== La Gazzetta Civica — PHASE 4 nightly parliamentary harvester ===');
  if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
    throw new Error('DATABASE_URL (or DIRECT_URL) is required');
  }

  const cutoff = lookbackCutoff();
  const range = harvestRange(cutoff.iso, todayIso());
  console.log(`Lookback: ${LOOKBACK_HOURS}h (${range.startIso} → ${range.endIso} / ${range.startYmd})`);
  console.log(`Request timeout: ${REQUEST_TIMEOUT_MS}ms · legislature: XIX\n`);

  console.log('1/4 Camera SPARQL (dati.camera.it)…');
  const camera = await harvestCamera(range);
  await sleep(POLITENESS_MS);

  console.log('2/4 Senato SPARQL (dati.senato.it, GET)…');
  const senato = await harvestSenato(range);
  await sleep(POLITENESS_MS);

  console.log('3/4 Senato RSS/XML (graceful skip on WAF)…');
  const rss = await harvestSenatoRss(range);
  await sleep(POLITENESS_MS);

  console.log('4/4 Normattiva OpenData (Gazzetta Ufficiale)…');
  const normattiva = await harvestNormattiva(range);

  const sources = [
    { name: 'camera', result: camera },
    { name: 'senato', result: senato },
    { name: 'rss', result: rss },
    { name: 'normattiva', result: normattiva },
  ];
  logSourceResults(sources);

  const acts = mergeHarvestActs(sources.map((source) => source.result));
  const pairs = acts.filter((act) => act.aliases.length > 0);
  if (pairs.length > 0) {
    console.log('\nCross-chamber aliases (AC ↔ AS) observed in official titles:');
    for (const act of pairs.slice(0, 20)) {
      console.log(`  ${act.code} → ${act.aliases.join(', ')}`);
    }
  }
  console.log(`\nDeduplicated harvest: ${acts.length} act(s). Upserting…\n`);

  let created = 0;
  let updated = 0;
  let errors = 0;
  for (const act of acts) {
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

  console.log('\n=== PHASE 4 harvest summary ===');
  console.log(`Created: ${created} · updated: ${updated} · errors: ${errors}`);
  if (acts.length > 0 && created + updated === 0) {
    throw new Error('Harvest produced acts but none could be persisted');
  }
}

main()
  .catch((error) => {
    console.error('Nightly harvest failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
