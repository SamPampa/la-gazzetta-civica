/**
 * PHASE 2 — API surface for `lib/services/normattiva_resolver.ts`.
 *
 * GET  /api/normattiva/resolve?actCode=...&articleNumber=...
 * POST /api/normattiva/resolve  { actCode: string; articleNumber?: string }
 *
 * Both accept the same two fields and return the same shape: 200 with a
 * `ResolvedHistoricalAct` JSON body when resolvable, 404 when `actCode`
 * doesn't identify any recognizable Italian legal act at all, 400 for a
 * missing/malformed `actCode`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { resolveHistoricalNorm } from '@/lib/services/normattiva_resolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleResolve(actCode: unknown, articleNumber: unknown): Promise<NextResponse> {
  if (typeof actCode !== 'string' || !actCode.trim()) {
    return NextResponse.json({ error: 'Missing required "actCode" string.' }, { status: 400 });
  }
  const normalizedArticleNumber = typeof articleNumber === 'string' && articleNumber.trim() ? articleNumber.trim() : undefined;

  try {
    const resolved = await resolveHistoricalNorm({ actCode: actCode.trim(), articleNumber: normalizedArticleNumber });
    if (!resolved) {
      return NextResponse.json(
        { error: `"${actCode}" does not identify a recognizable Italian legal act.` },
        { status: 404 },
      );
    }
    return NextResponse.json(resolved);
  } catch (error) {
    console.error('[api/normattiva/resolve] Unexpected resolver error:', error);
    return NextResponse.json({ error: 'Internal error while resolving the historical statute.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  return handleResolve(searchParams.get('actCode'), searchParams.get('articleNumber'));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const payload = (body ?? {}) as { actCode?: unknown; articleNumber?: unknown };
  return handleResolve(payload.actCode, payload.articleNumber);
}
