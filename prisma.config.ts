import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { defineConfig } from 'prisma/config';

// Once a `prisma.config.ts` file is present, the Prisma CLI stops
// auto-loading `.env` (that behavior is now opt-in) - load it explicitly so
// `DATABASE_URL`/`DIRECT_URL` are still available to `prisma db push`,
// `prisma migrate`, and the seed script invoked through this config.
try {
  loadEnvFile(path.join(__dirname, '.env'));
} catch {
  // .env is optional locally (e.g. CI providing real env vars directly).
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx scripts/seed_acts.ts',
  },
});
