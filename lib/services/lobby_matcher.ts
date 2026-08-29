/**
 * SUBPHASE 2.1 — Text Similarity & Lobby Matcher.
 *
 * Compares the authentic wording of parliamentary articles against
 * memorie depositate in audizione (hearing submissions) using a pair of
 * complementary string metrics:
 *
 *   1. Character- and word-n-gram Jaccard (robust to light paraphrase).
 *   2. Token-level longest-common-subsequence overlap (sensitive to
 *      copied legislative phrasing).
 *
 * Combined 60/40, the composite score is the same 0–1 scale the rest of
 * the app already uses for `Act.lobbyCheck.similarity`. Matches at or
 * above 0.85 are flagged as high-similarity — the civic-alert threshold
 * documented on `/trasparenza`. A high score is a textual overlap
 * signal, not a finding of illicit influence.
 */

export interface HearingMemo {
  id: string;
  actId: string;
  organizationName: string;
  documentTitle: string;
  submissionDate: string;
  sourcePdfUrl: string;
  /** Verbatim text proposed or requested in the official hearing memo. */
  textSnippet: string;
}

export interface LobbyMatchResult {
  hasHighSimilarity: boolean;
  similarityScore: number;
  percentage: number;
  organization: string;
  memoTitle: string;
  sourceUrl: string;
  matchedMemoText: string;
  articleNumber: string;
  highlightOverlap?: {
    overlapPercentage: number;
    identicalPhrases: string[];
  };
}

export type DetectLobbyMatchesOptions = {
  actId: string;
  articles: { number: string; original: string }[];
  depositedMemos?: HearingMemo[];
};

/** Civic-alert threshold used by ingest enrichment and `/trasparenza`. */
export const HIGH_SIMILARITY_THRESHOLD = 0.85;

const JACCARD_WEIGHT = 0.6;
const TOKEN_OVERLAP_WEIGHT = 0.4;
const DEFAULT_NGRAM = 3;
const MIN_IDENTICAL_PHRASE_TOKENS = 4;
const MAX_IDENTICAL_PHRASES = 8;

// ---------------------------------------------------------------------------
// 1. NORMALIZATION
// ---------------------------------------------------------------------------

/**
 * Lowercase, fold Italian diacritics, strip punctuation and collapse
 * whitespace so n-grams compare legislative wording rather than
 * typesetting. Apostrophes (l'articolo / l’articolo) are dropped so
 * elision does not split tokens.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[''`´‘’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized.split(' ');
}

// ---------------------------------------------------------------------------
// 2. N-GRAM JACCARD
// ---------------------------------------------------------------------------

function pushNgrams(target: Set<string>, items: string[], n: number, joiner: string): void {
  if (items.length === 0) return;
  if (items.length < n) {
    target.add(items.join(joiner));
    return;
  }
  for (let i = 0; i <= items.length - n; i++) {
    target.add(items.slice(i, i + n).join(joiner));
  }
}

function ngramUniverse(text: string, n: number): Set<string> {
  const normalized = normalizeText(text);
  const grams = new Set<string>();
  if (!normalized) return grams;

  pushNgrams(grams, [...normalized], n, '');
  pushNgrams(grams, normalized.split(' '), n, ' ');
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const gram of smaller) {
    if (larger.has(gram)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Jaccard index over the union of character n-grams and word n-grams
 * (default n = 3): J(A,B) = |A ∩ B| / |A ∪ B|.
 */
export function calculateNgramJaccardSimilarity(textA: string, textB: string, n = DEFAULT_NGRAM): number {
  const size = Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_NGRAM;
  return clamp01(jaccard(ngramUniverse(textA, size), ngramUniverse(textB, size)));
}

// ---------------------------------------------------------------------------
// 3. TOKEN-LEVEL SUBSEQUENCE OVERLAP
// ---------------------------------------------------------------------------

