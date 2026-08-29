/**
 * SUBPHASE 2.3 — Democratic Bypass & Confidence Vote Analytics.
 *
 * Deterministic, local-only metrics of *procedural* executive dominance
 * in the Italian legislative process. The index is built exclusively from
 * verifiable Aula facts (questione di fiducia, hours of floor debate,
 * guillotined amendments, declared urgency) — never from the political
 * merit of the bill. A high score is a signal of compressed parliamentary
 * deliberation, not a judgement on the substance of the act.
 *
 * Weights (max 100):
 *   - Questione di fiducia:            +40, or +50 if both chambers
 *   - Debate contraction vs benchmark: up to +30
 *   - Guillotined / presented ratio:   up to +20
 *   - Fast-track / urgency (0–100):    up to +10
 */

export interface DemocraticBypassInput {
  actCode: string;
  isConfidenceVote?: boolean;
  confidenceVoteChamber?: 'Camera' | 'Senato' | 'Entrambe';
  amendmentsPresented?: number;
  amendmentsApproved?: number;
  amendmentsGuillotined?: number;
  actualDebateHours?: number;
  benchmarkDebateHours?: number;
  /** 0 to 100 — declared urgency / fast-tracking intensity. */
  decreeUrgencyLevel?: number;
}

export type DemocraticBypassStatus = 'ordinario' | 'accelerato' | 'bypass_elevato';

export interface DemocraticBypassMetrics {
  confidenceVotePlaced: boolean;
  confidenceVoteChamber?: string;
  guillotinedAmendmentsCount: number;
  actualDebateHours: number;
  historicalAverageDebateHours: number;
  /** Negative when floor debate is shorter than the historical benchmark (e.g. -65). */
  debateContractionPercentage: number;
  /** 0 = balanced parliamentary deliberation; 100 = complete executive bypass. */
  executiveDominanceScore: number;
  statusLevel: DemocraticBypassStatus;
  summaryDescription: string;
  factualIndicators: {
    label: string;
    value: string;
    impact: 'neutral' | 'warning' | 'alert';
  }[];
}

export type FactualIndicatorImpact = DemocraticBypassMetrics['factualIndicators'][number]['impact'];

/** Status cut-offs consumed by observatory views. */
export const BYPASS_STATUS_THRESHOLDS = {
  elevato: 65,
  accelerato: 35,
} as const;

export const BENCHMARK_DEBATE_HOURS = {
  decretoLegge: 48,
  disegnoDiLegge: 72,
  leggeBilancio: 120,
  decretoLegislativo: 24,
} as const;

const CONFIDENCE_POINTS_ONE_CHAMBER = 40;
const CONFIDENCE_POINTS_BOTH_CHAMBERS = 50;
const MAX_DEBATE_CONTRACTION_POINTS = 30;
const MAX_GUILLOTINE_POINTS = 20;
const MAX_URGENCY_POINTS = 10;

type BillKind = 'decreto_legge' | 'disegno_di_legge' | 'legge_bilancio' | 'decreto_legislativo';

// ---------------------------------------------------------------------------
// 1. BILL CLASSIFICATION & BENCHMARK HOURS
// ---------------------------------------------------------------------------

