import { PrismaClient } from '@prisma/client';

// Next.js hot-reloads modules on every file save in dev, which would create
// a brand-new PrismaClient (and a brand-new connection pool against
// Supabase's pgbouncer) on every reload if we instantiated it at module
// scope directly. Caching the instance on `globalThis` survives module
// reloads within the same Node process, so dev keeps reusing one pool.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
