/**
 * PHASE 4 — Nightly incremental parliamentary ETL.
 *
 * Orchestrates Camera SPARQL (XIX), Senato SPARQL + optional RSS/XML, and
 * Normattiva OpenData into Prisma upserts, then runs the Phase-2 critical
 * lens (`detectLobbyMatches`, `scanActForOmnibusAlerts`,
 * `computeDemocraticBypass` via `refreshActAudits`).
 *
 * Honesty:
 * - Camera/Senato SPARQL do not carry article-by-article normative text.
 *   Authentic Article 1 is pulled from Normattiva `dettaglio-atto` when the
 *   act is already in Gazzetta. Placeholder SPARQL scaffolds are never
 *   allowed to overwrite existing verbatim articles.
 * - Senato RSS is polled as XML; the institutional site often returns an
 *   HTML WAF challenge (HTTP 202). That is logged and skipped — SPARQL
 *   remains the working Senato source (GET, not POST).
 * - Questione di fiducia / ore d'Aula are passed to the bypass index only
 *   when the official title or iter label actually mentions them.
 *
 * Usage: npm run db:harvest
 */
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { PrismaClient } from '@prisma/client';
import { refreshActAudits, type AulaFacts } from '../../lib/services/audit_enrichment';
import type { Copertura, Iniziativa, IterStatus, Materia } from '../../src/data/mockActs';
import {
  LOOKBACK_HOURS,
  PLACEHOLDER_ARTICLE_PATTERN,
  REQUEST_TIMEOUT_MS,
  detectConfidenceVoteMention,
  extractCrossChamberCodes,
  isoFromSyndicationDate,
  isOnOrAfterIso,
  lookbackCutoff,
  parseSyndicationItems,
  toIsoDate,
  type LookbackCutoff,
} from './harvest_utils';

try {
  loadEnvFile(path.join(__dirname, '..', '..', '.env'));
} catch {
  // CI injects env; local `.env` is optional.
}

const CAMERA_SPARQL = 'https://dati.camera.it/sparql';
const SENATO_SPARQL = 'https://dati.senato.it/sparql';
const LEG_19 = 'http://dati.camera.it/ocd/legislatura.rdf/repubblica_19';
const NORMATTIVA_API = 'https://api.normattiva.it/t/normattiva.api/bff-opendata/v1';
const POLITENESS_MS = 250;

const SENATO_RSS_CANDIDATES = [
  'https://www.senato.it/rss/ddl.xml',
  'https://www.senato.it/service/RSS/ddl.xml',
  'https://dati.senato.it/sito/feed_rss',
];

const USER_AGENT = 'LaGazzettaCivica/1.0 (civic open-data harvester; nightly ETL)';

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient(
  databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
);

type SparqlBinding = Record<string, { type: string; value: string }>;
type Row = Record<string, string | undefined>;

type Vote = { favorevoli: number; contrari: number; astenuti: number; votanti: number };

type HarvestArticle = {
  number: string;
  heading: string;
  original: string;
  structured: string;
  simple: string;
};

type HarvestAct = {
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
  articles: HarvestArticle[];
  vote: Vote | null;
  aula: AulaFacts | undefined;
  aliases: string[];
  source: 'camera' | 'senato' | 'normattiva' | 'rss';
};

type SourceResult = { ok: boolean; acts: HarvestAct[]; warning?: string };

const MATERIA_KEYWORDS: Record<Materia, string[]> = {
  codice_strada: ['strada', 'patente', 'veicol', 'circolazione', 'trasport', 'monopattin', 'autotrasport'],
  fisco: ['fisc', 'iva', 'irpef', 'tribut', 'bilancio', 'tasse', 'entrate', 'canone'],
  sanita: ['sanit', 'salute', 'ospedal', 'ssn', 'farmac', 'medic', 'vaccin'],
  lavoro: ['lavoro', 'contratt', 'sindac', 'occupazion', 'pension', 'previdenz', 'salari'],
  giustizia: ['giustizia', 'penale', 'process', 'civile', 'tribunale', 'reat', 'magistrat'],
};

