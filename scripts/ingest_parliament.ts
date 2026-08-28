/**
 * FASE 2 — Open Data Ingestion Pipeline.
 *
 * Pulls real parliamentary acts (decree-law conversions and ordinary bills)
 * for the XVIII/XIX Legislature, 2021-2026 window, straight from the
 * official Camera dei Deputati Linked Open Data SPARQL endpoint
 * (https://dati.camera.it/sparql, `ocd:` ontology) and upserts them into
 * Supabase via Prisma — including real Camera roll-call tallies whenever a
 * final vote has already happened.
 *
 * HONESTY NOTE ON SCOPE: `ocd:atto` metadata gives us identity, dates,
 * initiative, legislative phase, and (when available) the real roll-call
 * breakdown — but not the verbatim normative text of each article, which
 * lives on Normattiva/Gazzetta Ufficiale and isn't reachable from this
 * SPARQL endpoint. Every ingested act therefore ships with a small,
 * clearly-labelled "in attesa del testo integrale" article scaffold
 * derived only from real metadata, instead of fabricated legal prose. A
 * future FASE 3 (Normattiva/Gazzetta Ufficiale text scraper) can safely
 * overwrite `original`/`structured`/`simple` per article without touching
 * `NormImpact`/`VoteBreakdown`. Likewise, `VoteBreakdown` rows are only
 * created when the Camera has an on-the-record final vote — no synthetic
 * numbers are invented for acts still pending a vote.
 *
 * Usage: npm run db:ingest
 */
import { PrismaClient } from '@prisma/client';
import type { Copertura, ImpactType, Iniziativa, IterStatus, Materia } from '../src/data/mockActs';

const prisma = new PrismaClient();

const SPARQL_ENDPOINT = 'https://dati.camera.it/sparql';
const LEG_18 = 'http://dati.camera.it/ocd/legislatura.rdf/repubblica_18';
const LEG_19 = 'http://dati.camera.it/ocd/legislatura.rdf/repubblica_19';
const WINDOW_START = '20210101'; // 2021-2026 ingestion window (yyyymmdd, as stored by the endpoint)

// ---------------------------------------------------------------------------
// 1. SPARQL CLIENT
// ---------------------------------------------------------------------------

type SparqlBinding = Record<string, { type: string; value: string; datatype?: string }>;

type Row = Record<string, string | undefined>;

async function sparqlSelect(query: string): Promise<Row[]> {
  const response = await fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/sparql-results+json',
    },
    body: `query=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`SPARQL endpoint returned HTTP ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as { results: { bindings: SparqlBinding[] } };
  return json.results.bindings.map((binding) => {
    const row: Row = {};
    for (const [key, cell] of Object.entries(binding)) row[key] = cell.value;
    return row;
  });
}

// ---------------------------------------------------------------------------
// 2. QUERIES — decree-law conversions + a diversifying sample of ordinary bills
// ---------------------------------------------------------------------------

const DECREE_QUERY = `
PREFIX ocd: <http://dati.camera.it/ocd/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT DISTINCT ?atto ?numero ?iniziativa ?presentazione ?titolo ?fase ?dataIter ?favorevoli ?contrari ?astenuti ?votanti
WHERE {
  VALUES ?leg { <${LEG_18}> <${LEG_19}> }
  ?atto a ocd:atto;
        ocd:iniziativa ?iniziativa;
        dc:identifier ?numero;
        ocd:rif_leg ?leg;
        dc:date ?presentazione;
        dc:title ?titolo;
        ocd:rif_statoIter ?statoIter .
  ?statoIter dc:title ?fase ; dc:date ?dataIter .
  FILTER(?presentazione >= "${WINDOW_START}")
  FILTER(CONTAINS(?titolo, "decreto-legge"))
  OPTIONAL {
    ?v a ocd:votazione; ocd:rif_attoCamera ?atto;
       ocd:votazioneFinale "1"^^xsd:integer; ocd:approvato "1"^^xsd:integer;
       ocd:favorevoli ?favorevoli; ocd:contrari ?contrari; ocd:astenuti ?astenuti; ocd:votanti ?votanti.
  }
}
ORDER BY DESC(?presentazione)
LIMIT 60`;

