/**
 * FASE 2 — Open Data Ingestion Pipeline — Senato della Repubblica.
 *
 * Dedicated, isolated ingestion script (mirrors `scripts/ingest_parliament.ts`
 * for the Camera, but deliberately does not share code with it — each
 * chamber's Linked Open Data ontology is different enough to warrant its own
 * client/query/normalization logic) that pulls real Senate acts (`AS` codes)
 * for the XVIII/XIX Legislature, 2021-2026 window, from the official Senato
 * della Repubblica SPARQL endpoint (https://dati.senato.it/sparql, `osr:`
 * ontology — Ontologia Senato Repubblica) and upserts them into Supabase via
 * Prisma, including real roll-call tallies whenever a final vote is on record.
 *
 * ENDPOINT QUIRKS (discovered by hand while building this script):
 * 1. This endpoint's WAF returns HTTP 403 on every POST request regardless
 *    of client/headers (verified with both curl and Node's fetch) — unlike
 *    the Camera endpoint, so this script queries via GET (`?query=...`),
 *    which the SPARQL 1.1 protocol supports and which this endpoint accepts.
 * 2. The underlying (older) Virtuoso instance also silently returns an
 *    EMPTY result set — no error — whenever a `FILTER(?ramo = "...")` is
 *    combined with several other bound properties on `osr:Ddl` in the same
 *    query. There is no known clean workaround at the query level, so
 *    `ramo` is fetched as a plain variable and filtered to `"S"`
 *    (Senato-originated/currently-at-Senato readings) client-side in
 *    TypeScript instead of in SPARQL.
 *
 * HONESTY NOTE ON SCOPE (same principle as the Camera script): `osr:Ddl`
 * metadata gives us identity, dates, initiative, legislative status, and
 * (via a 2-hop `osr:Votazione -> osr:oggetto -> osr:OggettoTrattazione
 * -> osr:relativoA -> osr:Ddl` join) real roll-call counts — but not the
 * verbatim normative text of each article. Articles therefore ship with a
 * small, clearly-labelled "in attesa del testo integrale" scaffold built
 * only from real metadata, and `VoteBreakdown` rows are only written when a
 * vote with `esito = "approvato"` is actually found for that act — nothing
 * is invented for acts still pending a vote.
 *
 * Usage: npm run db:ingest:senato
 */
import { PrismaClient } from '@prisma/client';
import type { Copertura, ImpactType, Iniziativa, IterStatus, Materia } from '../src/data/mockActs';

const prisma = new PrismaClient();

const SPARQL_ENDPOINT = 'https://dati.senato.it/sparql';
const LEGISLATURES = [18, 19] as const;
const WINDOW_START = '2021-01-01'; // 2021-2026 ingestion window (osr:dataPresentazione is stored as YYYY-MM-DD)

// ---------------------------------------------------------------------------
// 1. SPARQL CLIENT
// ---------------------------------------------------------------------------

type SparqlBinding = Record<string, { type: string; value: string; datatype?: string }>;
type Row = Record<string, string | undefined>;

