/**
 * PHASE 1 — Thematic Legal Cataloging & Taxonomy Graph.
 *
 * A static, hand-curated ontology mapping Italian institutional subject
 * areas (`materia`) to the historical "foundation acts" that still govern
 * each area today (the codes/framework laws that any new bill in that
 * space almost always amends), plus the Italian legal vocabulary used to
 * recognize which domain a free-text query or act belongs to.
 *
 * This is deliberately dependency-free (no Prisma, no network calls) so it
 * can be imported from anywhere — ingestion scripts, the RAG retrieval
 * pipeline (`app/api/rag/route.ts`), or UI components — to answer two
 * questions:
 *   1. "Given this text (and optionally a declared `materia`), which
 *      foundational acts should I pull in for deep comparative grounding?"
 *      → `matchThematicCorpus`
 *   2. "Does this text already explicitly cite a specific act/article
 *      (e.g. 'd.lgs. 285/1992, art. 173')?" → `extractReferencedActCodes`
 */

// ---------------------------------------------------------------------------
// 1. TYPES
// ---------------------------------------------------------------------------

export interface HistoricalFoundationAct {
  /** e.g. "D.Lgs. 285/1992", "L. 300/1970", "L. 833/1978" */
  actCode: string;
  /** e.g. "Codice della Strada", "Statuto dei Lavoratori" */
  popularTitle: string;
  officialTitle: string;
  /** Key baseline articles to inspect first when grounding an answer. */
  defaultArticles: string[];
  normattivaUrn?: string;
  summary: string;
}

export interface LegalThematicDomain {
  /** Matches `Act.materia` — extended here with a few additional
   * institutional buckets ('enti_locali', 'ambiente', 'istruzione',
   * 'pubblica_amministrazione') beyond the narrower set already stored on
   * `Act` rows, so this taxonomy can classify text the DB schema doesn't
   * (yet) have a dedicated column value for. */
  materia: string;
  /** Exhaustive Italian legal terms/synonyms used to recognize this domain
   * in free text (lowercase, no accented-character normalization needed —
   * matching is done against normalized text, see `normalizeText`). */
  keywords: string[];
  foundationalActs: HistoricalFoundationAct[];
}

// ---------------------------------------------------------------------------
// 2. DOMAIN MATRIX
// ---------------------------------------------------------------------------