const BILL_QUERY = `
PREFIX ocd: <http://dati.camera.it/ocd/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT DISTINCT ?atto ?numero ?iniziativa ?presentazione ?titolo ?fase ?dataIter ?favorevoli ?contrari ?astenuti ?votanti
WHERE {
  VALUES ?leg { <${LEG_18}> <${LEG_19}> }
  ?atto a ocd:atto;
        ocd:iniziativa ?iniziativa;
        dc:identifier ?numero;
        ocd:rif_leg ?leg;
        dc:date ?presentazione;
        dc:title ?titolo;
        ocd:rif_statoIter ?statoIter .
  ?statoIter dc:title ?fase ; dc:date ?dataIter .
  FILTER(?presentazione >= "${WINDOW_START}")
  FILTER(!CONTAINS(?titolo, "decreto-legge"))
  OPTIONAL {
    ?v a ocd:votazione; ocd:rif_attoCamera ?atto;
       ocd:votazioneFinale "1"^^xsd:integer; ocd:approvato "1"^^xsd:integer;
       ocd:favorevoli ?favorevoli; ocd:contrari ?contrari; ocd:astenuti ?astenuti; ocd:votanti ?votanti.
  }
}
ORDER BY DESC(?presentazione)
LIMIT 40`;

// ---------------------------------------------------------------------------
// 3. NORMALIZATION HELPERS
// ---------------------------------------------------------------------------

const HTML_ENTITIES: Record<string, string> = {
  agrave: 'à', Agrave: 'À', egrave: 'è', Egrave: 'È', igrave: 'ì', Igrave: 'Ì',
  ograve: 'ò', Ograve: 'Ò', ugrave: 'ù', Ugrave: 'Ù', eacute: 'é', Eacute: 'É',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', nbsp: ' ', quot: '"',
  amp: '&', lt: '<', gt: '>', apos: "'",
};

function decodeEntities(text: string): string {
  return text
    // Decode entities first: the endpoint escapes its embedded <em>/<i>/<b>
    // emphasis tags as &lt;...&gt;, so they only become literal tags here.
    .replace(/&([a-zA-Z]+);/g, (match, name) => HTML_ENTITIES[name] ?? match)
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/<[^>]+>/g, '') // now strip the (now-literal) emphasis tags
    .replace(/\s+/g, ' ')
    .trim();
}

const MONTH_NAMES_IT = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

