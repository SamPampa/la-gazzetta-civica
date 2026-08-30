import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { Prisma, PrismaClient } from '@prisma/client';

try {
  loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // env già presente in CI
}

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient(
  databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
);

function num(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  return Number(value ?? 0);
}

async function main(): Promise<void> {
  const [perAct] = await prisma.$queryRaw<
    [{ acts_one: unknown; acts_many: unknown; articles_in_many: unknown }]
  >(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE n = 1) AS acts_one,
      COUNT(*) FILTER (WHERE n > 1) AS acts_many,
      COALESCE(SUM(n) FILTER (WHERE n > 1), 0) AS articles_in_many
    FROM (
      SELECT "actId", COUNT(*)::int AS n
      FROM "Article"
      GROUP BY "actId"
    ) t
  `);

  const [corpus] = await prisma.$queryRaw<[{ real_text: unknown; placeholder: unknown }]>(
    Prisma.sql`
      SELECT
        COUNT(*) FILTER (
          WHERE char_length(original) > 150
            AND original NOT ILIKE '%non ancora acquisito%'
            AND original NOT ILIKE '%fase di ingestion%'
        ) AS real_text,
        COUNT(*) FILTER (
          WHERE char_length(original) <= 150
            OR original ILIKE '%non ancora acquisito%'
            OR original ILIKE '%fase di ingestion%'
        ) AS placeholder
      FROM "Article"
    `,
  );

  console.log(`ATTI CON ESATTAMENTE 1 ARTICOLO: ${num(perAct.acts_one)}`);
  console.log(`ATTI CON PIÙ DI 1 ARTICOLO: ${num(perAct.acts_many)}`);
  console.log(`ARTICOLI IN ATTI CON PIÙ DI 1 ARTICOLO: ${num(perAct.articles_in_many)}`);
  console.log(`ARTICOLI CON TESTO ORIGINALE REALE: ${num(corpus.real_text)}`);
  console.log(`ARTICOLI SCHEDA SEGNAPOSTO: ${num(corpus.placeholder)}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