export const LEGAL_THEMATIC_DOMAINS: LegalThematicDomain[] = [
  {
    materia: 'codice_strada',
    keywords: [
      'strada', 'codice della strada', 'circolazione', 'circolazione stradale', 'patente',
      'patente di guida', 'neopatentati', 'autovelox', 'veicolo', 'veicoli', 'autostrada',
      'autostrade', 'multa', 'multe', 'sanzione stradale', 'contravvenzione', 'targa',
      'revisione auto', 'assicurazione rc auto', 'monopattino', 'monopattini', 'ciclomotore',
      'motociclo', 'autotrasporto', 'trasporto pubblico', 'trasporti', 'patente a punti',
      'omologazione', 'limiti di velocità', 'guida in stato di ebbrezza', 'alcoltest',
    ],
    foundationalActs: [
      {
        actCode: 'D.Lgs. 285/1992',
        popularTitle: 'Codice della Strada',
        officialTitle: 'Nuovo codice della strada',
        defaultArticles: ['141', '142', '173', '186', '193', '223'],
        normattivaUrn: 'urn:nir:stato:decreto.legislativo:1992-04-30;285',
        summary:
          'Disciplina organica della circolazione stradale: regole di comportamento, limiti di velocità, patenti, sanzioni amministrative e penali, requisiti dei veicoli.',
      },
    ],
  },
  {
    materia: 'lavoro',
    keywords: [
      'lavoro', 'contratto di lavoro', 'lavoratore', 'lavoratori', 'licenziamento',
      'licenziamenti', 'sindacato', 'sindacale', 'statuto dei lavoratori', 'sicurezza sul lavoro',
      'infortunio', 'infortuni sul lavoro', 'contratto a termine', 'somministrazione di lavoro',
      'jobs act', 'dimissioni', 'ccnl', 'contratto collettivo', 'stipendio', 'retribuzione',
      'pensione', 'tfr', 'malattia', 'ferie', 'part time', 'smart working', 'lavoro agile',
      'tutele crescenti', 'reintegra', 'demansionamento',
    ],
    foundationalActs: [
      {
        actCode: 'L. 300/1970',
        popularTitle: 'Statuto dei Lavoratori',
        officialTitle: 'Norme sulla tutela della libertà e dignità dei lavoratori, della libertà sindacale e dell’attività sindacale nei luoghi di lavoro',
        defaultArticles: ['1', '7', '18', '28'],
        normattivaUrn: 'urn:nir:stato:legge:1970-05-20;300',
        summary:
          'Legge fondamentale a tutela della dignità e libertà del lavoratore subordinato: libertà di opinione, garanzie disciplinari, tutela contro il licenziamento illegittimo, repressione della condotta antisindacale.',
      },
      {
        actCode: 'D.Lgs. 81/2015',
        popularTitle: 'Jobs Act — Contratto a tutele crescenti',
        officialTitle: 'Disciplina del contratto di lavoro a tempo indeterminato a tutele crescenti',
        defaultArticles: ['1', '2', '3', '19'],
        normattivaUrn: 'urn:nir:stato:decreto.legislativo:2015-06-15;81',
        summary:
          'Riforma organica dei contratti di lavoro nell’ambito del Jobs Act: introduce il contratto a tutele crescenti e riordina la disciplina delle tipologie contrattuali flessibili.',
      },
    ],
  },
  {
    materia: 'sanita',
    keywords: [
      'sanità', 'sanitario', 'sanitaria', 'salute', 'ospedale', 'ospedali', 'ssn',
      'servizio sanitario nazionale', 'farmaco', 'farmaci', 'lista di attesa', 'liste di attesa',
      'ticket sanitario', 'lea', 'livelli essenziali di assistenza', 'vaccino', 'vaccini',
      'pronto soccorso', 'asl', 'azienda sanitaria', 'medico di base', 'ricovero', 'medico',
      'infermiere', 'prestazione sanitaria',
    ],
    foundationalActs: [
      {
        actCode: 'L. 833/1978',
        popularTitle: 'Istituzione del Servizio Sanitario Nazionale',
        officialTitle: 'Istituzione del servizio sanitario nazionale',
        defaultArticles: ['1', '2', '19'],
        normattivaUrn: 'urn:nir:stato:legge:1978-12-23;833',
        summary:
          'Legge istitutiva del SSN: universalità, uguaglianza ed equità di accesso alle prestazioni sanitarie, articolazione territoriale del servizio.',
      },
      {
        actCode: 'D.Lgs. 502/1992',
        popularTitle: 'Riordino della disciplina sanitaria',
        officialTitle: 'Riordino della disciplina in materia sanitaria, a norma dell’articolo 1 della legge 23 ottobre 1992, n. 421',
        defaultArticles: ['1', '3', '8'],
        normattivaUrn: 'urn:nir:stato:decreto.legislativo:1992-12-30;502',
        summary:
          'Riforma organica del SSN: regionalizzazione, aziendalizzazione delle USL, accreditamento delle strutture sanitarie pubbliche e private.',
      },
    ],
  },
  {
    materia: 'fisco',
    keywords: [
      'fisco', 'fiscale', 'tasse', 'tassa', 'imposta', 'imposte', 'irpef', 'ires', 'iva',
      'tributo', 'tributi', 'accertamento fiscale', 'dichiarazione dei redditi', 'tuir',
      'agenzia delle entrate', 'cartella esattoriale', 'condono fiscale', 'ravvedimento operoso',
      'superbonus', 'detrazione fiscale', 'detrazioni', 'deduzione', 'contribuente', 'evasione fiscale',
    ],
    foundationalActs: [
      {
        actCode: 'D.P.R. 917/1986',
        popularTitle: 'TUIR — Testo Unico delle Imposte sui Redditi',
        officialTitle: 'Approvazione del testo unico delle imposte sui redditi',
        defaultArticles: ['1', '3', '10', '51'],
        normattivaUrn: 'urn:nir:stato:decreto.presidente.repubblica:1986-12-22;917',
        summary:
          'Testo unico che disciplina in modo organico le imposte sui redditi delle persone fisiche e delle società: soggetti passivi, base imponibile, categorie di reddito, oneri deducibili.',
      },
      {
        actCode: 'D.P.R. 600/1973',
        popularTitle: 'Accertamento Tributario',
        officialTitle: 'Disposizioni comuni in materia di accertamento delle imposte sui redditi',
        defaultArticles: ['31', '36-bis', '43'],
        normattivaUrn: 'urn:nir:stato:decreto.presidente.repubblica:1973-09-29;600',
        summary:
          'Disciplina i poteri e le procedure di accertamento dell’amministrazione finanziaria: controlli automatizzati, poteri istruttori, termini di decadenza.',
      },
    ],
  },
  {
    materia: 'giustizia',
    keywords: [
      'giustizia', 'processo', 'processo civile', 'processo penale', 'tribunale', 'causa civile',
      'ricorso', 'sentenza', 'cartabia', 'riforma cartabia', 'codice di procedura civile',
      'avvocato', 'magistrato', 'udienza', 'prescrizione', 'appello', 'cassazione', 'giudice',
      'procedimento giudiziario', 'mediazione civile', 'arbitrato',
    ],
    foundationalActs: [
      {
        actCode: 'R.D. 1443/1940',
        popularTitle: 'Codice di Procedura Civile',
        officialTitle: 'Approvazione del codice di procedura civile',
        defaultArticles: ['99', '163', '342'],
        normattivaUrn: 'urn:nir:stato:regio.decreto:1940-10-28;1443',
        summary:
          'Corpo normativo che regola il processo civile italiano: principio della domanda, forme dell’atto di citazione, disciplina dell’appello e delle impugnazioni.',
      },
      {
        actCode: 'D.Lgs. 149/2022',
        popularTitle: 'Riforma Cartabia del processo civile',
        officialTitle: 'Attuazione della legge 26 novembre 2021, n. 206, recante delega al Governo per l’efficienza del processo civile',
        defaultArticles: ['1', '35'],
        normattivaUrn: 'urn:nir:stato:decreto.legislativo:2022-10-10;149',
        summary:
          'Riforma organica del processo civile: nuovi riti semplificati, digitalizzazione del processo, incentivi alla giustizia complementare (mediazione, negoziazione assistita).',
      },
    ],
  },
  {
    materia: 'enti_locali',
    keywords: [
      'comune', 'comuni', 'provincia', 'province', 'ente locale', 'enti locali', 'tuel',
      'sindaco', 'consiglio comunale', 'giunta comunale', 'bilancio comunale', 'dissesto',
      'commissariamento', 'città metropolitana', 'municipio', 'consorzio di comuni',
      'segretario comunale', 'unione di comuni',
    ],
    foundationalActs: [
      {
        actCode: 'D.Lgs. 267/2000',
        popularTitle: 'TUEL — Testo Unico degli Enti Locali',
        officialTitle: 'Testo unico delle leggi sull’ordinamento degli enti locali',
        defaultArticles: ['1', '42', '151'],
        normattivaUrn: 'urn:nir:stato:decreto.legislativo:2000-08-18;267',
        summary:
          'Testo unico che riordina l’intera disciplina di comuni, province e città metropolitane: organi, competenze, ordinamento finanziario e contabile.',
      },
    ],
  },
  {
    materia: 'ambiente',
    keywords: [
      'ambiente', 'ambientale', 'inquinamento', 'rifiuti', 'emissioni', 'via', 'valutazione impatto ambientale',
      'vas', 'aia', 'edilizia', 'urbanistica', 'permesso di costruire', 'abuso edilizio',
      'condono edilizio', 'testo unico ambiente', 'testo unico edilizia', 'bonus edilizi',
      'ecobonus', 'sismabonus', 'ristrutturazione edilizia', 'piano regolatore',
    ],
    foundationalActs: [
      {
        actCode: 'D.Lgs. 152/2006',
        popularTitle: 'Testo Unico Ambientale',
        officialTitle: 'Norme in materia ambientale',
        defaultArticles: ['1', '5', '29'],
        normattivaUrn: 'urn:nir:stato:decreto.legislativo:2006-04-03;152',
        summary:
          'Codice dell’ambiente: disciplina organica di valutazione ambientale, difesa del suolo, tutela delle acque, gestione dei rifiuti e bonifica dei siti contaminati.',
      },
      {
        actCode: 'D.P.R. 380/2001',
        popularTitle: 'Testo Unico dell’Edilizia',
        officialTitle: 'Testo unico delle disposizioni legislative e regolamentari in materia edilizia',
        defaultArticles: ['3', '10', '31'],
        normattivaUrn: 'urn:nir:stato:decreto.presidente.repubblica:2001-06-06;380',
        summary:
          'Testo unico che disciplina i titoli abilitativi edilizi (permesso di costruire, SCIA), le sanzioni per abusivismo e i requisiti tecnici delle costruzioni.',
      },
    ],
  },
  {
    materia: 'pubblica_amministrazione',
    keywords: [
      'pubblica amministrazione', 'procedimento amministrativo', 'trasparenza amministrativa',
      'accesso agli atti', 'accesso civico', 'pubblico dipendente', 'concorso pubblico',
      'silenzio assenso', 'autocertificazione', 'responsabile del procedimento', 'pa digitale',
      'conferenza di servizi', 'diritto di accesso',
    ],
    foundationalActs: [
      {
        actCode: 'L. 241/1990',
        popularTitle: 'Trasparenza e Procedimento Amministrativo',
        officialTitle: 'Nuove norme in materia di procedimento amministrativo e di diritto di accesso ai documenti amministrativi',
        defaultArticles: ['1', '2', '3', '10'],
        normattivaUrn: 'urn:nir:stato:legge:1990-08-07;241',
        summary:
          'Legge cardine del procedimento amministrativo italiano: principi di trasparenza e buon andamento, termini di conclusione del procedimento, obbligo di motivazione, diritto di accesso ai documenti.',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// 3. TEXT NORMALIZATION
// ---------------------------------------------------------------------------

/** Lowercases and strips punctuation (keeping accented Italian letters and
 * digits/slashes, since those carry meaning for act citations like
 * "285/1992"), collapsing whitespace. Shared by both matching functions
 * below so "materia" comparisons and keyword scans behave consistently. */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s/.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// 4. matchThematicCorpus — free-text/materia → ranked foundational acts
// ---------------------------------------------------------------------------

/**
 * Classifies `text` (optionally aided by an already-declared `materia`)
 * against `LEGAL_THEMATIC_DOMAINS` and returns the most relevant
 * historical foundation acts for deep comparative grounding.
 *
 * Scoring: a declared `materia` that matches a domain is an
 * (near-)authoritative signal and dominates the ranking; beyond that,
 * every keyword hit found in the normalized text adds one point to its
 * domain. Domains are ranked by score, and foundational acts are
 * collected from the top domains in order, deduplicated by `actCode`,
 * capped at 2 distinct acts total (per requirement) to keep downstream
 * grounding prompts focused rather than exhaustive.
 */
export function matchThematicCorpus(text: string, declaredMateria?: string): HistoricalFoundationAct[] {
  const normalizedText = normalizeText(text);
  const normalizedMateria = declaredMateria ? normalizeText(declaredMateria) : undefined;

  const scored = LEGAL_THEMATIC_DOMAINS.map((domain) => {
    let score = 0;
    if (normalizedMateria && normalizedMateria === normalizeText(domain.materia)) {
      score += 100;
    }
    for (const keyword of domain.keywords) {
      if (normalizedText.includes(normalizeText(keyword))) score += 1;
    }
    return { domain, score };
  }).filter((entry) => entry.score > 0);

  scored.sort((a, b) => b.score - a.score);

  const results: HistoricalFoundationAct[] = [];
  const seenActCodes = new Set<string>();
  for (const { domain } of scored) {
    for (const act of domain.foundationalActs) {
      if (seenActCodes.has(act.actCode)) continue;
      results.push(act);
      seenActCodes.add(act.actCode);
      if (results.length >= 2) return results;
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 5. extractReferencedActCodes — explicit citation extraction
// ---------------------------------------------------------------------------

/** Every recognized way an Italian legal act type is written, ordered from
 * most specific to least specific so `canonicalActPrefix` (below) tests
 * unambiguous multi-word forms before falling back to bare abbreviations. */
const ACT_TYPE_ALIASES = [
  'decreto\\s+legislativo', 'd\\.?\\s*lgs\\.?', 'dlgs',
  'decreto[\\s-]legge', 'd\\.?\\s*l\\.?(?!gs)', 'dl',
  'decreto\\s+del\\s+presidente\\s+della\\s+repubblica', 'd\\.?\\s*p\\.?\\s*r\\.?', 'dpr',
  'regio\\s+decreto', 'r\\.?\\s*d\\.?',
  'decreto\\s+ministeriale', 'd\\.?\\s*m\\.?',
  'codice\\s+di\\s+procedura\\s+civile', 'codice\\s+di\\s+procedura\\s+penale',
  'codice\\s+civile', 'codice\\s+penale',
  'legge', 'l\\.',
].join('|');

/** Maps a matched act-type phrase (e.g. "d.lgs.", "decreto legislativo",
 * "regio decreto") to its canonical rendering used in `actCode` strings. */
function canonicalActPrefix(raw: string): string {
  const t = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/^decreto\s+legislativo$|^d\.?\s*lgs\.?$|^dlgs$/.test(t)) return 'D.Lgs.';
  if (/^decreto[\s-]legge$|^d\.?\s*l\.?$|^dl$/.test(t)) return 'DL';
  if (/^decreto\s+del\s+presidente\s+della\s+repubblica$|^d\.?\s*p\.?\s*r\.?$|^dpr$/.test(t)) return 'D.P.R.';
  if (/^regio\s+decreto$|^r\.?\s*d\.?$/.test(t)) return 'R.D.';
  if (/^decreto\s+ministeriale$|^d\.?\s*m\.?$/.test(t)) return 'D.M.';
  if (/^codice\s+di\s+procedura\s+civile$/.test(t)) return 'Codice di Procedura Civile';
  if (/^codice\s+di\s+procedura\s+penale$/.test(t)) return 'Codice di Procedura Penale';
  if (/^codice\s+civile$/.test(t)) return 'Codice Civile';
  if (/^codice\s+penale$/.test(t)) return 'Codice Penale';
  if (/^legge$|^l\.?$/.test(t)) return 'L.';
  return raw.trim();
}

/** Whole-name codes (Codice Civile, Codice Penale, ...) identify a unique
 * act on their own, without a number/year — every other act type needs
 * both to be resolvable to a real citation. */
function buildActCode(canonical: string, number?: string, year?: string): string | null {
  if (number && year) return `${canonical} ${number}/${year}`;
  if (/^codice/i.test(canonical)) return canonical;
  return null;
}

// "d.lgs. 285/1992, art. 173" / "legge 241/1990" / "l. 300/1970"
const ACT_FIRST_PATTERN = new RegExp(
  `\\b(${ACT_TYPE_ALIASES})\\s+n?\\.?\\s*(\\d+)\\s*/\\s*(\\d{4})(?:\\s*,?\\s*art(?:icolo|\\.)?\\s*(\\d+[a-z-]*))?`,
  'gi',
);

// "art. 18 del regio decreto 1443/1940" / "art. 640 del codice penale"
const ARTICLE_FIRST_PATTERN = new RegExp(
  `\\bart(?:icolo|\\.)?\\s*(\\d+[a-z-]*)\\s+dell(?:a|o|['’])?\\s+(${ACT_TYPE_ALIASES})(?:\\s+n?\\.?\\s*(\\d+)\\s*/\\s*(\\d{4}))?`,
  'gi',
);

/**
 * Scans free text for explicit legal citations — both "act-first" forms
 * (`"d.lgs. 285/1992, art. 173"`) and "article-first" forms
 * (`"art. 18 del regio decreto 1443/1940"`, `"art. 640 del codice penale"`)
 * — and returns each one as a normalized `{ actCode, articleNumber? }`
 * pair, deduplicated.
 */
export function extractReferencedActCodes(text: string): { actCode: string; articleNumber?: string }[] {
  const results: { actCode: string; articleNumber?: string }[] = [];
  const seen = new Set<string>();

  const record = (actCode: string, articleNumber?: string) => {
    const key = `${actCode}::${articleNumber ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(articleNumber ? { actCode, articleNumber } : { actCode });
  };

  for (const match of text.matchAll(ACT_FIRST_PATTERN)) {
    const canonical = canonicalActPrefix(match[1]);
    const actCode = buildActCode(canonical, match[2], match[3]);
    if (actCode) record(actCode, match[4] || undefined);
  }

  for (const match of text.matchAll(ARTICLE_FIRST_PATTERN)) {
    const canonical = canonicalActPrefix(match[2]);
    const actCode = buildActCode(canonical, match[3], match[4]);
    if (actCode) record(actCode, match[1]);
  }

  return results;
}