function isoFromYyyymmdd(raw: string | undefined): string | null {
  if (!raw || raw.length !== 8) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

const MATERIA_KEYWORDS: Record<Materia, string[]> = {
  codice_strada: ['strada', 'patente', 'veicol', 'circolazione', 'trasport', 'monopattin', 'autotrasport'],
  fisco: ['fisc', 'iva', 'irpef', 'tribut', 'bilancio', 'tasse', 'entrate', 'canone'],
  sanita: ['sanit', 'salute', 'ospedal', 'ssn', 'farmac', 'medic', 'vaccin'],
  lavoro: ['lavoro', 'contratt', 'sindac', 'occupazion', 'pension', 'previdenz', 'salari'],
  giustizia: ['giustizia', 'penale', 'process', 'civile', 'tribunale', 'reat', 'magistrat'],
};

function guessMateria(text: string): Materia {
  const lower = text.toLowerCase();
  for (const materia of Object.keys(MATERIA_KEYWORDS) as Materia[]) {
    if (MATERIA_KEYWORDS[materia].some((kw) => lower.includes(kw))) return materia;
  }
  return 'fisco'; // most omnibus decree-laws touch public finance somewhere; safest generic default
}

function guessCopertura(text: string): Copertura {
  const lower = text.toLowerCase();
  if (/fondo|risorse aggiuntive|finanziamento|stanziamento|maggiori entrate/.test(lower)) return 'a_debito';
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

/** Matches titles of the form `"Conversione in legge[, con modificazioni,] del
 * decreto-legge D mese YYYY, n. N, recante <oggetto>"`, which is the fixed
 * official phrasing Camera dei Deputati uses for every decree-law conversion
 * bill — letting us pull the decree's own date/number/subject straight out
 * of real title text rather than guessing. */
function parseDecreeConversion(cleanTitle: string): {
  day: number; month: number; year: number; decreeNumber: string; conModificazioni: boolean; recante: string;
} | null {
  const m = cleanTitle.match(
    /decreto-legge\s+(\d{1,2})\s+([a-zà]+)\s+(\d{4}),?\s*n\.?\s*(\d+)/i,
  );
  if (!m) return null;
  const monthIndex = MONTH_NAMES_IT.indexOf(m[2].toLowerCase());
  if (monthIndex === -1) return null;

  const recanteMatch = cleanTitle.match(/recante\s+(.+?)["'”]?\s*$/i);
  return {
    day: Number(m[1]),
    month: monthIndex + 1,
    year: Number(m[3]),
    decreeNumber: m[4],
    conModificazioni: /con modificazioni/i.test(cleanTitle),
    recante: recanteMatch ? recanteMatch[1].replace(/["'”]+$/, '').trim() : cleanTitle,
  };
}

function mapIniziativa(raw: string | undefined): Iniziativa {
  const lower = (raw ?? '').toLowerCase();
  if (lower === 'governo') return 'governo';
  if (lower === 'popolare') return 'popolare';
  return 'parlamentare';
}

function deriveIterStatus(hasVote: boolean, cleanTitle: string, fase: string | undefined): IterStatus {
  const lowerFase = (fase ?? '').toLowerCase();
  if (hasVote) {
    if (/con modificazioni/i.test(cleanTitle)) return 'navetta_senato'; // amended here → must shuttle back
    if (/approvato dal senato/i.test(cleanTitle)) return 'promulgata'; // both chambers now aligned
    return 'navetta_senato'; // passed this chamber, other chamber's word still pending
  }
  if (lowerFase.includes('aula')) return 'in_aula';
  if (lowerFase.includes('senato')) return 'navetta_senato';
  return 'in_commissione';
}

// ---------------------------------------------------------------------------
// 4. RAW ROW GROUPING (one `?atto` can appear multiple times: once per
//    ocd:rif_statoIter phase snapshot, and/or once per matched vote row)
// ---------------------------------------------------------------------------

type Vote = { favorevoli: number; contrari: number; astenuti: number; votanti: number };

type GroupedAct = {
  attoUri: string;
  legNumber: number;
  numero: string;
  iniziativa: string;
  presentazione: string;
  titolo: string;
  fase: string;
  dataIter: string;
  vote: Vote | null;
};

function groupRows(rows: Row[]): GroupedAct[] {
  const byAtto = new Map<string, Row[]>();
  for (const row of rows) {
    if (!row.atto) continue;
    const bucket = byAtto.get(row.atto) ?? [];
    bucket.push(row);
    byAtto.set(row.atto, bucket);
  }

  const grouped: GroupedAct[] = [];
  for (const [attoUri, group] of byAtto) {
    const legMatch = attoUri.match(/ac(\d+)_(\d+)$/);
    if (!legMatch) continue;

    const latestPhase = [...group].sort((a, b) => (a.dataIter ?? '').localeCompare(b.dataIter ?? '')).at(-1)!;
    const voteRow = group.find((r) => r.favorevoli !== undefined);

    grouped.push({
      attoUri,
      legNumber: Number(legMatch[1]),
      numero: latestPhase.numero ?? legMatch[2],
      iniziativa: latestPhase.iniziativa ?? 'Parlamentare',
      presentazione: latestPhase.presentazione ?? '',
      titolo: latestPhase.titolo ?? '',
      fase: latestPhase.fase ?? '',
      dataIter: latestPhase.dataIter ?? latestPhase.presentazione ?? '',
      vote: voteRow
        ? {
            favorevoli: Number(voteRow.favorevoli),
            contrari: Number(voteRow.contrari),
            astenuti: Number(voteRow.astenuti),
            votanti: Number(voteRow.votanti),
          }
        : null,
    });
  }
  return grouped;
}

// ---------------------------------------------------------------------------
// 5. NORMALIZE INTO PRISMA-SHAPED RECORDS
// ---------------------------------------------------------------------------

type NormalizedArticle = {
  number: string;
  heading: string;
  original: string;
  structured: string;
  simple: string;
  impact?: {
    modifiedActCode: string;
    targetArticle: string;
    impactType: ImpactType;
    previousRuleSummary: string;
    newEffectSummary: string;
    officialSourceUrl?: string;
  };
};

type NormalizedAct = {
  id: string;
  code: string;
  formalTitle: string;
  officialTitle: string;
  popularTitle: string;
  summary: string;
  date: string;
  publishedAt: string | null;
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
  vote: Vote | null;
};

function normalizeAct(raw: GroupedAct): NormalizedAct {
  const cleanTitle = decodeEntities(raw.titolo);
  const decree = parseDecreeConversion(cleanTitle);
  const iniziativa = mapIniziativa(raw.iniziativa);
  const hasVote = raw.vote !== null;
  const iterStatus = deriveIterStatus(hasVote, cleanTitle, raw.fase);
  const materia = guessMateria(decree?.recante ?? cleanTitle);
  const copertura = guessCopertura(cleanTitle);
  const presentazioneIso = isoFromYyyymmdd(raw.presentazione);
  const dataIterIso = isoFromYyyymmdd(raw.dataIter);

  const code = `AC ${raw.numero}`;
  const id = `ac${raw.legNumber}-${raw.numero}`;
  const sourceUrl = raw.attoUri;
  const sourceLabel = 'Scheda atto ufficiale — Open Data Camera dei Deputati (dati.camera.it)';

  const date =
    decree ? `${decree.year}-${String(decree.month).padStart(2, '0')}-${String(decree.day).padStart(2, '0')}` : presentazioneIso ?? '2021-01-01';
  // Only claim a publication date once the record shows the act reached its
  // final, no-further-shuttle outcome — never fabricated for pending acts.
  const publishedAt = iterStatus === 'promulgata' ? dataIterIso : null;

  const formalTitle = decree
    ? `DECRETO-LEGGE ${decree.day} ${MONTH_NAMES_IT[decree.month - 1]} ${decree.year}, n. ${decree.decreeNumber}`
    : `${iniziativa === 'governo' ? 'Disegno di legge' : 'Proposta di legge'} — A.C. ${raw.numero}`;

  const popularTitle = (decree?.recante ?? cleanTitle).replace(/^["'"]+|["'"]+$/g, '').slice(0, 90);

  const ministry =
    iniziativa === 'governo'
      ? MINISTRY_BY_MATERIA[materia] ?? 'Presidenza del Consiglio dei Ministri'
      : 'Iniziativa parlamentare — nessun dicastero proponente';

  const financialNote =
    'Nota di ingestion automatica FASE 2: la classificazione della copertura finanziaria è desunta dal solo titolo ufficiale. ' +
    'Per il dettaglio della relazione tecnica occorre consultare il testo integrale sulla Gazzetta Ufficiale / Normattiva.';

  const preamble =
    iniziativa === 'governo' && decree
      ? 'IL PRESIDENTE DELLA REPUBBLICA\nVisti gli articoli 77 e 87 della Costituzione;\nRitenuta la straordinaria necessità e urgenza di adottare le disposizioni di cui al presente decreto;\nEmana il seguente decreto-legge, che sarà presentato alle Camere per la conversione in legge:'
      : 'Onorevoli Colleghi! — Il presente disegno di legge è sottoposto all’esame del Parlamento nelle forme previste dal regolamento della Camera dei deputati.';

  const urgencyBase = decree ? 75 : iniziativa === 'popolare' ? 25 : 35;
  const urgency = Math.min(95, urgencyBase + (iterStatus === 'promulgata' ? 10 : 0));

  const articles: NormalizedArticle[] = [
    {
      number: '1',
      heading: 'Oggetto e riferimenti ufficiali',
      original:
        `Testo integrale non ancora acquisito in questa fase di ingestion automatica (FASE 2 — solo metadati SPARQL). ` +
        `Riferimento ufficiale consultabile alla scheda: ${sourceUrl}`,
      structured: `Oggetto ufficiale, come riportato da Camera dei Deputati: «${cleanTitle}».`,
      simple: `Questo atto (${code}) riguarda: ${popularTitle}.`,
    },
    decree
      ? {
          number: '2',
          heading: 'Conversione in legge del decreto-legge',
          original:
            `Il presente disegno di legge dispone la conversione in legge${decree.conModificazioni ? ', con modificazioni,' : ''} ` +
            `del decreto-legge ${decree.day} ${MONTH_NAMES_IT[decree.month - 1]} ${decree.year}, n. ${decree.decreeNumber}. ` +
            `Testo integrale del decreto non ancora acquisito in questa fase di ingestion.`,
          structured:
            `Novella dichiarata dal titolo ufficiale: conversione${decree.conModificazioni ? ' con modificazioni' : ''} del D.L. ${decree.decreeNumber}/${decree.year}.`,
          simple: `Questo articolo trasforma in legge vera e propria il decreto-legge n. ${decree.decreeNumber}/${decree.year}${decree.conModificazioni ? ', con alcune modifiche fatte dal Parlamento' : ''}.`,
          impact: {
            modifiedActCode: `D.L. ${decree.decreeNumber}/${decree.year}`,
            targetArticle: 'Testo integrale del decreto-legge',
            impactType: 'integrazione' as ImpactType,
            previousRuleSummary: `Prima della conversione, la disciplina è dettata in via provvisoria dal decreto-legge n. ${decree.decreeNumber}/${decree.year}, soggetto a decadenza se non convertito entro 60 giorni.`,
            newEffectSummary: `La conversione${decree.conModificazioni ? ', con le modificazioni introdotte in sede parlamentare,' : ''} stabilizza in legge ordinaria le disposizioni recanti: ${decree.recante}.`,
            officialSourceUrl: sourceUrl,
          },
        }
      : {
          number: '2',
          heading: 'Iter parlamentare e stato dei lavori',
          original: `Stato dell'iter alla data del ${dataIterIso ?? raw.dataIter}: "${decodeEntities(raw.fase)}". Testo integrale non ancora acquisito in questa fase di ingestion.`,
          structured: `Fase corrente: ${decodeEntities(raw.fase) || 'non specificata'} (aggiornata al ${dataIterIso ?? raw.dataIter}).`,
          simple: `A che punto è questa proposta: ${decodeEntities(raw.fase) || 'non specificato'}.`,
        },
  ];

  if (raw.vote) {
    const { favorevoli, contrari, astenuti, votanti } = raw.vote;
    articles.push({
      number: '3',
      heading: 'Esito della votazione alla Camera',
      original: `Votazione finale alla Camera dei deputati: ${favorevoli} favorevoli, ${contrari} contrari, ${astenuti} astenuti, su ${votanti} votanti.`,
      structured: `Esito reale del voto finale (fonte: dati.camera.it/ocd:votazione): favorevoli ${favorevoli}, contrari ${contrari}, astenuti ${astenuti}, votanti ${votanti}.`,
      simple: `La Camera ha votato: ${favorevoli} a favore, ${contrari} contro, ${astenuti} astenuti.`,
    });
  }

  return {
    id,
    code,
    formalTitle,
    officialTitle: cleanTitle,
    popularTitle: popularTitle || cleanTitle.slice(0, 90),
    summary: cleanTitle,
    date,
    publishedAt,
    inForceAt: null, // not derivable from this endpoint — left honestly null rather than guessed
    sourceUrl,
    sourceLabel,
    iniziativa,
    materia,
    copertura,
    iterStatus,
    decreesMissing: 0, // decreto attuativo tracking is out of scope for this SPARQL-only phase
    decreeDeadline: null,
    financialNote,
    ministry,
    preamble,
    urgency,
    articles,
    vote: raw.vote,
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
    impacts: article.impact
      ? {
          create: [
            {
              modifiedActCode: article.impact.modifiedActCode,
              targetArticle: article.impact.targetArticle,
              impactType: article.impact.impactType,
              previousRuleSummary: article.impact.previousRuleSummary,
              newEffectSummary: article.impact.newEffectSummary,
              officialSourceUrl: article.impact.officialSourceUrl ?? null,
            },
          ],
        }
      : undefined,
  };
}

type Counters = { acts: number; articles: number; normImpacts: number; voteBreakdowns: number; errors: number };

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

  // Replace this act's articles wholesale on every run (cascade-clears their
  // NormImpact children too) — simplest way to keep re-ingestion idempotent
  // without diffing article-by-article.
  await prisma.article.deleteMany({ where: { actId: act.id } });
  for (const [index, article] of act.articles.entries()) {
    await prisma.article.create({ data: { actId: act.id, ...articleCreateInput(article, index) } });
    counters.articles += 1;
    if (article.impact) counters.normImpacts += 1;
  }

  if (act.vote) {
    const { favorevoli, contrari, astenuti, votanti } = act.vote;
    const total = Math.max(1, votanti);
    const vote = {
      favorevoli,
      contrari,
      astenuti,
      pctFav: Math.round((favorevoli / total) * 1000) / 10,
      pctCont: Math.round((contrari / total) * 1000) / 10,
      pctAst: Math.round((astenuti / total) * 1000) / 10,
    };
    await prisma.voteBreakdown.upsert({
      where: { actId: act.id },
      update: vote,
      create: { actId: act.id, ...vote },
    });
    counters.voteBreakdowns += 1;
  }
}

// ---------------------------------------------------------------------------
// 7. MAIN
// ---------------------------------------------------------------------------

async function fetchAndNormalize(label: string, query: string): Promise<NormalizedAct[]> {
  console.log(`Querying dati.camera.it/sparql — ${label}...`);
  const rows = await sparqlSelect(query);
  const grouped = groupRows(rows);
  console.log(`  -> ${rows.length} raw bindings, ${grouped.length} distinct acts.`);
  return grouped.map(normalizeAct);
}

async function main() {
  console.log('=== La Gazzetta Civica — FASE 2: Open Data Ingestion ===');
  console.log(`Endpoint: ${SPARQL_ENDPOINT}`);
  console.log(`Window: presentazione >= ${WINDOW_START} · Legislature XVIII/XIX\n`);

  const counters: Counters = { acts: 0, articles: 0, normImpacts: 0, voteBreakdowns: 0, errors: 0 };

  const [decreeActs, billActs] = await Promise.all([
    fetchAndNormalize('conversioni di decreto-legge', DECREE_QUERY),
    fetchAndNormalize('disegni/proposte di legge ordinari', BILL_QUERY),
  ]);

  const acts = [...decreeActs, ...billActs];
  console.log(`\nNormalized ${acts.length} acts total. Upserting into Supabase...\n`);

  for (const act of acts) {
    try {
      await persistAct(act, counters);
      counters.acts += 1;
      const voteTag = act.vote ? ` [voto: ${act.vote.favorevoli}-${act.vote.contrari}-${act.vote.astenuti}]` : '';
      console.log(`  [${counters.acts}/${acts.length}] ${act.code} (${act.iterStatus}) — ${act.popularTitle}${voteTag}`);
    } catch (error) {
      counters.errors += 1;
      console.error(`  !! Failed to upsert ${act.code} (${act.id}):`, error instanceof Error ? error.message : error);
    }
  }

  console.log('\n=== Ingestion summary ===');
  console.log(`Acts upserted:       ${counters.acts} / ${acts.length}`);
  console.log(`Articles inserted:   ${counters.articles}`);
  console.log(`NormImpacts created: ${counters.normImpacts}`);
  console.log(`VoteBreakdowns set:  ${counters.voteBreakdowns} (only for acts with a real recorded final vote)`);
  console.log(`Errors:              ${counters.errors}`);
}

main()
  .catch((error) => {
    console.error('Ingestion failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
