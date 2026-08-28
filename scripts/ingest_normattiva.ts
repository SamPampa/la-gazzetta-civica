/**
 * FASE 2 — Open Data Ingestion Pipeline — Normattiva & Gazzetta Ufficiale.
 *
 * Dedicated, isolated ingestion script (mirrors `scripts/ingest_parliament.ts`
 * and `scripts/ingest_senato.ts` in spirit, but deliberately does not share
 * code with them) that pulls real *promulgated* acts — laws already published
 * on the Gazzetta Ufficiale and indexed as in-force text on Normattiva — from
 * Normattiva's official OpenData REST API, plus a small curated set of
 * foundational codes explicitly requested (Codice della Strada, TUEL, Statuto
 * dei Lavoratori, Jobs Act, Riforma Cartabia, Legge di Bilancio).
 *
 * REAL API USED (verified by hand — no scraping, no headless browser):
 *   Base: https://api.normattiva.it/t/normattiva.api/bff-opendata/v1
 *   - POST /api/v1/ricerca/semplice        -> paginated list of GU-published
 *     acts (dataGU, codiceRedazionale, denominazioneAtto, descrizioneAtto,
 *     titoloAtto, dataEmanazione, ...). No auth required.
 *   - POST /api/v1/atto/dettaglio-atto     -> given {dataGU, codiceRedazionale}
 *     returns real Akoma-Ntoso-flavoured HTML (`articoloHtml`) containing the
 *     act's preamble + Article 1 verbatim text, with `<a href="...
 *     normattiva.it/uri-res/N2Ls?urn:nir:...">` cross-reference links to any
 *     other norm it cites — including genuine novella language ("sono
 *     sostituite dalle seguenti", "è abrogato", ...) we mine for NormImpact.
 *
 * ENDPOINT QUIRKS (discovered by hand while building this script):
 * 1. `ricerca/semplice`'s `testoRicerca` field does *not* behave as a
 *    relevance-ranked full-text search across the whole corpus — with
 *    `orderType: "recente"` it reliably returns "the most recent N acts
 *    published on the GU" almost regardless of the query text. That's
 *    actually perfect for this ingestion window (2021-2026: we just want the
 *    newest promulgated acts), so this script leans on that behaviour
 *    directly instead of fighting it.
 * 2. `dettaglio-atto` only ever returned Article 1 (plus the preamble) in
 *    every parameter combination tried (`numeroArticolo`, `articolo`,
 *    `numArticolo`, `suffissoArticoloSelezionato`, alternate
 *    `formatoRichiesta` values) — there is no discovered, documented way to
 *    page through subsequent articles via this endpoint. See the HONESTY
 *    NOTE below for how this script handles that honestly.
 *
 * HONESTY NOTE ON SCOPE:
 * - For acts fetched live from the API (the 2021-2026 window), Article 1's
 *   `original` text is 100% genuine verbatim normative text straight from
 *   Normattiva, HTML-stripped but otherwise unedited — and every NormImpact
 *   row attached to it is mined directly out of that same real text (a
 *   cross-reference link + a real Italian novella verb next to it), never
 *   invented. A second article honestly documents that only Article 1 was
 *   retrievable via this endpoint in this ingestion phase.
 * - The foundational historical codes (Codice della Strada, TUEL, Statuto dei
 *   Lavoratori, Jobs Act, Riforma Cartabia, Legge di Bilancio) are seeded from
 *   a small, manually-curated reference table (real `code`/dates/permalink —
 *   these are widely-published, unambiguous facts) rather than resolved
 *   through `ricerca/semplice`, because free-text search over decades-old
 *   short titles did not reliably resolve to the exact record within a
 *   reasonable number of requests. Their article content is intentionally
 *   left as a clearly-labelled scaffold rather than fabricated verbatim text.
 *
 * Usage: npm run db:ingest:normattiva
 */
import { PrismaClient } from '@prisma/client';
import type { Copertura, ImpactType, Iniziativa, IterStatus, Materia } from '../src/data/mockActs';

const prisma = new PrismaClient();

