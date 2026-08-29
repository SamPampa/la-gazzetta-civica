/**
 * PHASE 3 — shared RAG types.
 *
 * Single source of truth for the shape returned by `app/api/rag/route.ts`
 * and stored (as `Json` columns) in `RagQueryCache` — imported by both the
 * route handler and any client component that renders a RAG answer, so the
 * two never drift out of sync.
 *
 * The response is split into two stages, mirroring the route's own
 * pipeline: `citations` are the strictly-verified, numbered `[n]` sources
 * pulled straight from the 1,267-article Supabase corpus (Stage 1), while
 * `extendedAnalysis` layers on the dynamically-resolved historical
 * "foundation statute" grounding (Stage 2 — `lib/taxonomy/legalThesaurus.ts`
 * + `lib/services/normattiva_resolver.ts`).
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

/** A historical "foundation statute" resolved on demand for Stage 2 —
 * either already sitting in Supabase or fetched live from Normattiva via
 * `resolveHistoricalNorm`/`resolveMultipleHistoricalNorms`. */
export interface RetrievedHistoricalStatute {
  actCode: string;
  articleNumber: string;
  officialTitle: string;
  verbatimSnippet: string;
  sourceUrl: string;
  isLocallyCached: boolean;
}

export interface ComparativeDeepGrounding {
  modifiedActCode: string;
  targetArticle: string;
  impactType: string;
  previousRuleSummary: string;
  newEffectSummary: string;
  officialSourceUrl?: string;
}

export interface ExtendedHistoricalAnalysis {
  /** Narrative explaining the systemic evolution over recent decades. */
  historicalContext: string;
  retrievedHistoricalStatutes: RetrievedHistoricalStatute[];
  comparativeTable: ComparativeDeepGrounding[];
  neutralTechnicalDossier: {
    /** Declared public policy aims from official dossiers. */
    pros: string[];
    /** Operational bottlenecks, financial invariance constraints. */
    cons: string[];
  };
}

export interface RagResponse {
  query: string;
  /** Direct civic answer containing strictly verified [1], [2] citation badges. */
  answer: string;
  citations: RagCitation[];
  extendedAnalysis: ExtendedHistoricalAnalysis;
  isCached?: boolean;
}