function foldCode(actCode: string): string {
  return (actCode ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classifies an act from its official code / short title. D.Lgs is matched
 * before D.L. so "D.Lgs. 285/1992" is never mistaken for a decreto-legge.
 */
export function classifyBillKind(actCode: string): BillKind {
  const code = foldCode(actCode);

  if (
    /legge di bilancio/.test(code) ||
    /legge finanziar/.test(code) ||
    /\bbilancio dello stato\b/.test(code) ||
    /\bfinanziar[ae]\b/.test(code)
  ) {
    return 'legge_bilancio';
  }

  if (
    /\bd\.?\s*lgs\.?\b/.test(code) ||
    /\bdlgs\b/.test(code) ||
    /\bdecreto legislativo\b/.test(code)
  ) {
    return 'decreto_legislativo';
  }

  if (
    /\bdecreto-?legge\b/.test(code) ||
    /\bd\.\s*l\.\s*\d/.test(code) ||
    /\bdl\s+\d/.test(code) ||
    /^dl\b/.test(code) ||
    /^d\.\s*l\.\b/.test(code)
  ) {
    return 'decreto_legge';
  }

  if (
    /\bddl\b/.test(code) ||
    /\ba\.?\s*c\.?\b/.test(code) ||
    /\ba\.?\s*s\.?\b/.test(code) ||
    /\bdisegno di legge\b/.test(code)
  ) {
    return 'disegno_di_legge';
  }

  return 'disegno_di_legge';
}

function benchmarkForKind(kind: BillKind): number {
  switch (kind) {
    case 'decreto_legge':
      return BENCHMARK_DEBATE_HOURS.decretoLegge;
    case 'legge_bilancio':
      return BENCHMARK_DEBATE_HOURS.leggeBilancio;
    case 'decreto_legislativo':
      return BENCHMARK_DEBATE_HOURS.decretoLegislativo;
    case 'disegno_di_legge':
      return BENCHMARK_DEBATE_HOURS.disegnoDiLegge;
  }
}

function billKindPhrase(kind: BillKind): string {
  switch (kind) {
    case 'decreto_legge':
      return 'dei decreti-legge';
    case 'legge_bilancio':
      return 'delle leggi di bilancio';
    case 'decreto_legislativo':
      return 'dei decreti legislativi';
    case 'disegno_di_legge':
      return 'dei disegni di legge';
  }
}

/**
 * Average benchmark floor-debate hours by bill type:
 * DL 48h, ordinary DDL/AC/AS (and ordinary L.) 72h,
 * leggi di bilancio/finanziarie 120h, D.Lgs 24h.
 */
export function getBenchmarkDebateHours(actCode: string): number {
  return benchmarkForKind(classifyBillKind(actCode));
}

// ---------------------------------------------------------------------------
// 2. NUMERIC HELPERS
// ---------------------------------------------------------------------------

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatIt(value: number, fractionDigits = 0): string {
  return value.toLocaleString('it-IT', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatHours(hours: number): string {
  const rounded = round1(hours);
  const digits = Number.isInteger(rounded) ? 0 : 1;
  return `${formatIt(rounded, digits)} h`;
}

function formatSignedPct(value: number): string {
  const rounded = round1(value);
  const digits = Number.isInteger(rounded) ? 0 : 1;
  const body = formatIt(Math.abs(rounded), digits);
  if (rounded > 0) return `+${body}%`;
  if (rounded < 0) return `−${body}%`;
  return '0%';
}

// ---------------------------------------------------------------------------
// 3. EXECUTIVE DOMINANCE SCORE
// ---------------------------------------------------------------------------

function resolveConfidence(input: DemocraticBypassInput): {
  placed: boolean;
  chamber?: DemocraticBypassInput['confidenceVoteChamber'];
} {
  const chamber = input.confidenceVoteChamber;
  const placed = input.isConfidenceVote === true || (input.isConfidenceVote !== false && chamber != null);
  return { placed, chamber: placed ? chamber : undefined };
}

function debateContractionRatio(actualHours: number, benchmarkHours: number): number {
  if (!(benchmarkHours > 0)) return 0;
  return clamp(1 - actualHours / benchmarkHours, 0, 1);
}

function guillotineRatio(presented: number, guillotined: number): number {
  if (presented > 0) return clamp(guillotined / presented, 0, 1);
  return 0;
}

/**
 * 0–100 index from verifiable procedural factors only.
 * Caps at both ends so missing fields never invent a bypass, and stacked
 * extras never exceed a complete-bypass reading.
 */
export function calculateExecutiveDominanceScore(input: DemocraticBypassInput): number {
  const kind = classifyBillKind(input.actCode);
  const benchmarkHours = Math.max(0, finiteOr(input.benchmarkDebateHours, benchmarkForKind(kind)));
  const actualHours = Math.max(0, finiteOr(input.actualDebateHours, benchmarkHours));
  const presented = Math.max(0, finiteOr(input.amendmentsPresented, 0));
  const guillotined = Math.max(0, finiteOr(input.amendmentsGuillotined, 0));
  const urgency = clamp(finiteOr(input.decreeUrgencyLevel, 0), 0, 100);
  const { placed, chamber } = resolveConfidence(input);

  let score = 0;

  if (placed) {
    score += chamber === 'Entrambe' ? CONFIDENCE_POINTS_BOTH_CHAMBERS : CONFIDENCE_POINTS_ONE_CHAMBER;
  }

  score += debateContractionRatio(actualHours, benchmarkHours) * MAX_DEBATE_CONTRACTION_POINTS;
  score += guillotineRatio(presented, guillotined) * MAX_GUILLOTINE_POINTS;
  score += (urgency / 100) * MAX_URGENCY_POINTS;

  return clamp(Math.round(score), 0, 100);
}

function statusFromScore(score: number): DemocraticBypassStatus {
  if (score >= BYPASS_STATUS_THRESHOLDS.elevato) return 'bypass_elevato';
  if (score >= BYPASS_STATUS_THRESHOLDS.accelerato) return 'accelerato';
  return 'ordinario';
}

// ---------------------------------------------------------------------------
// 4. NARRATIVE & INDICATORS
// ---------------------------------------------------------------------------

function chamberPhrase(chamber: DemocraticBypassInput['confidenceVoteChamber']): string {
  switch (chamber) {
    case 'Camera':
      return ' presso la Camera dei deputati';
    case 'Senato':
      return ' presso il Senato della Repubblica';
    case 'Entrambe':
      return ' presso entrambi i rami del Parlamento';
    default:
      return '';
  }
}

function statusLabel(status: DemocraticBypassStatus): string {
  switch (status) {
    case 'bypass_elevato':
      return 'Bypass elevato';
    case 'accelerato':
      return 'Iter accelerato';
    case 'ordinario':
      return 'Iter ordinario';
  }
}

function buildSummary(params: {
  kind: BillKind;
  placed: boolean;
  chamber?: DemocraticBypassInput['confidenceVoteChamber'];
  contractionPct: number;
  presented: number;
  guillotined: number;
}): string {
  const { kind, placed, chamber, contractionPct, presented, guillotined } = params;
  const typePhrase = billKindPhrase(kind);
  const absContraction = Math.abs(Math.round(contractionPct));
  const clauses: string[] = [];

  if (placed) {
    clauses.push(`Approvazione con ricorso alla questione di fiducia${chamberPhrase(chamber)}`);
  } else {
    clauses.push('Nessun ricorso alla questione di fiducia');
  }

  if (contractionPct <= -20) {
    clauses.push(
      `contrazione del ${absContraction}% del dibattito d’Aula rispetto alla media storica ${typePhrase}`,
    );
  } else if (contractionPct >= 20) {
    clauses.push(
      `dibattito d’Aula superiore del ${absContraction}% alla media storica ${typePhrase}`,
    );
  } else {
    clauses.push(`dibattito d’Aula in linea con la media storica ${typePhrase}`);
  }

  if (presented > 0 && guillotined > 0) {
    const share = Math.round(guillotineRatio(presented, guillotined) * 100);
    clauses.push(
      `${formatIt(guillotined)} emendamenti non posti in votazione (ghigliottina) su ${formatIt(presented)} presentati (${share}%)`,
    );
  }

  if (clauses.length === 0) return 'Parametri procedurali insufficienti per una sintesi.';

  const [first, ...rest] = clauses;
  if (rest.length === 0) return `${first}.`;
  return `${first} e ${rest.join('; ')}.`;
}

function buildIndicators(params: {
  placed: boolean;
  chamber?: DemocraticBypassInput['confidenceVoteChamber'];
  presented: number;
  approved: number;
  guillotined: number;
  actualHours: number;
  benchmarkHours: number;
  contractionPct: number;
  urgency: number;
  urgencyProvided: boolean;
  score: number;
  status: DemocraticBypassStatus;
}): DemocraticBypassMetrics['factualIndicators'] {
  const {
    placed,
    chamber,
    presented,
    approved,
    guillotined,
    actualHours,
    benchmarkHours,
    contractionPct,
    urgency,
    urgencyProvided,
    score,
    status,
  } = params;

  const guillotineShare = guillotineRatio(presented, guillotined);
  const contractionMagnitude = Math.abs(contractionPct);

  const fiduciaImpact: FactualIndicatorImpact = !placed
    ? 'neutral'
    : chamber === 'Entrambe'
      ? 'alert'
      : 'warning';

  const debateImpact: FactualIndicatorImpact =
    contractionPct <= -50 ? 'alert' : contractionPct <= -20 ? 'warning' : 'neutral';

  const guillotineImpact: FactualIndicatorImpact =
    guillotineShare >= 0.5 ? 'alert' : guillotineShare > 0 ? 'warning' : 'neutral';

  const scoreImpact: FactualIndicatorImpact =
    status === 'bypass_elevato' ? 'alert' : status === 'accelerato' ? 'warning' : 'neutral';

  const fiduciaValue = placed
    ? chamber
      ? `Sì — ${chamber}`
      : 'Sì'
    : 'No';

  const guillotineValue =
    presented > 0
      ? `${formatIt(guillotined)} / ${formatIt(presented)} (${formatIt(Math.round(guillotineShare * 100))}%)`
      : formatIt(guillotined);

  const indicators: DemocraticBypassMetrics['factualIndicators'] = [
    { label: 'Questione di fiducia', value: fiduciaValue, impact: fiduciaImpact },
    {
      label: 'Emendamenti ghigliottinati',
      value: guillotineValue,
      impact: guillotineImpact,
    },
    {
      label: 'Ore di dibattito d’Aula',
      value: `${formatHours(actualHours)} vs ${formatHours(benchmarkHours)} di benchmark`,
      impact: debateImpact,
    },
    {
      label: 'Contrazione del dibattito',
      value: formatSignedPct(contractionPct),
      impact: debateImpact,
    },
  ];

  if (approved > 0 || presented > 0) {
    indicators.push({
      label: 'Emendamenti approvati',
      value: presented > 0 ? `${formatIt(approved)} / ${formatIt(presented)}` : formatIt(approved),
      impact: 'neutral',
    });
  }

  if (urgencyProvided) {
    const urgencyImpact: FactualIndicatorImpact = urgency >= 70 ? 'alert' : urgency >= 40 ? 'warning' : 'neutral';
    indicators.push({
      label: 'Urgenza / fast-track',
      value: `${formatIt(Math.round(urgency))} / 100`,
      impact: urgencyImpact,
    });
  }

  indicators.push(
    {
      label: 'Indice di predominio esecutivo',
      value: `${formatIt(score)} / 100`,
      impact: scoreImpact,
    },
    {
      label: 'Livello procedurale',
      value: statusLabel(status),
      impact: scoreImpact,
    },
  );

  return indicators;
}

// ---------------------------------------------------------------------------
// 5. PUBLIC COMPOSERS
// ---------------------------------------------------------------------------

/**
 * Full per-act dossier: score, status band, non-partisan summary and
 * the indicator list the observatory UI can render as-is.
 */
export function computeDemocraticBypass(input: DemocraticBypassInput): DemocraticBypassMetrics {
  const kind = classifyBillKind(input.actCode);
  const historicalAverageDebateHours = Math.max(
    0,
    finiteOr(input.benchmarkDebateHours, benchmarkForKind(kind)),
  );
  const actualDebateHours = Math.max(0, finiteOr(input.actualDebateHours, historicalAverageDebateHours));
  const presented = Math.max(0, finiteOr(input.amendmentsPresented, 0));
  const approved = Math.max(0, finiteOr(input.amendmentsApproved, 0));
  const guillotinedAmendmentsCount = Math.max(0, finiteOr(input.amendmentsGuillotined, 0));
  const urgencyProvided = typeof input.decreeUrgencyLevel === 'number' && Number.isFinite(input.decreeUrgencyLevel);
  const urgency = clamp(finiteOr(input.decreeUrgencyLevel, 0), 0, 100);
  const { placed, chamber } = resolveConfidence(input);

  const debateContractionPercentage =
    historicalAverageDebateHours > 0
      ? round1(((actualDebateHours - historicalAverageDebateHours) / historicalAverageDebateHours) * 100)
      : 0;

  const executiveDominanceScore = calculateExecutiveDominanceScore(input);
  const statusLevel = statusFromScore(executiveDominanceScore);

  return {
    confidenceVotePlaced: placed,
    ...(chamber ? { confidenceVoteChamber: chamber } : {}),
    guillotinedAmendmentsCount,
    actualDebateHours: round1(actualDebateHours),
    historicalAverageDebateHours: round1(historicalAverageDebateHours),
    debateContractionPercentage,
    executiveDominanceScore,
    statusLevel,
    summaryDescription: buildSummary({
      kind,
      placed,
      chamber,
      contractionPct: debateContractionPercentage,
      presented,
      guillotined: guillotinedAmendmentsCount,
    }),
    factualIndicators: buildIndicators({
      placed,
      chamber,
      presented,
      approved,
      guillotined: guillotinedAmendmentsCount,
      actualHours: actualDebateHours,
      benchmarkHours: historicalAverageDebateHours,
      contractionPct: debateContractionPercentage,
      urgency,
      urgencyProvided,
      score: executiveDominanceScore,
      status: statusLevel,
    }),
  };
}

/** Batch helper for dashboard / observatory aggregations. */
export function batchComputeDemocraticBypass(inputs: DemocraticBypassInput[]): DemocraticBypassMetrics[] {
  return inputs.map(computeDemocraticBypass);
}
