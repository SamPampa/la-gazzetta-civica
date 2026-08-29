/**
 * SUBPHASE 3.2 — shared RAG types.
 *
 * Single source of truth for the shape returned by `app/api/rag/route.ts`
 * and stored (as `Json` columns) in `RagQueryCache` — imported by both the
 * route handler and any client component that renders a RAG answer, so the
 * two never drift out of sync.
 */

export interface RagCitation {
  index: number;
  actId: string;
  actCode: string;
  actTitle: string;
  articleNumber: string;
  snippetVerbatim: string;
  officialSourceUrl?: string;
}

export interface RagDeepGrounding {
  modifiedActCode: string;
  targetArticle: string;
  impactType: string;
  previousRuleSummary: string;
  newEffectSummary: string;
  officialSourceUrl?: string;
}

export interface RagResponse {
  query: string;
  answer: string;
  citations: RagCitation[];
  deepGrounding: RagDeepGrounding[];
  neutralBalance: {
    pros: string[];
    cons: string[];
  };
  isCached?: boolean;
}