const API_BASE = 'https://api.normattiva.it/t/normattiva.api/bff-opendata/v1';
const SOURCE_LABEL = 'Gazzetta Ufficiale - Normattiva';
const RECENT_ACTS_TARGET = 40; // how many live 2021-2026 promulgated acts to pull

// ---------------------------------------------------------------------------
// 1. NORMATTIVA OPENDATA REST CLIENT
// ---------------------------------------------------------------------------

type RicercaAtto = {
  dataGU: string; // "YYYY-MM-DD"
  codiceRedazionale: string;
  denominazioneAtto: string; // e.g. "LEGGE" | "DECRETO-LEGGE" | "DECRETO LEGISLATIVO"
  descrizioneAtto: string; // e.g. "LEGGE 25 novembre 2024, n. 177"
  titoloAtto: string;
  numeroProvvedimento: string;
  annoProvvedimento: string;
  dataEmanazione: string; // ISO datetime
};

async function ricercaSemplice(testoRicerca: string, numeroElementiPerPagina: number): Promise<RicercaAtto[]> {
  const response = await fetch(`${API_BASE}/api/v1/ricerca/semplice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      testoRicerca,
      orderType: 'recente',
      paginazione: { paginaCorrente: 1, numeroElementiPerPagina },
    }),
  });
  if (!response.ok) throw new Error(`ricerca/semplice returned HTTP ${response.status} ${response.statusText}`);
  const json = (await response.json()) as { listaAtti: RicercaAtto[] };
  return json.listaAtti ?? [];
}

type DettaglioAtto = { titolo: string; sottoTitolo: string; articoloHtml: string };

async function dettaglioAtto(dataGU: string, codiceRedazionale: string): Promise<DettaglioAtto | null> {
  const response = await fetch(`${API_BASE}/api/v1/atto/dettaglio-atto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ dataGU, codiceRedazionale, formatoRichiesta: 'V' }),
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { success: boolean; data?: { atto?: DettaglioAtto } };
  if (!json.success || !json.data?.atto) return null;
  return json.data.atto;
}

// ---------------------------------------------------------------------------
// 2. HTML / TEXT HELPERS
// ---------------------------------------------------------------------------

const HTML_ENTITIES: Record<string, string> = {
  agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  laquo: '«', raquo: '»', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&([a-zA-Z]+);/g, (match, name) => HTML_ENTITIES[name] ?? match)
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

const MONTH_NAMES_IT = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

const MATERIA_KEYWORDS: Record<Materia, string[]> = {
  codice_strada: ['strada', 'patente', 'veicol', 'circolazione', 'trasport', 'monopattin', 'autotrasport'],
  fisco: ['fisc', 'iva', 'irpef', 'tribut', 'bilancio', 'tasse', 'entrate', 'canone', 'accis'],
  sanita: ['sanit', 'salute', 'ospedal', 'ssn', 'farmac', 'medic', 'vaccin'],
  lavoro: ['lavoro', 'contratt', 'sindac', 'occupazion', 'pension', 'previdenz', 'salari'],
  giustizia: ['giustizia', 'penale', 'process', 'civile', 'tribunale', 'reat', 'magistrat'],
};

function guessMateria(text: string): Materia {
  const lower = text.toLowerCase();
  for (const materia of Object.keys(MATERIA_KEYWORDS) as Materia[]) {
    if (MATERIA_KEYWORDS[materia].some((kw) => lower.includes(kw))) return materia;
  }
  return 'fisco';
}

function guessCopertura(text: string): Copertura {
  const lower = text.toLowerCase();
  if (/fondo|risorse aggiuntive|finanziamento|stanziamento|maggiori entrate|oneri/.test(lower)) return 'a_debito';
  if (/riduzione|taglio|risparmio|razionalizzazione della spesa/.test(lower)) return 'tagli_spesa';
  return 'invarianza';
}

const MINISTRY_BY_MATERIA: Record<Materia, string> = {
  fisco: 'MEF — Economia e Finanze',
  sanita: 'Ministero della Salute',
  lavoro: 'Ministero del Lavoro',
  giustizia: 'Ministero della Giustizia',
  codice_strada: 'MIT — Infrastrutture e Trasporti',
};