async function sparqlSelect(query: string): Promise<Row[]> {
  // GET, not POST — see ENDPOINT QUIRKS #1 above.
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/sparql-results+json' },
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
// 2. QUERIES
// ---------------------------------------------------------------------------

function ddlQuery(legislatura: number, wantDecree: boolean): string {
  return `
PREFIX osr: <http://dati.senato.it/osr/>
SELECT DISTINCT ?ddl ?idDdl ?titolo ?ramo ?natura ?statoDdl ?fase ?numeroFase ?dataPresentazione ?descrIniziativa
WHERE {
  ?ddl a osr:Ddl;
       osr:idDdl ?idDdl;
       osr:titolo ?titolo;
       osr:ramo ?ramo;
       osr:natura ?natura;
       osr:statoDdl ?statoDdl;
       osr:fase ?fase;
       osr:numeroFase ?numeroFase;
       osr:dataPresentazione ?dataPresentazione;
       osr:legislatura ${legislatura} .
  OPTIONAL { ?ddl osr:descrIniziativa ?descrIniziativa }
  FILTER(?dataPresentazione >= "${WINDOW_START}")
  FILTER(${wantDecree ? '' : '!'}CONTAINS(?titolo, "decreto-legge"))
}
ORDER BY DESC(?dataPresentazione)
LIMIT ${wantDecree ? 40 : 30}`;
}

/** Bounded lookup (via `FILTER(?ddl IN (...))`, never an unbounded scan) for
 * every recorded vote on any of the given ddl URIs, following the real
 * 2-hop path `Votazione -osr:oggetto-> OggettoTrattazione -osr:relativoA->
 * Ddl` — there is no direct Ddl<->Votazione property in this ontology. */
function voteQuery(ddlUris: string[]): string {
  const values = ddlUris.map((uri) => `<${uri}>`).join(', ');
  return `
PREFIX osr: <http://dati.senato.it/osr/>
SELECT ?ddl ?esito ?favorevoli ?contrari ?astenuti ?votanti
WHERE {
  ?ogg a osr:OggettoTrattazione; osr:relativoA ?ddl .
  ?v a osr:Votazione; osr:oggetto ?ogg; osr:esito ?esito;
     osr:favorevoli ?favorevoli; osr:contrari ?contrari; osr:astenuti ?astenuti; osr:votanti ?votanti.
  FILTER(?ddl IN (${values}))
}`;
}

// ---------------------------------------------------------------------------
// 3. NORMALIZATION HELPERS (deliberately duplicated from ingest_parliament.ts
//    rather than shared, per the "isolated ingestion scripts" requirement)
// ---------------------------------------------------------------------------

const MONTH_NAMES_IT = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

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
  return 'fisco';
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

/** Same official Camera/Senato phrasing as the Camera script's parser:
 * `"Conversione in legge[, con modificazioni,] del decreto-legge D mese
 * YYYY, n. N, recante <oggetto>"` — Senato titles arrive unquoted (no
 * wrapping `"..."`), but the inner phrasing is identical. */
function parseDecreeConversion(title: string): {
  day: number; month: number; year: number; decreeNumber: string; conModificazioni: boolean; recante: string;
} | null {
  const m = title.match(/decreto-legge\s+(\d{1,2})\s+([a-zà]+)\s+(\d{4}),?\s*n\.?\s*(\d+)/i);
  if (!m) return null;
  const monthIndex = MONTH_NAMES_IT.indexOf(m[2].toLowerCase());
  if (monthIndex === -1) return null;

  const recanteMatch = title.match(/recante\s+(.+)$/i);
  return {
    day: Number(m[1]),
    month: monthIndex + 1,
    year: Number(m[3]),
    decreeNumber: m[4],
    conModificazioni: /con modificazioni/i.test(title),
    recante: recanteMatch ? recanteMatch[1].trim() : title,
  };
}

function mapIniziativa(descrIniziativa: string | undefined, natura: string): Iniziativa {
  if (/popolare/i.test(natura)) return 'popolare';
  if (descrIniziativa && /^gov\./i.test(descrIniziativa.trim())) return 'governo';
  return 'parlamentare';
}

/** `statoDdl` is the Senato's own free-text current-status label (e.g.
 * `"da assegn. a commis."`, `"in corso di esame"`, `"approvato"`,
 * `"trasmesso alla Camera"`) — mapped onto our 4-value enum by keyword,
 * with the real recorded vote (when present) taking precedence since it's
 * stronger signal than the free-text label. */
function deriveIterStatus(hasApprovedVote: boolean, title: string, statoDdl: string): IterStatus {
  const lowerStato = statoDdl.toLowerCase();
  if (hasApprovedVote) {
    if (/con modificazioni/i.test(title)) return 'navetta_senato';
    if (/trasmess/.test(lowerStato)) return 'navetta_senato';
    return 'promulgata';
  }
  if (lowerStato.includes('aula')) return 'in_aula';
  if (lowerStato.includes('trasmess') || lowerStato.includes('camera')) return 'navetta_senato';
  return 'in_commissione';
}

// ---------------------------------------------------------------------------
// 4. RAW ROW -> NORMALIZED RECORD
// ---------------------------------------------------------------------------

type Vote = { favorevoli: number; contrari: number; astenuti: number; votanti: number };

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
  ddlUri: string;
  statoDdl: string;
  vote: Vote | null;
};

