/**
 * SUBPHASE 3.1 — Real-time Observatory metrics.
 *
 * GET /api/observatory
 *
 * Aggregates ministry delay, financial coverage, iter velocity and top
 * delayed acts from `lib/db/observatory.ts` (Supabase via Prisma, mock
 * catalog if the database is unreachable). CDN-cacheable for 60s.
 */
import { NextResponse } from 'next/server';
import { getObservatoryMetrics } from '@/lib/db/observatory';

export const runtime = 'nodejs';

const CACHE_CONTROL = 's-maxage=60, stale-while-revalidate=300';

export async function GET(): Promise<NextResponse> {
  try {
    const data = await getObservatoryMetrics();
    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': CACHE_CONTROL,
      },
    });
  } catch (error) {
    console.error('[api/observatory] Failed to compute observatory metrics:', error);
    return NextResponse.json(
      { error: 'Unable to compute observatory metrics.' },
      { status: 500 },
    );
  }
}