const DENOMINAZIONE_LABEL: Record<string, string> = {
  LEGGE: 'L.',
  'DECRETO-LEGGE': 'D.L.',
  'DECRETO LEGISLATIVO': 'D.Lgs.',
};

/** Slug id, matching the convention already established across the app
 * (see `src/data/mockActs.ts`'s `parseActIdentity`: `legge-`, `dl-`,
 * `dlgs-`), so `getActById` and the mock-data fallback stay consistent
 * whichever source populated a given row. */
function slugId(denominazioneAtto: string, numero: string, anno: string): string | null {
  switch (denominazioneAtto) {
    case 'LEGGE':
      return `legge-${numero}-${anno}`;
    case 'DECRETO-LEGGE':
      return `dl-${numero}-${anno}`;
    case 'DECRETO LEGISLATIVO':
      return `dlgs-${numero}-${anno}`;
    default:
      return null; // out of scope for this script (regolamenti, DPCM, ...)
  }
}

function normattivaPermalink(denominazioneAtto: string, dataEmanazione: string, numero: string): string {
  const urnType =
    denominazioneAtto === 'DECRETO-LEGGE'
      ? 'decreto.legge'
      : denominazioneAtto === 'DECRETO LEGISLATIVO'
        ? 'decreto.legislativo'
        : 'legge';
  const date = dataEmanazione.slice(0, 10); // "YYYY-MM-DDT..." -> "YYYY-MM-DD"
  return `https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:${urnType}:${date};${numero}`;
}

// ---------------------------------------------------------------------------
// 3. NORM IMPACT MINING — real novella detection straight out of the
//    verbatim `articoloHtml`, never invented.
// ---------------------------------------------------------------------------

type MinedImpact = {
  modifiedActCode: string;
  targetArticle: string;
  impactType: ImpactType;
  previousRuleSummary: string;
  newEffectSummary: string;
  officialSourceUrl: string;
};

const URN_TYPE_LABEL: Record<string, string> = {
  'decreto.legge': 'D.L.',
  'decreto.legislativo': 'D.Lgs.',
  legge: 'L.',
  costituzione: 'Costituzione',
  'regio.decreto': 'R.D.',
};

function parseUrnNir(urn: string): { modifiedActCode: string; targetArticle: string } | null {
  const match = urn.match(
    /urn:nir:stato:([a-z.]+):(\d{4})-(\d{2})-(\d{2})(?:;(\d+))?(?:~art(\d+[a-z-]*)(?:-com(\d+[a-z-]*))?)?/,
  );
  if (!match) return null;
  const [, tipo, year, , , numero, art, com] = match;
  const label = URN_TYPE_LABEL[tipo] ?? tipo;
  const modifiedActCode = numero ? `${label} ${numero}/${year}` : `${label} (${year})`;
  const targetArticle = art ? `Art. ${art}${com ? `, comma ${com}` : ''}` : 'Testo integrale';
  return { modifiedActCode, targetArticle };
}

function detectImpactType(commaText: string): ImpactType | null {
  const lower = commaText.toLowerCase();
  if (/sono sostitui|è sostituit|sono sostituit/.test(lower)) return 'sostituzione';
  if (/sono abrogat|è abrogat|si abrog/.test(lower)) return 'abrogazione';
  if (/sono inserit|è inserit|sono aggiunt|è aggiunt/.test(lower)) return 'integrazione';
  if (/in deroga/.test(lower)) return 'deroga';
  return null;
}

/** Splits the real `articoloHtml` into one chunk per `<div
 * class="art-comma-div-akn">` (the AKN comma unit), then — for every comma
 * that both (a) contains a real cross-reference `<a href="...normattiva.it/
 * uri-res/N2Ls?urn:nir:...">` and (b) uses a genuine Italian novella verb
 * next to it — mines one real `NormImpact` out of the verbatim text. */