function normalizeRow(row: Row, legislatura: number): NormalizedAct | null {
  if (!row.ddl || !row.numeroFase || !row.titolo) return null;

  const title = row.titolo.trim();
  const decree = parseDecreeConversion(title);
  const natura = row.natura ?? '';
  const iniziativa = mapIniziativa(row.descrIniziativa, natura);
  const materia = guessMateria(decree?.recante ?? title);
  const copertura = guessCopertura(title);

  const code = `AS ${row.numeroFase}`;
  const id = `as${legislatura}-${row.numeroFase}`;
  const sourceUrl = row.ddl;
  const sourceLabel = 'Scheda atto ufficiale — Open Data Senato della Repubblica (dati.senato.it)';

  const date = decree
    ? `${decree.year}-${String(decree.month).padStart(2, '0')}-${String(decree.day).padStart(2, '0')}`
    : row.dataPresentazione ?? '2021-01-01';

  const formalTitle = decree
    ? `DECRETO-LEGGE ${decree.day} ${MONTH_NAMES_IT[decree.month - 1]} ${decree.year}, n. ${decree.decreeNumber}`
    : `${iniziativa === 'governo' ? 'Disegno di legge' : 'Proposta di legge'} — A.S. ${row.numeroFase}`;

  const popularTitle = (decree?.recante ?? title).replace(/^["'"]+|["'"]+$/g, '').slice(0, 90);

  const ministry =
    iniziativa === 'governo'
      ? MINISTRY_BY_MATERIA[materia] ?? 'Presidenza del Consiglio dei Ministri'
      : 'Iniziativa parlamentare — nessun dicastero proponente';

  const financialNote =
    'Nota di ingestion automatica FASE 2 (Senato): la classificazione della copertura finanziaria è desunta dal solo titolo ufficiale. ' +
    'Per il dettaglio della relazione tecnica occorre consultare il testo integrale sulla Gazzetta Ufficiale / Normattiva.';

  const preamble =
    iniziativa === 'governo' && decree
      ? 'IL PRESIDENTE DELLA REPUBBLICA\nVisti gli articoli 77 e 87 della Costituzione;\nRitenuta la straordinaria necessità e urgenza di adottare le disposizioni di cui al presente decreto;\nEmana il seguente decreto-legge, che sarà presentato alle Camere per la conversione in legge:'
      : 'Onorevoli Senatori! — Il presente disegno di legge è sottoposto all’esame del Senato della Repubblica nelle forme previste dal regolamento.';

  const urgencyBase = decree ? 75 : iniziativa === 'popolare' ? 25 : 35;

  const articles: NormalizedArticle[] = [
    {
      number: '1',
      heading: 'Oggetto e riferimenti ufficiali',
      original:
        `Testo integrale non ancora acquisito in questa fase di ingestion automatica (FASE 2 — solo metadati SPARQL). ` +
        `Riferimento ufficiale consultabile alla scheda: ${sourceUrl}`,
      structured: `Oggetto ufficiale, come riportato da Senato della Repubblica: «${title}».`,
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
          structured: `Novella dichiarata dal titolo ufficiale: conversione${decree.conModificazioni ? ' con modificazioni' : ''} del D.L. ${decree.decreeNumber}/${decree.year}.`,
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
          original: `Stato dell'iter presso il Senato: "${row.statoDdl ?? 'non specificato'}". Testo integrale non ancora acquisito in questa fase di ingestion.`,
          structured: `Fase corrente: ${row.statoDdl ?? 'non specificata'} — natura: ${natura || 'non specificata'}.`,
          simple: `A che punto è questa proposta: ${row.statoDdl ?? 'non specificato'}.`,
        },
  ];

  return {
    id,
    code,
    formalTitle,
    officialTitle: title,
    popularTitle: popularTitle || title.slice(0, 90),
    summary: title,
    date,
    publishedAt: null, // set once a real approved vote is matched, see attachVote()
    inForceAt: null, // not derivable from this endpoint — left honestly null rather than guessed
    sourceUrl,
    sourceLabel,
    iniziativa,
    materia,
    copertura,
    iterStatus: deriveIterStatus(false, title, row.statoDdl ?? ''), // refined in attachVote() once votes are known
    decreesMissing: 0, // decreto attuativo tracking is out of scope for this SPARQL-only phase
    decreeDeadline: null,
    financialNote,
    ministry,
    preamble,
    urgency: urgencyBase,
    articles,
    ddlUri: row.ddl,
    statoDdl: row.statoDdl ?? '',
    vote: null,
  };
}

/** Applies a real, previously-looked-up vote (if any) to a normalized act,
 * re-deriving `iterStatus`/`publishedAt`/`urgency` and appending the vote
 * outcome as a 3rd article — mirrors the Camera script's honesty rule that
 * `VoteBreakdown` is only ever populated from a genuine recorded vote. */