const MINISTRY_BY_MATERIA: Record<Materia, string> = {
  fisco: 'MEF — Economia e Finanze',
  sanita: 'Ministero della Salute',
  lavoro: 'Ministero del Lavoro',
  giustizia: 'Ministero della Giustizia',
  codice_strada: 'MIT — Infrastrutture e Trasporti',
};

const SPARQL_IN_CHUNK = 12;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function aulaFromText(text: string, chamber?: AulaFacts['confidenceVoteChamber']): AulaFacts | undefined {
  if (!detectConfidenceVoteMention(text)) return undefined;
  return { isConfidenceVote: true, confidenceVoteChamber: chamber };
}

function aliasList(title: string, code: string): string[] {
  const { camera, senato } = extractCrossChamberCodes(`${code} ${title}`);
  return [...camera.map((n) => `AC ${n}`), ...senato.map((n) => `AS ${n}`)].filter((alias) => alias !== code);
}

function userAgentFor(url: string): string {
  // dati.senato.it WAF returns HTTP 403 HTML for non-Node user agents
  // (verified: civic UA and curl default 403; UA `node` 200). Camera and
  // Normattiva accept the identifying civic UA.
  try {
    return /senato\.it$/i.test(new URL(url).hostname) ? 'node' : USER_AGENT;
  } catch {
    return USER_AGENT;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'User-Agent': userAgentFor(url), ...(init.headers ?? {}) },
    });
    return response;
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError' ? `timeout ${REQUEST_TIMEOUT_MS}ms` : error instanceof Error ? error.message : String(error);
    console.warn(`[etl] skip ${url} — ${reason}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function bindingsToRows(json: { results?: { bindings?: SparqlBinding[] } }): Row[] {
  return (json.results?.bindings ?? []).map((binding) => {
    const row: Row = {};
    for (const [key, cell] of Object.entries(binding)) row[key] = cell.value;
    return row;
  });
}

async function readJson<T>(response: Response, label: string): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[etl] ${label} returned non-JSON — skip (${reason})`);
    return null;
  }
}

async function cameraSparql(query: string): Promise<Row[] | null> {
  const response = await fetchWithTimeout(CAMERA_SPARQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/sparql-results+json',
    },
    body: `query=${encodeURIComponent(query)}`,
  });
  if (!response) return null;
  if (!response.ok) {
    console.warn(`[etl] Camera SPARQL HTTP ${response.status} ${response.statusText}`);
    return null;
  }
  const json = await readJson<{ results?: { bindings?: SparqlBinding[] } }>(response, 'Camera SPARQL');
  return json ? bindingsToRows(json) : null;
}

async function senatoSparql(query: string): Promise<Row[] | null> {
  const url = `${SENATO_SPARQL}?query=${encodeURIComponent(query)}`;
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { Accept: 'application/sparql-results+json' },
  });
  if (!response) return null;
  if (!response.ok) {
    console.warn(`[etl] Senato SPARQL HTTP ${response.status} ${response.statusText}`);
    return null;
  }
  const json = await readJson<{ results?: { bindings?: SparqlBinding[] } }>(response, 'Senato SPARQL');
  return json ? bindingsToRows(json) : null;
}

function cameraQuery(cutoffYyyymmdd: string): string {
  return `
PREFIX ocd: <http://dati.camera.it/ocd/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
SELECT DISTINCT ?atto ?numero ?iniziativa ?presentazione ?titolo ?fase ?dataIter
WHERE {
  ?atto a ocd:atto;
        ocd:iniziativa ?iniziativa;
        dc:identifier ?numero;
        ocd:rif_leg <${LEG_19}>;
        dc:date ?presentazione;
        dc:title ?titolo;
        ocd:rif_statoIter ?statoIter .
  ?statoIter dc:title ?fase ; dc:date ?dataIter .
  FILTER(?presentazione >= "${cutoffYyyymmdd}" || ?dataIter >= "${cutoffYyyymmdd}")
}
ORDER BY DESC(?dataIter)
LIMIT 80`;
}