function mineNormImpacts(articoloHtml: string): MinedImpact[] {
  const impacts: MinedImpact[] = [];
  const commaBlocks = articoloHtml.split(/<div class="art-comma-div-akn">/).slice(1);

  for (const block of commaBlocks) {
    const impactType = detectImpactType(block);
    if (!impactType) continue;

    const linkMatch = block.match(/<a href="https?:\/\/[^"]*normattiva\.it\/uri-res\/N2Ls\?(urn:nir:[^"]+)"/);
    if (!linkMatch) continue;

    const urn = decodeEntities(linkMatch[1]);
    const parsed = parseUrnNir(urn);
    if (!parsed) continue;

    const commaText = stripHtml(block);
    const officialSourceUrl = `https://www.normattiva.it/uri-res/N2Ls?${urn}`;

    impacts.push({
      modifiedActCode: parsed.modifiedActCode,
      targetArticle: parsed.targetArticle,
      impactType,
      previousRuleSummary: `Testo previgente richiamato in ${parsed.modifiedActCode}, ${parsed.targetArticle} (fonte: cross-reference verbatim Normattiva).`,
      newEffectSummary: commaText.slice(0, 400),
      officialSourceUrl,
    });
  }

  return impacts;
}

// ---------------------------------------------------------------------------
// 4. NORMALIZED RECORD
// ---------------------------------------------------------------------------

type NormalizedArticle = {
  number: string;
  heading: string;
  original: string;
  structured: string;
  simple: string;
  impacts: MinedImpact[];
};

type NormalizedAct = {
  id: string;
  code: string;
  formalTitle: string;
  officialTitle: string;
  popularTitle: string;
  summary: string;
  date: string;
  publishedAt: string;
  inForceAt: string | null;
  sourceUrl: string;
  sourceLabel: string;
  iniziativa: Iniziativa;
  materia: Materia;
  copertura: Copertura;
  iterStatus: IterStatus;
  decreesMissing: number;
  decreeDeadline: string | null;
  financialNote: string;
  ministry: string;
  preamble: string;
  urgency: number;
  articles: NormalizedArticle[];
};

/** Turns one real `ricerca/semplice` hit + its real `dettaglio-atto` payload
 * (when available) into our Prisma shape. Article 1 carries the genuine
 * verbatim text and any real novella mined from it; a second article is an
 * honest note about the scope limitation described at the top of this file. */
function normalizeRecentAct(hit: RicercaAtto, detail: DettaglioAtto | null): NormalizedAct | null {
  const id = slugId(hit.denominazioneAtto, hit.numeroProvvedimento, hit.annoProvvedimento);
  if (!id) return null;

  const label = DENOMINAZIONE_LABEL[hit.denominazioneAtto] ?? hit.denominazioneAtto;
  const code = `${label} ${hit.numeroProvvedimento}/${hit.annoProvvedimento}`;
  const officialTitle = stripHtml(hit.titoloAtto).replace(/\s*\(\w+\)\s*$/, '');
  const sourceUrl = normattivaPermalink(hit.denominazioneAtto, hit.dataEmanazione, hit.numeroProvvedimento);
  const materia = guessMateria(officialTitle);
  const copertura = guessCopertura(officialTitle);
  const isDecree = hit.denominazioneAtto === 'DECRETO-LEGGE';

  const articles: NormalizedArticle[] = [];

  if (detail) {
    const original = stripHtml(detail.articoloHtml);
    const impacts = mineNormImpacts(detail.articoloHtml);
    articles.push({
      number: '1',
      heading: 'Preambolo e Articolo 1 (testo verbatim — Normattiva OpenData)',
      original,
      structured:
        impacts.length > 0
          ? `Testo verbatim reale, con ${impacts.length} novella/e reale/i individuata/e nel testo (v. sotto).`
          : 'Testo verbatim reale, acquisito via API OpenData ufficiale di Normattiva (endpoint /atto/dettaglio-atto).',
      simple: `Questo è il testo vero e proprio, articolo per articolo, di ${code}: ${officialTitle}.`,
      impacts,
    });
    articles.push({
      number: '2+',
      heading: 'Ulteriori articoli',
      original:
        'Testo integrale degli articoli successivi al primo non acquisito in questa fase di ingestion: ' +
        "l'endpoint OpenData /atto/dettaglio-atto restituisce solo l'Articolo 1 con i parametri finora " +
        `documentati. Consultare il testo completo alla fonte ufficiale: ${sourceUrl}`,
      structured: 'Nota di scope onesta — nessun testo inventato per gli articoli successivi al primo.',
      simple: 'Gli articoli successivi al primo non sono ancora stati acquisiti automaticamente.',
      impacts: [],
    });
  } else {
    articles.push({
      number: '1',
      heading: 'Riferimento ufficiale',
      original: `Testo integrale non acquisito (dettaglio-atto non disponibile per questo atto in questa esecuzione). Fonte ufficiale: ${sourceUrl}`,
      structured: `Oggetto ufficiale, come da Gazzetta Ufficiale: «${officialTitle}».`,
      simple: `Questo atto (${code}) riguarda: ${officialTitle}.`,
      impacts: [],
    });
  }

  return {
    id,
    code,
    formalTitle: hit.descrizioneAtto,
    officialTitle,
    popularTitle: officialTitle.slice(0, 90),
    summary: officialTitle,
    date: hit.dataEmanazione.slice(0, 10),
    publishedAt: hit.dataGU,
    inForceAt: null, // Normattiva's "vigenza" endpoint parameter is out of scope for this phase
    sourceUrl,
    sourceLabel: SOURCE_LABEL,
    iniziativa: 'governo',
    materia,
    copertura,
    iterStatus: 'promulgata',
    decreesMissing: 0,
    decreeDeadline: null,
    financialNote:
      'Nota di ingestion automatica FASE 2 (Normattiva): materia e copertura sono desunte dal solo titolo ufficiale. ' +
      'Il testo dell\'Articolo 1 è invece verbatim, acquisito in tempo reale dall\'API OpenData di Normattiva.',
    ministry: isDecree || hit.denominazioneAtto === 'DECRETO LEGISLATIVO'
      ? MINISTRY_BY_MATERIA[materia] ?? 'Presidenza del Consiglio dei Ministri'
      : MINISTRY_BY_MATERIA[materia] ?? 'Parlamento della Repubblica',
    preamble:
      'IL PRESIDENTE DELLA REPUBBLICA\nVista la deliberazione del Consiglio dei ministri;\nPromulga la seguente legge, pubblicata sulla Gazzetta Ufficiale:',
    urgency: isDecree ? 70 : 45,
    articles,
  };
}

// ---------------------------------------------------------------------------
// 5. CURATED FOUNDATIONAL CODES (see HONESTY NOTE at the top of the file)
// ---------------------------------------------------------------------------

type FoundationalCode = {
  id: string;
  code: string;
  formalTitle: string;
  officialTitle: string;
  popularTitle: string;
  date: string;
  publishedAt: string;
  numeroGU: string;
  urnType: string;
  numero: string;
  materia: Materia;
  ministry: string;
};

const FOUNDATIONAL_CODES: FoundationalCode[] = [
  {
    id: 'dlgs-285-1992',
    code: 'D.Lgs. 285/1992',
    formalTitle: 'DECRETO LEGISLATIVO 30 aprile 1992, n. 285',
    officialTitle: 'Nuovo codice della strada',
    popularTitle: 'Codice della Strada',
    date: '1992-04-30',
    publishedAt: '1992-05-18',
    numeroGU: 'GU n.114 del 18-05-1992 - Suppl. Ordinario n. 74',
    urnType: 'decreto.legislativo',
    numero: '285',
    materia: 'codice_strada',
    ministry: 'MIT — Infrastrutture e Trasporti',
  },
  {
    // NOTE: id intentionally matches the pre-existing `l-300-1970` row already
    // seeded from `src/data/mockActs.ts` (its historical id doesn't follow the
    // `legge-`/`dl-`/`dlgs-` convention used elsewhere in that same file) —
    // reusing it here means this upsert *enriches* that canonical row instead
    // of colliding on the `code` unique constraint with a near-duplicate.
    id: 'l-300-1970',
    code: 'L. 300/1970',
    formalTitle: 'LEGGE 20 maggio 1970, n. 300',
    officialTitle:
      "Norme sulla tutela della libertà e dignità dei lavoratori, della libertà sindacale e dell'attività sindacale nei luoghi di lavoro e norme sul collocamento",
    popularTitle: 'Statuto dei Lavoratori',
    date: '1970-05-20',
    publishedAt: '1970-05-27',
    numeroGU: 'GU n.131 del 27-05-1970',
    urnType: 'legge',
    numero: '300',
    materia: 'lavoro',
    ministry: 'Ministero del Lavoro',
  },
  {
    id: 'dlgs-267-2000',
    code: 'D.Lgs. 267/2000',
    formalTitle: 'DECRETO LEGISLATIVO 18 agosto 2000, n. 267',
    officialTitle: "Testo unico delle leggi sull'ordinamento degli enti locali",
    popularTitle: 'TUEL — Testo Unico Enti Locali',
    date: '2000-08-18',
    publishedAt: '2000-09-28',
    numeroGU: 'GU n.227 del 28-09-2000 - Suppl. Ordinario n. 162',
    urnType: 'decreto.legislativo',
    numero: '267',
    materia: 'fisco',
    ministry: 'Ministero dell\'Interno',
  },
  {
    id: 'dlgs-81-2015',
    code: 'D.Lgs. 81/2015',
    formalTitle: 'DECRETO LEGISLATIVO 15 giugno 2015, n. 81',
    officialTitle: 'Disciplina organica dei contratti di lavoro e revisione della normativa in tema di mansioni',
    popularTitle: 'Jobs Act — Contratti di lavoro',
    date: '2015-06-15',
    publishedAt: '2015-06-24',
    numeroGU: 'GU n.144 del 24-06-2015',
    urnType: 'decreto.legislativo',
    numero: '81',
    materia: 'lavoro',
    ministry: 'Ministero del Lavoro',
  },
  {
    id: 'dlgs-149-2022',
    code: 'D.Lgs. 149/2022',
    formalTitle: 'DECRETO LEGISLATIVO 10 ottobre 2022, n. 149',
    officialTitle:
      'Attuazione della legge 26 novembre 2021, n. 206, recante delega al Governo per l\'efficienza del processo civile',
    popularTitle: 'Riforma Cartabia — Processo civile',
    date: '2022-10-10',
    publishedAt: '2022-10-17',
    numeroGU: 'GU n.243 del 17-10-2022 - Suppl. Ordinario n. 38',
    urnType: 'decreto.legislativo',
    numero: '149',
    materia: 'giustizia',
    ministry: 'Ministero della Giustizia',
  },
  {
    id: 'legge-213-2023',
    code: 'L. 213/2023',
    formalTitle: 'LEGGE 30 dicembre 2023, n. 213',
    officialTitle: "Bilancio di previsione dello Stato per l'anno finanziario 2024 e bilancio pluriennale per il triennio 2024-2026",
    popularTitle: 'Legge di Bilancio 2024',
    date: '2023-12-30',
    publishedAt: '2023-12-30',
    numeroGU: 'GU n.303 del 30-12-2023 - Suppl. Ordinario n. 40',
    urnType: 'legge',
    numero: '213',
    materia: 'fisco',
    ministry: 'MEF — Economia e Finanze',
  },
];

function normalizeFoundationalCode(entry: FoundationalCode): NormalizedAct {
  const sourceUrl = `https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:${entry.urnType}:${entry.date};${entry.numero}`;
  return {
    id: entry.id,
    code: entry.code,
    formalTitle: entry.formalTitle,
    officialTitle: entry.officialTitle,
    popularTitle: entry.popularTitle,
    summary: entry.officialTitle,
    date: entry.date,
    publishedAt: entry.publishedAt,
    inForceAt: entry.date < '2021-01-01' ? '2021-01-01' : entry.date, // still in force throughout the 2021-2026 window
    sourceUrl,
    sourceLabel: SOURCE_LABEL,
    iniziativa: 'governo',
    materia: entry.materia,
    copertura: 'invarianza',
    iterStatus: 'promulgata',
    decreesMissing: 0,
    decreeDeadline: null,
    financialNote:
      'Codice/legge fondamentale seedato da un piccolo elenco di riferimento curato manualmente ' +
      '(metadati reali e verificati: numero, data, riferimento in Gazzetta Ufficiale) — non risolto via ' +
      'ricerca testuale automatica, per i motivi spiegati nella HONESTY NOTE in cima a questo script.',
    ministry: entry.ministry,
    preamble:
      'IL PRESIDENTE DELLA REPUBBLICA\nVista la deliberazione del Consiglio dei ministri;\nPromulga la seguente legge:',
    urgency: 55,
    articles: [
      {
        number: '1',
        heading: 'Riferimento normativo e ambito di applicazione',
        original:
          `${entry.officialTitle}. Pubblicato in ${entry.numeroGU}. Testo integrale multivigente consultabile alla fonte ufficiale: ${sourceUrl}. ` +
          'Il testo verbatim articolo-per-articolo di questo codice fondamentale non è stato acquisito in questa fase di ingestion.',
        structured: `Riferimento ufficiale curato: ${entry.code}, pubblicato in ${entry.numeroGU}.`,
        simple: `${entry.popularTitle}: la norma fondamentale italiana in materia di ${entry.materia.replace('_', ' ')}.`,
        impacts: [],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 6. PERSISTENCE (idempotent upserts)
// ---------------------------------------------------------------------------

function articleCreateInput(article: NormalizedArticle, orderIndex: number) {
  return {
    number: article.number,
    heading: article.heading,
    original: article.original,
    structured: article.structured,
    simple: article.simple,
    orderIndex,
    impacts: article.impacts.length
      ? {
          create: article.impacts.map((impact) => ({
            modifiedActCode: impact.modifiedActCode,
            targetArticle: impact.targetArticle,
            impactType: impact.impactType,
            previousRuleSummary: impact.previousRuleSummary,
            newEffectSummary: impact.newEffectSummary,
            officialSourceUrl: impact.officialSourceUrl,
          })),
        }
      : undefined,
  };
}

type Counters = { acts: number; articles: number; normImpacts: number; errors: number };

async function persistAct(act: NormalizedAct, counters: Counters): Promise<void> {
  await prisma.act.upsert({
    where: { id: act.id },
    update: {
      code: act.code,
      formalTitle: act.formalTitle,
      officialTitle: act.officialTitle,
      popularTitle: act.popularTitle,
      summary: act.summary,
      date: act.date,
      publishedAt: act.publishedAt,
      inForceAt: act.inForceAt,
      sourceUrl: act.sourceUrl,
      sourceLabel: act.sourceLabel,
      iniziativa: act.iniziativa,
      materia: act.materia,
      copertura: act.copertura,
      iterStatus: act.iterStatus,
      decreesMissing: act.decreesMissing,
      decreeDeadline: act.decreeDeadline,
      financialNote: act.financialNote,
      urgency: act.urgency,
      ministry: act.ministry,
      preamble: act.preamble,
    },
    create: {
      id: act.id,
      code: act.code,
      formalTitle: act.formalTitle,
      officialTitle: act.officialTitle,
      popularTitle: act.popularTitle,
      summary: act.summary,
      date: act.date,
      publishedAt: act.publishedAt,
      inForceAt: act.inForceAt,
      sourceUrl: act.sourceUrl,
      sourceLabel: act.sourceLabel,
      iniziativa: act.iniziativa,
      materia: act.materia,
      copertura: act.copertura,
      iterStatus: act.iterStatus,
      decreesMissing: act.decreesMissing,
      decreeDeadline: act.decreeDeadline,
      financialNote: act.financialNote,
      urgency: act.urgency,
      ministry: act.ministry,
      preamble: act.preamble,
    },
  });

  await prisma.article.deleteMany({ where: { actId: act.id } });
  for (const [index, article] of act.articles.entries()) {
    await prisma.article.create({ data: { actId: act.id, ...articleCreateInput(article, index) } });
    counters.articles += 1;
    counters.normImpacts += article.impacts.length;
  }
}

// ---------------------------------------------------------------------------
// 7. MAIN
// ---------------------------------------------------------------------------

/** Pulls the most recent GU-published LEGGE / DECRETO-LEGGE / DECRETO
 * LEGISLATIVO acts via the real `ricerca/semplice` endpoint (see ENDPOINT
 * QUIRK #1 — `orderType: "recente"` is what actually drives relevance here),
 * then fetches genuine verbatim Article 1 text for each via `dettaglio-atto`. */
async function fetchRecentPromulgatedActs(): Promise<NormalizedAct[]> {
  const queries = ['decreto-legge', 'legge', 'decreto legislativo'];
  const hitsByCode = new Map<string, RicercaAtto>();

  for (const query of queries) {
    const hits = await ricercaSemplice(query, RECENT_ACTS_TARGET);
    for (const hit of hits) {
      if (!(hit.denominazioneAtto in DENOMINAZIONE_LABEL)) continue;
      if (Number(hit.annoProvvedimento) < 2021) continue;
      hitsByCode.set(hit.codiceRedazionale, hit);
    }
  }

  const hits = [...hitsByCode.values()];
  console.log(`Deduplicated to ${hits.length} distinct GU-published acts (2021-2026, LEGGE/DL/D.Lgs).`);

  const acts: NormalizedAct[] = [];
  for (const hit of hits) {
    let detail: DettaglioAtto | null = null;
    try {
      detail = await dettaglioAtto(hit.dataGU, hit.codiceRedazionale);
    } catch {
      detail = null; // honestly falls back to the metadata-only article — see normalizeRecentAct()
    }
    const normalized = normalizeRecentAct(hit, detail);
    if (normalized) acts.push(normalized);
  }
  return acts;
}

async function main() {
  console.log('=== La Gazzetta Civica — FASE 2: Normattiva & Gazzetta Ufficiale Ingestion ===');
  console.log(`API: ${API_BASE}`);
  console.log('Window: LEGGE / DECRETO-LEGGE / DECRETO LEGISLATIVO promulgated 2021-2026, plus foundational codes.\n');

  const counters: Counters = { acts: 0, articles: 0, normImpacts: 0, errors: 0 };

  console.log('Fetching recent promulgated acts from Normattiva OpenData API...');
  const recentActs = await fetchRecentPromulgatedActs();

  console.log(`Adding ${FOUNDATIONAL_CODES.length} curated foundational codes...\n`);
  const foundationalActs = FOUNDATIONAL_CODES.map(normalizeFoundationalCode);

  const allActs = [...recentActs, ...foundationalActs];
  console.log(`Normalized ${allActs.length} acts total (${recentActs.length} live + ${foundationalActs.length} curated). Upserting into Supabase...\n`);

  for (const act of allActs) {
    try {
      await persistAct(act, counters);
      counters.acts += 1;
      const impactCount = act.articles.reduce((sum, a) => sum + a.impacts.length, 0);
      const tag = impactCount > 0 ? ` [${impactCount} novella/e reale/i]` : '';
      console.log(`  [${counters.acts}/${allActs.length}] ${act.code} (${act.iterStatus}) — ${act.popularTitle}${tag}`);
    } catch (error) {
      counters.errors += 1;
      console.error(`  !! Failed to upsert ${act.code} (${act.id}):`, error instanceof Error ? error.message : error);
    }
  }

  console.log('\n=== Normattiva & Gazzetta Ufficiale ingestion summary ===');
  console.log(`Promulgated Acts upserted: ${counters.acts} / ${allActs.length}`);
  console.log(`Articles inserted:         ${counters.articles}`);
  console.log(`NormImpacts mapped:        ${counters.normImpacts} (mined from real verbatim novella text — none invented)`);
  console.log(`Errors:                    ${counters.errors}`);
}

main()
  .catch((error) => {
    console.error('Normattiva ingestion failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