/** Space-optimized LCS length over token sequences. O(|A|·|B|) time. */
function longestCommonSubsequenceLength(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let prev = new Array<number>(short.length + 1).fill(0);
  let curr = new Array<number>(short.length + 1).fill(0);

  for (let i = 1; i <= long.length; i++) {
    for (let j = 1; j <= short.length; j++) {
      curr[j] = long[i - 1] === short[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
    curr.fill(0);
  }

  return prev[short.length];
}

/**
 * Dice-normalized longest-common-subsequence of tokens:
 * 2 · LCS(A,B) / (|A| + |B|). Captures copied legislative phrasing
 * even when a memo wraps the proposal in framing prose.
 */
export function calculateTokenOverlapScore(textA: string, textB: string): number {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const lcs = longestCommonSubsequenceLength(tokensA, tokensB);
  return clamp01((2 * lcs) / (tokensA.length + tokensB.length));
}

// ---------------------------------------------------------------------------
// 4. COMPOSITE SIMILARITY
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Robust 0–1 similarity: 60% n-gram Jaccard + 40% token subsequence
 * overlap. Empty inputs score 0 rather than 1, so a missing memo never
 * looks like a perfect match.
 */
export function calculateTextSimilarity(textA: string, textB: string): number {
  if (!textA.trim() || !textB.trim()) return 0;
  const jaccardScore = calculateNgramJaccardSimilarity(textA, textB);
  const tokenScore = calculateTokenOverlapScore(textA, textB);
  return round4(clamp01(JACCARD_WEIGHT * jaccardScore + TOKEN_OVERLAP_WEIGHT * tokenScore));
}

// ---------------------------------------------------------------------------
// 5. IDENTICAL-PHRASE HIGHLIGHTS
// ---------------------------------------------------------------------------

/**
 * Maximal contiguous token runs of length ≥ 4 that appear in both
 * texts, used by the UI to underline copied legislative language.
 */
function extractIdenticalPhrases(tokensA: string[], tokensB: string[]): string[] {
  if (tokensA.length === 0 || tokensB.length === 0) return [];

  const haystack = ` ${tokensB.join(' ')} `;
  const phrases: string[] = [];
  let i = 0;

  while (i < tokensA.length) {
    let bestLen = 0;
    const maxLen = tokensA.length - i;
    for (let len = maxLen; len >= MIN_IDENTICAL_PHRASE_TOKENS; len--) {
      const phrase = tokensA.slice(i, i + len).join(' ');
      if (haystack.includes(` ${phrase} `)) {
        bestLen = len;
        break;
      }
    }

    if (bestLen > 0) {
      phrases.push(tokensA.slice(i, i + bestLen).join(' '));
      i += bestLen;
    } else {
      i += 1;
    }
  }

  const unique = [...new Set(phrases)];
  unique.sort((a, b) => b.length - a.length || a.localeCompare(b, 'it'));
  return unique.slice(0, MAX_IDENTICAL_PHRASES);
}

function tokenSetOverlapPercentage(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const token of tokensB) counts.set(token, (counts.get(token) ?? 0) + 1);

  let intersection = 0;
  for (const token of tokensA) {
    const remaining = counts.get(token) ?? 0;
    if (remaining > 0) {
      intersection += 1;
      counts.set(token, remaining - 1);
    }
  }

  const denom = Math.min(tokensA.length, tokensB.length);
  return denom === 0 ? 0 : round4((intersection / denom) * 100);
}

function buildHighlightOverlap(articleText: string, memoText: string): LobbyMatchResult['highlightOverlap'] {
  const articleTokens = tokenize(articleText);
  const memoTokens = tokenize(memoText);
  const identicalPhrases = extractIdenticalPhrases(articleTokens, memoTokens);
  const overlapPercentage = tokenSetOverlapPercentage(articleTokens, memoTokens);
  if (identicalPhrases.length === 0 && overlapPercentage === 0) return undefined;
  return { overlapPercentage, identicalPhrases };
}

// ---------------------------------------------------------------------------
// 6. CURATED BASELINE MEMOS
// ---------------------------------------------------------------------------

/**
 * Realistic hearing submissions for the flagship acts in the mock
 * catalog. Operative sentences are close paraphrases / near-verbatim
 * lifts of the corresponding article so the matcher can surface the
 * same 85%+ alerts the UI already documents — without inventing a
 * causal link between the association and the enacted text.
 */
const BASELINE_HEARING_MEMOS: HearingMemo[] = [
  {
    id: 'memo-aniasa-legge-105-art3',
    actId: 'legge-105-2026',
    organizationName: 'ANIASA',
    documentTitle: 'Memoria ANIASA depositata in audizione, Commissione Trasporti, 12 marzo 2026',
    submissionDate: '2026-03-12',
    sourcePdfUrl: 'https://documenti.camera.it/leg19/resoconti/commissioni/bollettini/pdf/2026/03/12/aniasa-ddl-105.pdf',
    textSnippet:
      'Si propone di sostituire l’articolo 75 del codice della strada con il seguente: Art. 75 (Veicoli di mobilità personale). I veicoli di mobilità personale a propulsione prevalentemente elettrica, ivi compresi i monopattini, devono essere muniti di contrassegno identificativo e di copertura assicurativa per la responsabilità civile verso terzi. Con decreto del Ministro delle infrastrutture e dei trasporti, da adottare entro sessanta giorni dalla data di entrata in vigore della presente disposizione, di concerto con il Ministro dell’economia e delle finanze, sono definite le caratteristiche del contrassegno e le modalità di iscrizione in apposita anagrafe.',
  },
  {
    id: 'memo-confcommercio-legge-105-art1',
    actId: 'legge-105-2026',
    organizationName: 'Confcommercio',
    documentTitle: 'Memoria Confcommercio — micromobilità e circolazione, 8 marzo 2026',
    submissionDate: '2026-03-08',
    sourcePdfUrl: 'https://documenti.camera.it/leg19/resoconti/commissioni/bollettini/pdf/2026/03/08/confcommercio-ddl-105.pdf',
    textSnippet:
      'Si condivide l’obiettivo di rafforzare la sicurezza della circolazione stradale. Resta ferma la necessità di regole chiare per i veicoli di micromobilità, senza nuovi oneri per le imprese del commercio itinerante. Non si propone una formulazione articolata sostitutiva del testo all’esame.',
  },
  {
    id: 'memo-legambiente-legge-105-art5',
    actId: 'legge-105-2026',
    organizationName: 'Legambiente',
    documentTitle: 'Memoria Legambiente — estraneità della proroga autostradale, 10 marzo 2026',
    submissionDate: '2026-03-10',
    sourcePdfUrl: 'https://documenti.camera.it/leg19/resoconti/commissioni/bollettini/pdf/2026/03/10/legambiente-ddl-105.pdf',
    textSnippet:
      'Si chiede lo stralcio della proroga di ventiquattro mesi delle concessioni autostradali di interesse nazionale. La materia è estranea alla sicurezza stradale e alla disciplina dei veicoli di micromobilità. Eventuali riordini concessori vadano in un provvedimento ad hoc, con valutazione ambientale e di concorrenza.',
  },
  {
    id: 'memo-confindustria-dl-113-art2',
    actId: 'dl-113-2026',
    organizationName: 'Confindustria',
    documentTitle: 'Memoria Confindustria — credito d’imposta energivori e CIG, 18 luglio 2026',
    submissionDate: '2026-07-18',
    sourcePdfUrl: 'https://documenti.camera.it/leg19/resoconti/commissioni/bollettini/pdf/2026/07/18/confindustria-dl-113.pdf',
    textSnippet:
      'Si propone di incrementare di 420 milioni di euro per l’anno 2026 l’autorizzazione di spesa di cui all’articolo 44, comma 6-bis, del decreto legislativo 14 settembre 2015, n. 148. Alle imprese a forte consumo di energia elettrica, come definite dal decreto del Ministro dello sviluppo economico 21 dicembre 2017, è riconosciuto, per il secondo trimestre 2026, un credito d’imposta parametrato al costo medio della componente energia, nei limiti e con le modalità stabiliti con decreto del Ministro dell’economia e delle finanze.',
  },
  {
    id: 'memo-confcommercio-dl-113-art1',
    actId: 'dl-113-2026',
    organizationName: 'Confcommercio',
    documentTitle: 'Memoria Confcommercio — differimento IVA e IRAP, 16 luglio 2026',
    submissionDate: '2026-07-16',
    sourcePdfUrl: 'https://documenti.camera.it/leg19/resoconti/commissioni/bollettini/pdf/2026/07/16/confcommercio-dl-113.pdf',
    textSnippet:
      'Per i soggetti passivi con volume d’affari non superiore a 170.000 euro, i versamenti dell’imposta sul valore aggiunto e dell’imposta regionale sulle attività produttive relativi al terzo trimestre dell’anno 2026 sono effettuati entro il 16 dicembre 2026, senza applicazione di interessi e sanzioni. Restano fermi gli obblighi dichiarativi previsti dalla legislazione vigente.',
  },
  {
    id: 'memo-abi-dl-113-art4',
    actId: 'dl-113-2026',
    organizationName: 'Associazione Bancaria Italiana (ABI)',
    documentTitle: 'Memoria ABI — copertura e ricorso al mercato, 20 luglio 2026',
    submissionDate: '2026-07-20',
    sourcePdfUrl: 'https://documenti.camera.it/leg19/resoconti/commissioni/bollettini/pdf/2026/07/20/abi-dl-113.pdf',
    textSnippet:
      'L’ABI prende atto della copertura mediante incremento del ricorso al mercato finanziario. Si raccomanda che l’emissione di titoli di Stato resti coordinata con il calendario ordinario del debito, senza effetti collaterali sul credito alle imprese. Non si avanzano proposte di articolazione sostitutiva degli articoli 1 e 2.',
  },
  {
    id: 'memo-confindustria-ac-1760-art1',
    actId: 'ac-1760',
    organizationName: 'Confindustria',
    documentTitle: 'Memoria Confindustria — causali del contratto a termine, 4 luglio 2026',
    submissionDate: '2026-07-04',
    sourcePdfUrl: 'https://documenti.camera.it/leg19/resoconti/commissioni/bollettini/pdf/2026/07/04/confindustria-ac-1760.pdf',
    textSnippet:
      'Si chiede di mantenere la soglia a ventiquattro mesi. In subordine, all’articolo 19, comma 1, del decreto legislativo 15 giugno 2015, n. 81, le parole «ventiquattro mesi» siano sostituite dalle seguenti: «dodici mesi, ovvero ventiquattro mesi in presenza di esigenze temporanee e oggettive, estranee all’ordinaria attività, indicate in forma scritta a pena di conversione del rapporto in contratto a tempo indeterminato».',
  },
  {
    id: 'memo-confcommercio-ac-1760-art2',
    actId: 'ac-1760',
    organizationName: 'Confcommercio',
    documentTitle: 'Memoria Confcommercio — tetto alla somministrazione, 6 luglio 2026',
    submissionDate: '2026-07-06',
    sourcePdfUrl: 'https://documenti.camera.it/leg19/resoconti/commissioni/bollettini/pdf/2026/07/06/confcommercio-ac-1760.pdf',
    textSnippet:
      'La somministrazione di lavoro a tempo determinato non può eccedere, presso ciascun utilizzatore, il 20 per cento dei lavoratori a tempo indeterminato in forza. Il Ministro del lavoro e delle politiche sociali, con decreto da adottare entro trenta giorni, definisce i criteri di computo dell’organico.',
  },
  {
    id: 'memo-aiop-ac-2102-art3',
    actId: 'ac-2102',
    organizationName: 'AIOP',
    documentTitle: 'Memoria AIOP, audizione 21 luglio 2026',
    submissionDate: '2026-07-21',
    sourcePdfUrl: 'https://documenti.camera.it/leg19/resoconti/commissioni/bollettini/pdf/2026/07/21/aiop-ac-2102.pdf',
    textSnippet:
      'Decorsi i tempi massimi di attesa senza che la prestazione sia stata erogata, l’assistito ha diritto di ottenere la medesima prestazione presso una struttura privata, con onere a carico del servizio sanitario regionale, secondo i tariffe massime fissate con decreto del Ministro della salute. Le regioni che, per due trimestri consecutivi, non rispettano gli obiettivi di smaltimento delle liste di attesa decadono, per la quota parte, dall’accesso al fondo di cui all’articolo 4.',
  },
  {
    id: 'memo-utilitalia-ac-pop-44-art1',
    actId: 'ac-pop-44',
    organizationName: 'Utilitalia',
    documentTitle: 'Memoria Utilitalia, audizione 2 giugno 2026',
    submissionDate: '2026-06-02',
    sourcePdfUrl: 'https://documenti.camera.it/leg19/resoconti/commissioni/bollettini/pdf/2026/06/02/utilitalia-ac-pop-44.pdf',
    textSnippet:
      'Gli enti affidanti il servizio idrico integrato pubblicano il testo integrale dei contratti di concessione e dei relativi allegati tecnici e finanziari, in formato aperto e ricercabile, entro trenta giorni dalla sottoscrizione ovvero, per i rapporti in essere, entro novanta giorni dalla data di entrata in vigore della presente legge.',
  },
  {
    id: 'memo-ance-l-38-2023-art1',
    actId: 'legge-38-2023',
    organizationName: 'ANCE',
    documentTitle: 'Position paper ANCE, audizione 10 marzo 2023',
    submissionDate: '2023-03-10',
    sourcePdfUrl: 'https://documenti.camera.it/leg19/resoconti/commissioni/bollettini/pdf/2023/03/10/ance-l-38.pdf',
    textSnippet:
      'Per le spese sostenute a decorrere dal 1° gennaio 2023, l’aliquota della detrazione di cui all’articolo 119 del decreto-legge 19 maggio 2020, n. 34, è ridotta al 90 per cento.',
  },
];

// ---------------------------------------------------------------------------
// 7. MATCHER
// ---------------------------------------------------------------------------

function toMatchResult(
  articleNumber: string,
  articleText: string,
  memo: HearingMemo,
  similarityScore: number,
): LobbyMatchResult {
  return {
    hasHighSimilarity: similarityScore >= HIGH_SIMILARITY_THRESHOLD,
    similarityScore,
    percentage: Math.round(similarityScore * 100),
    organization: memo.organizationName,
    memoTitle: memo.documentTitle,
    sourceUrl: memo.sourcePdfUrl,
    matchedMemoText: memo.textSnippet,
    articleNumber,
    highlightOverlap: buildHighlightOverlap(articleText, memo.textSnippet),
  };
}

/**
 * Compare each article's authentic `original` text against deposited
 * hearing memos. When `depositedMemos` is omitted, the curated baseline
 * for this `actId` is used. Results are sorted by similarity descending.
 */
export async function detectLobbyMatches(options: DetectLobbyMatchesOptions): Promise<LobbyMatchResult[]> {
  const { actId, articles, depositedMemos } = options;
  const memos = depositedMemos ?? BASELINE_HEARING_MEMOS.filter((memo) => memo.actId === actId);

  if (articles.length === 0 || memos.length === 0) return [];

  const results: LobbyMatchResult[] = [];
  for (const article of articles) {
    for (const memo of memos) {
      const similarityScore = calculateTextSimilarity(article.original, memo.textSnippet);
      results.push(toMatchResult(article.number, article.original, memo, similarityScore));
    }
  }

  results.sort((a, b) => b.similarityScore - a.similarityScore || a.articleNumber.localeCompare(b.articleNumber, 'it'));
  return results;
}