function attachVote(act: NormalizedAct, vote: Vote | null): NormalizedAct {
  if (!vote) return act;

  const iterStatus = deriveIterStatus(true, act.officialTitle, act.statoDdl);
  const articles = [
    ...act.articles,
    {
      number: '3',
      heading: 'Esito della votazione al Senato',
      original: `Votazione finale al Senato della Repubblica: ${vote.favorevoli} favorevoli, ${vote.contrari} contrari, ${vote.astenuti} astenuti, su ${vote.votanti} votanti.`,
      structured: `Esito reale del voto finale (fonte: dati.senato.it/osr:Votazione): favorevoli ${vote.favorevoli}, contrari ${vote.contrari}, astenuti ${vote.astenuti}, votanti ${vote.votanti}.`,
      simple: `Il Senato ha votato: ${vote.favorevoli} a favore, ${vote.contrari} contro, ${vote.astenuti} astenuti.`,
    },
  ];

  return {
    ...act,
    iterStatus,
    publishedAt: iterStatus === 'promulgata' ? act.date : null,
    urgency: Math.min(95, act.urgency + 10),
    articles,
    vote,
  };
}

// ---------------------------------------------------------------------------
// 5. PERSISTENCE (idempotent upserts)
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
// 6. MAIN
// ---------------------------------------------------------------------------

async function fetchLegislature(legislatura: number): Promise<NormalizedAct[]> {
  const [decreeRows, billRows] = await Promise.all([
    sparqlSelect(ddlQuery(legislatura, true)),
    sparqlSelect(ddlQuery(legislatura, false)),
  ]);

  // `osr:ramo` filtering is done here, client-side, rather than in SPARQL —
  // see the ENDPOINT QUIRK note at the top of this file.
  const senatoRows = [...decreeRows, ...billRows].filter((row) => row.ramo === 'S');
  return senatoRows
    .map((row) => normalizeRow(row, legislatura))
    .filter((act): act is NormalizedAct => act !== null);
}

async function attachRealVotes(acts: NormalizedAct[]): Promise<NormalizedAct[]> {
  if (acts.length === 0) return acts;

  const rows = await sparqlSelect(voteQuery(acts.map((act) => act.ddlUri)));
  const bestVoteByDdl = new Map<string, Vote>();
  for (const row of rows) {
    if (!row.ddl || row.esito !== 'approvato') continue;
    const candidate: Vote = {
      favorevoli: Number(row.favorevoli),
      contrari: Number(row.contrari),
      astenuti: Number(row.astenuti),
      votanti: Number(row.votanti),
    };
    // A ddl can have many "approvato" votes (one per article/amendment); the
    // one with the highest turnout is the best proxy we have for "the" final
    // whole-text passage vote, since Senato doesn't expose a `tipoVotazione`
    // flag that cleanly distinguishes final reading from partial votes.
    const existing = bestVoteByDdl.get(row.ddl);
    if (!existing || candidate.votanti > existing.votanti) bestVoteByDdl.set(row.ddl, candidate);
  }

  return acts.map((act) => attachVote(act, bestVoteByDdl.get(act.ddlUri) ?? null));
}

async function main() {
  console.log('=== La Gazzetta Civica — FASE 2: Senato della Repubblica Ingestion ===');
  console.log(`Endpoint: ${SPARQL_ENDPOINT}`);
  console.log(`Window: dataPresentazione >= ${WINDOW_START} · Legislature XVIII/XIX\n`);

  const counters: Counters = { acts: 0, articles: 0, normImpacts: 0, voteBreakdowns: 0, errors: 0 };

  let acts: NormalizedAct[] = [];
  for (const legislatura of LEGISLATURES) {
    console.log(`Querying dati.senato.it/sparql — legislatura ${legislatura}...`);
    const legActs = await fetchLegislature(legislatura);
    console.log(`  -> ${legActs.length} Senate-side (ramo=S) acts.`);
    acts = [...acts, ...legActs];
  }

  console.log(`\nLooking up real roll-call votes for ${acts.length} acts...`);
  acts = await attachRealVotes(acts);

  console.log(`\nNormalized ${acts.length} Senate acts total. Upserting into Supabase...\n`);

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

  console.log('\n=== Senato ingestion summary ===');
  console.log(`Senate Acts upserted: ${counters.acts} / ${acts.length}`);
  console.log(`Articles inserted:    ${counters.articles}`);
  console.log(`NormImpacts created:  ${counters.normImpacts}`);
  console.log(`VoteBreakdowns set:   ${counters.voteBreakdowns} (only for acts with a real recorded final vote)`);
  console.log(`Errors:               ${counters.errors}`);
}

main()
  .catch((error) => {
    console.error('Senato ingestion failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
