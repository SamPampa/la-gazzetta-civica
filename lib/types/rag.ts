/**
 * PHASE 3/4 — shared RAG types.
 *
 * Single source of truth for the shape returned by `app/api/rag/route.ts`
 * and stored (as `Json` columns) in `RagQueryCache` — imported by both the
 * route handler and any client component that renders a RAG answer, so the
 * two never drift out of sync.
 *
 * `citations` are the strictly-verified, numbered `[n]` sources grounding
 * the direct civic answer — pulled from the local Supabase corpus first,
 * and (per PHASE 4's proactive router) from a live, on-demand fetch against
 * Normattiva when the local corpus has nothing usable on the topic.
 * `extendedAnalysis` layers on a deeper, systemic dive: the historical
 * "foundation statute" grounding (`lib/taxonomy/legalThesaurus.ts` +
 * `lib/services/normattiva_resolver.ts`), a comparative before/after table,
 * and a neutral pros/cons dossier.
 */

export interface RagCitation {
  index: number;
  /** Only present when the citation is backed by a real local `Act` row
   * (so a "Vai alla scheda atto" link makes sense). Absent for norms
   * resolved on the fly straight from Normattiva/institutional portals —
   * those still carry `officialSourceUrl` to the authentic external page. */
  actId?: string;
  actCode: string;
  actTitle: string;
  articleNumber: string;
  snippetVerbatim: string;
  officialSourceUrl?: string;
  /** True when this citation was retrieved on demand from an official
   * external portal (Normattiva) rather than the local Supabase corpus —
   * the proactive fallback described in `app/api/rag/route.ts`. */
  isExternallyResolved?: boolean;
}

/** A historical "foundation statute" resolved on demand for the deep-dive
 * level — either already sitting in Supabase or fetched live from
 * Normattiva via `resolveHistoricalNorm`/`resolveMultipleHistoricalNorms`. */
export interface RetrievedHistoricalStatute {
  actCode: string;
  articleNumber: string;
  officialTitle: string;
  verbatimSnippet: string;
  sourceUrl: string;
  isLocallyCached: boolean;
  /** True when the resolver could only produce a clearly-labelled "servizio
   * non disponibile" notice (real act identity, but the live text couldn't
   * be fetched in time) — `verbatimSnippet` is that notice, not real law. */
  isUnavailableNotice: boolean;
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
