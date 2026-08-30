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

const PLACEHOLDER_SNIPPETS = [
  'non ancora acquisito',
  'analisi non generata',
  'in attesa di rigenerazione ai',
] as const;

const analyzedWhere: Prisma.ArticleWhereInput = {
  AND: [
    { exhaustiveAnalysis: { not: null } },
    { exhaustiveAnalysis: { not: '' } },
    ...PLACEHOLDER_SNIPPETS.map((snippet) => ({
      NOT: { exhaustiveAnalysis: { contains: snippet, mode: 'insensitive' as const } },
    })),
  ],
};

async function main(): Promise<void> {
  const [atti, articoli, analizzati] = await Promise.all([
    prisma.act.count(),
    prisma.article.count(),
    prisma.article.count({ where: analyzedWhere }),
  ]);

  console.log(`TOTALE ATTI NEL DATABASE: ${atti}`);
  console.log(`TOTALE ARTICOLI NEL DATABASE: ${articoli}`);
  console.log(`ARTICOLI GIÀ ANALIZZATI DALL'AI: ${analizzati}`);
  console.log(`ARTICOLI ANCORA DA ANALIZZARE: ${articoli - analizzati}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