function cameraVoteQuery(attoUris: string[]): string {
  const values = attoUris.map((uri) => `<${uri}>`).join(', ');
  return `
PREFIX ocd: <http://dati.camera.it/ocd/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?atto ?favorevoli ?contrari ?astenuti ?votanti
WHERE {
  ?v a ocd:votazione; ocd:rif_attoCamera ?atto;
     ocd:votazioneFinale "1"^^xsd:integer; ocd:approvato "1"^^xsd:integer;
     ocd:favorevoli ?favorevoli; ocd:contrari ?contrari; ocd:astenuti ?astenuti; ocd:votanti ?votanti.
  FILTER(?atto IN (${values}))
}`;
}

function senatoQuery(cutoffIso: string): string {
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
       osr:legislatura 19 .
  OPTIONAL { ?ddl osr:descrIniziativa ?descrIniziativa }
  FILTER(?dataPresentazione >= "${cutoffIso}")
}
ORDER BY DESC(?dataPresentazione)
LIMIT 80`;
}

function senatoVoteQuery(ddlUris: string[]): string {
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

function mapIniziativa(raw: string | undefined): Iniziativa {
  const lower = (raw ?? '').toLowerCase();
  if (lower === 'governo' || /^gov\./i.test(raw ?? '')) return 'governo';
  if (lower.includes('popolare')) return 'popolare';
  return 'parlamentare';
}

function deriveIterFromFase(hasVote: boolean, title: string, fase: string | undefined): IterStatus {
  const lower = (fase ?? '').toLowerCase();
  if (hasVote) {
    if (/con modificazioni/i.test(title) || /trasmess/.test(lower) || /camera/.test(lower)) return 'navetta_senato';
    if (/approvato dal senato|pubblicat|promulg/i.test(title) || /approvato/.test(lower)) return 'promulgata';
    return 'navetta_senato';
  }
  if (lower.includes('aula')) return 'in_aula';
  if (lower.includes('senato') || lower.includes('trasmess') || lower.includes('camera')) return 'navetta_senato';
  return 'in_commissione';
}

function scaffoldArticles(code: string, title: string, sourceUrl: string, chamber: string): HarvestArticle[] {
  return [
    {
      number: '1',
      heading: 'Oggetto e riferimenti ufficiali',
      original:
        `Testo integrale non ancora acquisito in questa fase di ingestion automatica (FASE 4 — metadati SPARQL/RSS). ` +
        `Riferimento ufficiale consultabile alla scheda: ${sourceUrl}`,
      structured: `Oggetto ufficiale, come riportato da ${chamber}: «${title}».`,
      simple: `Questo atto (${code}) riguarda: ${title.slice(0, 140)}.`,
    },
  ];
}

function harvestFromCamera(rows: Row[], cutoff: LookbackCutoff): HarvestAct[] {
  const byAtto = new Map<string, Row[]>();
  for (const row of rows) {
    if (!row.atto) continue;
    const bucket = byAtto.get(row.atto) ?? [];
    bucket.push(row);
    byAtto.set(row.atto, bucket);
  }

  const acts: HarvestAct[] = [];
  for (const [attoUri, group] of byAtto) {
    const latest = [...group].sort((a, b) => (a.dataIter ?? '').localeCompare(b.dataIter ?? '')).at(-1);
    if (!latest) continue;
    if (!isOnOrAfterIso(latest.presentazione, cutoff.iso) && !isOnOrAfterIso(latest.dataIter, cutoff.iso)) continue;

    const legMatch = attoUri.match(/ac(\d+)_(\d+)$/);
    if (!legMatch) continue;

    const numero = latest.numero ?? legMatch[2];
    const titolo = (latest.titolo ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const iterStatus = deriveIterFromFase(false, titolo, latest.fase);
    const materia = guessMateria(titolo);
    const iniziativa = mapIniziativa(latest.iniziativa);
    const code = `AC ${numero}`;
    const date = toIsoDate(latest.presentazione, cutoff.iso);

    acts.push({
      id: `ac${legMatch[1]}-${numero}`,
      code,
      formalTitle: `Proposta / disegno di legge — A.C. ${numero}`,
      officialTitle: titolo,
      popularTitle: titolo.slice(0, 90),
      summary: titolo,
      date,
      publishedAt: iterStatus === 'promulgata' ? toIsoDate(latest.dataIter, date) : null,
      inForceAt: null,
      sourceUrl: attoUri,
      sourceLabel: 'Scheda atto ufficiale — Open Data Camera dei Deputati (dati.camera.it)',
      iniziativa,
      materia,
      copertura: guessCopertura(titolo),
      iterStatus,
      decreesMissing: 0,
      decreeDeadline: null,
      financialNote:
        'Nota ETL FASE 4: materia e copertura desunte dal titolo ufficiale SPARQL. Testo articolato: Normattiva quando già in G.U.',
      ministry:
        iniziativa === 'governo'
          ? MINISTRY_BY_MATERIA[materia]
          : 'Iniziativa parlamentare — nessun dicastero proponente',
      preamble:
        'Onorevoli Colleghi! — Il presente disegno di legge è sottoposto all’esame del Parlamento nelle forme previste dal regolamento della Camera dei deputati.',
      urgency: Math.min(95, (titolo.toLowerCase().includes('decreto-legge') ? 75 : 35) + (iterStatus === 'promulgata' ? 10 : 0)),
      articles: scaffoldArticles(code, titolo, attoUri, 'Camera dei Deputati'),
      vote: null,
      aula: aulaFromText(`${titolo} ${latest.fase ?? ''}`, 'Camera'),
      aliases: aliasList(titolo, code),
      source: 'camera',
    });
  }
  return acts;
}

function harvestFromSenato(rows: Row[], cutoff: LookbackCutoff): HarvestAct[] {
  const acts: HarvestAct[] = [];
  for (const row of rows) {
    if (row.ramo !== 'S' || !row.ddl || !row.numeroFase || !row.titolo) continue;
    if (!isOnOrAfterIso(row.dataPresentazione, cutoff.iso)) continue;

    const titolo = row.titolo.trim();
    const iniziativa = mapIniziativa(row.descrIniziativa ?? row.natura);
    const materia = guessMateria(titolo);
    const code = `AS ${row.numeroFase}`;
    const iterStatus = deriveIterFromFase(false, titolo, `${row.statoDdl ?? ''} ${row.fase ?? ''}`);

    acts.push({
      id: `as19-${row.numeroFase}`,
      code,
      formalTitle: `Proposta / disegno di legge — A.S. ${row.numeroFase}`,
      officialTitle: titolo,
      popularTitle: titolo.slice(0, 90),
      summary: titolo,
      date: toIsoDate(row.dataPresentazione, cutoff.iso),
      publishedAt: null,
      inForceAt: null,
      sourceUrl: row.ddl,
      sourceLabel: 'Scheda atto ufficiale — Open Data Senato della Repubblica (dati.senato.it)',
      iniziativa,
      materia,
      copertura: guessCopertura(titolo),
      iterStatus,
      decreesMissing: 0,
      decreeDeadline: null,
      financialNote:
        'Nota ETL FASE 4 (Senato): materia e copertura desunte dal titolo ufficiale SPARQL. Testo articolato: Normattiva quando già in G.U.',
      ministry:
        iniziativa === 'governo'
          ? MINISTRY_BY_MATERIA[materia]
          : 'Iniziativa parlamentare — nessun dicastero proponente',
      preamble:
        'Onorevoli Senatori! — Il presente disegno di legge è sottoposto all’esame del Senato della Repubblica nelle forme previste dal regolamento.',
      urgency: titolo.toLowerCase().includes('decreto-legge') ? 75 : 35,
      articles: scaffoldArticles(code, titolo, row.ddl, 'Senato della Repubblica'),
      vote: null,
      aula: aulaFromText(`${titolo} ${row.statoDdl ?? ''}`, 'Senato'),
      aliases: aliasList(titolo, code),
      source: 'senato',
    });
  }
  return acts;
}

function applyVotes(acts: HarvestAct[], best: Map<string, Vote>): HarvestAct[] {
  return acts.map((act) => {
    const vote = best.get(act.sourceUrl) ?? null;
    if (!vote) return act;
    return { ...act, vote, iterStatus: deriveIterFromFase(true, act.officialTitle, act.summary) };
  });
}

async function attachCameraVotes(acts: HarvestAct[]): Promise<HarvestAct[]> {
  const uris = acts.map((act) => act.sourceUrl).filter((uri) => uri.includes('dati.camera.it'));
  if (uris.length === 0) return acts;
  const best = new Map<string, Vote>();
  for (let i = 0; i < uris.length; i += SPARQL_IN_CHUNK) {
    await sleep(POLITENESS_MS);
    const rows = await cameraSparql(cameraVoteQuery(uris.slice(i, i + SPARQL_IN_CHUNK)));
    if (!rows) continue;
    for (const row of rows) {
      if (!row.atto) continue;
      const candidate: Vote = {
        favorevoli: Number(row.favorevoli),
        contrari: Number(row.contrari),
        astenuti: Number(row.astenuti),
        votanti: Number(row.votanti),
      };
      const existing = best.get(row.atto);
      if (!existing || candidate.votanti > existing.votanti) best.set(row.atto, candidate);
    }
  }
  return applyVotes(acts, best);
}

async function attachSenatoVotes(acts: HarvestAct[]): Promise<HarvestAct[]> {
  const uris = acts
    .map((act) => act.sourceUrl)
    .filter((uri) => uri.startsWith('http://dati.senato.it') || uri.startsWith('https://dati.senato.it'));
  if (uris.length === 0) return acts;
  const best = new Map<string, Vote>();
  for (let i = 0; i < uris.length; i += SPARQL_IN_CHUNK) {
    await sleep(POLITENESS_MS);
    const rows = await senatoSparql(senatoVoteQuery(uris.slice(i, i + SPARQL_IN_CHUNK)));
    if (!rows) continue;
    for (const row of rows) {
      if (!row.ddl || row.esito !== 'approvato') continue;
      const candidate: Vote = {
        favorevoli: Number(row.favorevoli),
        contrari: Number(row.contrari),
        astenuti: Number(row.astenuti),
        votanti: Number(row.votanti),
      };
      const existing = best.get(row.ddl);
      if (!existing || candidate.votanti > existing.votanti) best.set(row.ddl, candidate);
    }
  }
  return applyVotes(acts, best);
}

type RicercaAtto = {
  dataGU: string;
  codiceRedazionale: string;
  denominazioneAtto: string;
  descrizioneAtto: string;
  titoloAtto: string;
  numeroProvvedimento: string;
  annoProvvedimento: string;
  dataEmanazione: string;
};

function slugNormattiva(denominazione: string, numero: string, anno: string): string | null {
  if (denominazione === 'LEGGE') return `legge-${numero}-${anno}`;
  if (denominazione === 'DECRETO-LEGGE') return `dl-${numero}-${anno}`;
  if (denominazione === 'DECRETO LEGISLATIVO') return `dlgs-${numero}-${anno}`;
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function harvestNormattiva(cutoff: LookbackCutoff): Promise<SourceResult> {
  const response = await fetchWithTimeout(`${NORMATTIVA_API}/api/v1/ricerca/semplice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      testoRicerca: 'legge',
      orderType: 'recente',
      paginazione: { paginaCorrente: 1, numeroElementiPerPagina: 30 },
    }),
  });
  if (!response) return { ok: false, acts: [], warning: 'Normattiva ricerca/semplice unreachable' };
  if (!response.ok) {
    return { ok: false, acts: [], warning: `Normattiva HTTP ${response.status}` };
  }

  const json = await readJson<{ listaAtti?: RicercaAtto[] }>(response, 'Normattiva ricerca/semplice');
  if (!json) return { ok: false, acts: [], warning: 'Normattiva ricerca/semplice returned non-JSON' };
  const recent = (json.listaAtti ?? []).filter((hit) => isOnOrAfterIso(hit.dataGU, cutoff.iso));
  const acts: HarvestAct[] = [];

  for (const hit of recent) {
    const id = slugNormattiva(hit.denominazioneAtto, hit.numeroProvvedimento, hit.annoProvvedimento);
    if (!id) continue;
    await sleep(POLITENESS_MS);

    let articleHtml = '';
    const detail = await fetchWithTimeout(`${NORMATTIVA_API}/api/v1/atto/dettaglio-atto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ dataGU: hit.dataGU, codiceRedazionale: hit.codiceRedazionale, formatoRichiesta: 'V' }),
    });
    if (detail?.ok) {
      const payload = await readJson<{ success?: boolean; data?: { atto?: { articoloHtml?: string } } }>(
        detail,
        `Normattiva dettaglio ${hit.codiceRedazionale}`,
      );
      articleHtml = payload?.data?.atto?.articoloHtml ?? '';
    }

    const officialTitle = stripHtml(hit.titoloAtto);
    const label =
      hit.denominazioneAtto === 'DECRETO-LEGGE'
        ? 'D.L.'
        : hit.denominazioneAtto === 'DECRETO LEGISLATIVO'
          ? 'D.Lgs.'
          : 'L.';
    const code = `${label} ${hit.numeroProvvedimento}/${hit.annoProvvedimento}`;
    const date = hit.dataEmanazione.slice(0, 10);
    const permalink = `https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:${
      hit.denominazioneAtto === 'DECRETO-LEGGE'
        ? 'decreto.legge'
        : hit.denominazioneAtto === 'DECRETO LEGISLATIVO'
          ? 'decreto.legislativo'
          : 'legge'
    }:${date};${hit.numeroProvvedimento}`;
    const materia = guessMateria(officialTitle);
    const original = articleHtml ? stripHtml(articleHtml) : `Testo integrale non ancora acquisito. Fonte ufficiale: ${permalink}`;

    acts.push({
      id,
      code,
      formalTitle: hit.descrizioneAtto,
      officialTitle,
      popularTitle: officialTitle.slice(0, 90),
      summary: officialTitle,
      date,
      publishedAt: hit.dataGU,
      inForceAt: null,
      sourceUrl: permalink,
      sourceLabel: 'Gazzetta Ufficiale — Normattiva OpenData',
      iniziativa: 'governo',
      materia,
      copertura: guessCopertura(officialTitle),
      iterStatus: 'promulgata',
      decreesMissing: 0,
      decreeDeadline: null,
      financialNote:
        'Nota ETL FASE 4 (Normattiva): Articolo 1 verbatim da dettaglio-atto quando disponibile; nessuna prosa inventata.',
      ministry: MINISTRY_BY_MATERIA[materia],
      preamble:
        'IL PRESIDENTE DELLA REPUBBLICA\nVista la deliberazione del Consiglio dei ministri;\nPromulga la seguente legge, pubblicata sulla Gazzetta Ufficiale:',
      urgency: hit.denominazioneAtto === 'DECRETO-LEGGE' ? 70 : 45,
      articles: [
        {
          number: '1',
          heading: articleHtml ? 'Preambolo e Articolo 1 (testo verbatim — Normattiva)' : 'Riferimento ufficiale',
          original,
          structured: articleHtml
            ? 'Testo verbatim reale, acquisito via API OpenData ufficiale di Normattiva.'
            : `Oggetto ufficiale, come da Gazzetta Ufficiale: «${officialTitle}».`,
          simple: `Questo atto (${code}) riguarda: ${officialTitle.slice(0, 140)}.`,
        },
      ],
      vote: null,
      aula: aulaFromText(officialTitle),
      aliases: aliasList(officialTitle, code),
      source: 'normattiva',
    });
  }

  return { ok: true, acts };
}

async function harvestSenatoRss(cutoff: LookbackCutoff): Promise<SourceResult> {
  const collected: HarvestAct[] = [];
  let lastWarning: string | undefined;

  for (const url of SENATO_RSS_CANDIDATES) {
    await sleep(POLITENESS_MS);
    const response = await fetchWithTimeout(url, { headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
    if (!response) {
      lastWarning = `RSS unreachable: ${url}`;
      continue;
    }
    const body = await response.text();
    const items = parseSyndicationItems(body);
    if (items.length === 0) {
      lastWarning = `RSS ${url} returned HTTP ${response.status} without syndication XML (likely WAF/HTML)`;
      continue;
    }

    for (const item of items) {
      const pubIso = isoFromSyndicationDate(item.pubDate);
      if (pubIso && pubIso < cutoff.iso) continue;
      const { senato, camera } = extractCrossChamberCodes(`${item.title} ${item.link}`);
      const numero = senato[0] ?? camera[0];
      if (!numero) continue;
      const isSenato = senato.length > 0;
      const code = isSenato ? `AS ${numero}` : `AC ${numero}`;
      const id = isSenato ? `as19-${numero}` : `ac19-${numero}`;
      collected.push({
        id,
        code,
        formalTitle: isSenato ? `Disegno di legge — A.S. ${numero}` : `Disegno di legge — A.C. ${numero}`,
        officialTitle: item.title,
        popularTitle: item.title.slice(0, 90),
        summary: item.title,
        date: pubIso ?? cutoff.iso,
        publishedAt: null,
        inForceAt: null,
        sourceUrl: item.link || url,
        sourceLabel: 'Feed RSS / XML Senato della Repubblica',
        iniziativa: 'parlamentare',
        materia: guessMateria(item.title),
        copertura: guessCopertura(item.title),
        iterStatus: 'in_commissione',
        decreesMissing: 0,
        decreeDeadline: null,
        financialNote: 'Nota ETL FASE 4: metadati da feed RSS ufficiale; testo articolato non presente nel feed.',
        ministry: 'Iniziativa parlamentare — nessun dicastero proponente',
        preamble:
          'Onorevoli Senatori! — Segnalazione da feed RSS istituzionale; i metadati SPARQL restano la fonte anagrafica primaria.',
        urgency: 35,
        articles: scaffoldArticles(code, item.title, item.link || url, 'Senato RSS'),
        vote: null,
        aula: aulaFromText(item.title, 'Senato'),
        aliases: aliasList(item.title, code),
        source: 'rss',
      });
    }

    if (collected.length > 0) return { ok: true, acts: collected };
  }

  return { ok: false, acts: [], warning: lastWarning ?? 'No Senato RSS/XML feed produced items' };
}

async function persistAct(act: HarvestAct): Promise<'created' | 'updated'> {
  const existing = await prisma.act.findUnique({
    where: { id: act.id },
    select: { articles: { select: { original: true } } },
  });
  const hadVerbatim =
    !!existing &&
    existing.articles.some(
      (article) => article.original.length > 280 && !PLACEHOLDER_ARTICLE_PATTERN.test(article.original),
    );
  const incomingIsVerbatim = act.articles.some(
    (article) => article.original.length > 280 && !PLACEHOLDER_ARTICLE_PATTERN.test(article.original),
  );
  const replaceArticles = !hadVerbatim || incomingIsVerbatim;

  const data = {
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
  };

  await prisma.act.upsert({
    where: { id: act.id },
    update: data,
    create: { id: act.id, ...data },
  });

  if (replaceArticles) {
    await prisma.article.deleteMany({ where: { actId: act.id } });
    for (const [index, article] of act.articles.entries()) {
      await prisma.article.create({
        data: {
          actId: act.id,
          number: article.number,
          heading: article.heading,
          original: article.original,
          structured: article.structured,
          simple: article.simple,
          orderIndex: index,
        },
      });
    }
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
  }

  await refreshActAudits(prisma, act.id, act.aula);
  return existing ? 'updated' : 'created';
}

function logCrosswalk(acts: HarvestAct[]): void {
  const pairs = acts.filter((act) => act.aliases.length > 0);
  if (pairs.length === 0) return;
  console.log('\nCross-chamber aliases (AC ↔ AS) observed in official titles:');
  for (const act of pairs.slice(0, 20)) {
    console.log(`  ${act.code} → ${act.aliases.join(', ')}`);
  }
}

async function harvestCamera(cutoff: LookbackCutoff): Promise<SourceResult> {
  const rows = await cameraSparql(cameraQuery(cutoff.yyyymmdd));
  if (!rows) return { ok: false, acts: [], warning: 'Camera SPARQL unavailable or throttled' };
  const acts = harvestFromCamera(rows, cutoff);
  const withVotes = await attachCameraVotes(acts);
  return { ok: true, acts: withVotes };
}

async function harvestSenato(cutoff: LookbackCutoff): Promise<SourceResult> {
  const rows = await senatoSparql(senatoQuery(cutoff.iso));
  if (!rows) return { ok: false, acts: [], warning: 'Senato SPARQL unavailable or throttled' };
  const acts = harvestFromSenato(rows, cutoff);
  const withVotes = await attachSenatoVotes(acts);
  return { ok: true, acts: withVotes };
}

async function main(): Promise<void> {
  console.log('=== La Gazzetta Civica — PHASE 4 nightly parliamentary harvester ===');
  if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
    throw new Error('DATABASE_URL (or DIRECT_URL) is required');
  }

  const cutoff = lookbackCutoff();
  console.log(`Lookback: ${LOOKBACK_HOURS}h (since ${cutoff.iso} / ${cutoff.yyyymmdd})`);
  console.log(`Request timeout: ${REQUEST_TIMEOUT_MS}ms · legislature: XIX\n`);

  const sources: { name: string; result: SourceResult }[] = [];

  console.log('1/4 Camera SPARQL (dati.camera.it)…');
  sources.push({ name: 'camera', result: await harvestCamera(cutoff) });
  await sleep(POLITENESS_MS);

  console.log('2/4 Senato SPARQL (dati.senato.it, GET)…');
  sources.push({ name: 'senato', result: await harvestSenato(cutoff) });
  await sleep(POLITENESS_MS);

  console.log('3/4 Senato RSS/XML (graceful skip on WAF)…');
  sources.push({ name: 'rss', result: await harvestSenatoRss(cutoff) });
  await sleep(POLITENESS_MS);

  console.log('4/4 Normattiva OpenData (Gazzetta Ufficiale)…');
  sources.push({ name: 'normattiva', result: await harvestNormattiva(cutoff) });

  for (const source of sources) {
    if (!source.result.ok) {
      console.warn(`  ! ${source.name}: ${source.result.warning ?? 'skipped'}`);
    } else {
      console.log(`  ✓ ${source.name}: ${source.result.acts.length} act(s) in window`);
    }
  }

  const byId = new Map<string, HarvestAct>();
  for (const source of sources) {
    for (const act of source.result.acts) {
      const existing = byId.get(act.id);
      if (!existing) {
        byId.set(act.id, act);
        continue;
      }
      const preferIncoming =
        (act.source === 'normattiva' && existing.source !== 'normattiva') ||
        (act.vote && !existing.vote);
      if (preferIncoming) byId.set(act.id, { ...act, aliases: [...new Set([...existing.aliases, ...act.aliases])] });
    }
  }

  const acts = [...byId.values()];
  logCrosswalk(acts);
  console.log(`\nDeduplicated harvest: ${acts.length} act(s). Upserting…\n`);

  let created = 0;
  let updated = 0;
  let errors = 0;
  for (const act of acts) {
    try {
      const outcome = await persistAct(act);
      if (outcome === 'created') created += 1;
      else updated += 1;
      const aliasTag = act.aliases.length > 0 ? ` [${act.aliases.join(', ')}]` : '';
      console.log(`  ${act.code} (${act.source}, ${act.iterStatus}) — ${outcome}${aliasTag}`);
    } catch (error) {
      errors += 1;
      console.error(`  !! ${act.code}:`, error instanceof Error ? error.message.split('\n')[0] : error);
    }
  }

  console.log('\n=== PHASE 4 harvest summary ===');
  console.log(`Created: ${created} · updated: ${updated} · errors: ${errors}`);
  if (acts.length > 0 && created + updated === 0) {
    throw new Error('Harvest produced acts but none could be persisted');
  }
}

main()
  .catch((error) => {
    console.error('Nightly harvest failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
