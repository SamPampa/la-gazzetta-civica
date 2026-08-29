/**
 * Backfill lobby / omnibus / bypass JSON on acts already in Supabase.
 * Usage: npm run db:enrich:audits
 *
 * Uses DIRECT_URL (session mode) when available so a long sequential run
 * is not dropped by the transaction-mode pooler.
 */
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { PrismaClient } from '@prisma/client';
import { refreshActAudits } from '../lib/services/audit_enrichment';

try {
  loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // CI / already-exported env.
}

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient(
  databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enrichOne(id: string, attempts = 3): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await refreshActAudits(prisma, id);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(750 * attempt);
    }
  }
  throw lastError;
}

async function main() {
  const force = process.argv.includes('--force');
  const acts = await prisma.act.findMany({
    select: { id: true, code: true, democraticBypass: true },
    orderBy: { code: 'asc' },
  });
  const pending = force ? acts : acts.filter((act) => act.democraticBypass == null);

  console.log(
    force
      ? `Recomputing audits for all ${pending.length} acts...\n`
      : `Recomputing audits for ${pending.length} acts missing bypass JSON (${acts.length} total)...\n`,
  );

  let done = 0;
  let errors = 0;
  for (const act of pending) {
    try {
      await enrichOne(act.id);
      done += 1;
      console.log(`  [${done}/${pending.length}] ${act.code}`);
    } catch (error) {
      errors += 1;
      console.error(`  !! ${act.code}:`, error instanceof Error ? error.message.split('\n')[0] : error);
    }
  }

  console.log(`\nDone. Updated ${done}, errors ${errors}.`);
  if (errors > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('Audit enrichment failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
