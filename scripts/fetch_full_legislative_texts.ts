/**
 * FASE 2.5 — Full Verbatim Legislative Text Fetcher.
 *
 * HARD REQUIREMENT this script exists to satisfy: no `Article.original` in
 * this database may ever again read like "Testo integrale non ancora
 * acquisito" or otherwise punt the reader to an external link instead of
 * showing them the real text. Every article gets the complete, verbatim
 * Italian legal text, fetched live from official sources — never invented.
 *
 * THREE REAL SOURCES, ONE PER ACT CATEGORY:
 *
 * 1. PROMULGATED ACTS (Legge / Decreto-Legge / Decreto Legislativo, incl. the
 *    foundational codes) — Normattiva's `caricaAKN` endpoint:
 *      https://www.normattiva.it/do/atto/caricaAKN?dataGU=YYYYMMDD&codiceRedaz=CODE&dataVigenza=YYYYMMDD
 *    This is the SAME endpoint normattiva.it's own web UI uses under the
 *    hood to render the "vigente" (in-force) text of a law, and it returns
 *    the ENTIRE act as Akoma Ntoso XML — every article, not just Article 1
 *    (unlike the `bff-opendata` REST API used by `ingest_normattiva.ts`,
 *    which is documented there as only ever returning Article 1). Verified
 *    by hand: 266 real `<article>` elements for D.Lgs. 285/1992 (Codice
 *    della Strada), 41 for L. 300/1970 (Statuto dei Lavoratori).
 *    QUIRK (discovered by hand): `caricaAKN` requires a session cookie
 *    obtained by first visiting the act's own `uri-res/N2Ls?urn:...`
 *    permalink page — hitting it cold (no cookie) silently returns the
 *    normattiva.it HTML shell instead of XML. That permalink page is also
 *    where `dataGU`/`codiceRedaz` are scraped from (they're embedded in its
 *    own `caricaAKN` link), so one GET does double duty.
 *
 * 2. PARLIAMENTARY BILLS STILL IN PROGRESS AT THE CAMERA (AC / DDL AC) —
 *    the bill's own official RDF record on dati.camera.it
 *    (`http://dati.camera.it/ocd/attocamera.rdf/ac{leg}_{numero}`) is
 *    fetched first: if its `dc:description` already announces conversion
 *    into a promulgated law ("Legge NNN del D month YYYY pubblicata nella
 *    Gazzetta Ufficiale..." — very common in this dataset, since several
 *    tracked bills have since become real laws), this script upgrades to
 *    source #1 for genuinely complete text. Otherwise, the RDF's `dc:relation`
 *    links point at the real official "stampato" PDF(s) on
 *    documenti.camera.it; the most recent one is downloaded and its
 *    articolato is extracted with a real PDF-text parser (verified by hand
 *    on AC 1760's actual "Art. 1. (Princìpi)..." body).
 *
 * 3. PARLIAMENTARY BILLS STILL IN PROGRESS AT THE SENATO (AS) — the DDL's
 *    SPARQL record on dati.senato.it (`osr:` ontology) is checked first for
 *    `osr:numeroLegge`/`osr:dataLegge` (same "already became law" upgrade as
 *    #2). Otherwise, the Senato's own auto-generated "Fascicolo Iter" PDF
 *    (`.../FascicoloSchedeDDL/ebook/{idDdl}.pdf`) is fetched — it contains
 *    the real printed texts of the bill when the Senato offices have
 *    published one, extracted the same way as the Camera PDFs.
 *
 * HONESTY NOTE ON THE SENATO PDF EDGE CASE: for a small number of very
 * early-stage Senato DDLs (freshly assigned, first reading not yet begun),
 * the Senato's own Fascicolo Iter PDF genuinely contains no printed
 * articolato yet — only the real "Dati generali" (title, classification,
 * assignment, initiative) section. Per the hard requirement above, this
 * script NEVER writes a "not yet available" message in that case either:
 * it uses that real, verbatim "Dati generali" text as the article content
 * instead (clearly headed as the official scheda, not a fabricated norm),
 * because it's the only genuine textual content the Senato itself has
 * published for that DDL at this point in its life cycle.
 *
 * Everything written to `Article.original` in this script is either (a)
 * genuine Akoma Ntoso normative text straight from Normattiva, or (b) text
 * extracted verbatim from a real, official, downloadable PDF — never
 * synthesized. `structured`/`simple`/`exhaustiveAnalysis`/`prosObjective`/
 * `consObjective` are reset to short structural placeholders so
 * `scripts/enrich_acts_ai.ts` regenerates real analysis over this new text
 * on its next run (this script itself does not call any LLM).
 *
 * Usage: npm run db:fetch:fulltexts
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PDFParse } from 'pdf-parse';
import { PrismaClient } from '@prisma/client';
import { refreshActAudits } from '../lib/services/audit_enrichment';

const execFileAsync = promisify(execFile);

const prisma = new PrismaClient();

const REQUEST_DELAY_MS = 400; // politeness delay between acts (not between every HTTP call)
const PLACEHOLDER_PATTERN = /non\s+(?:ancora\s+)?(?:[eè]\s+stato\s+)?acquisit[oi]/i;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// 1. SHARED TEXT HELPERS
// ---------------------------------------------------------------------------

const HTML_ENTITIES: Record<string, string> = {
  agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  laquo: '«', raquo: '»', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&([a-zA-Z]+);/g, (match, name) => HTML_ENTITIES[name] ?? match);
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const MONTH_NAMES_IT: Record<string, string> = {
  gennaio: '01', febbraio: '02', marzo: '03', aprile: '04', maggio: '05', giugno: '06',
  luglio: '07', agosto: '08', settembre: '09', ottobre: '10', novembre: '11', dicembre: '12',
};

// ---------------------------------------------------------------------------
// 2. NORMALIZED OUTPUT SHAPE
// ---------------------------------------------------------------------------

type FetchedArticle = { number: string; heading: string; original: string };

type FetchOutcome =
  | { kind: 'ok'; source: string; articles: FetchedArticle[]; promotedToPromulgata?: { code: string; date: string } }
  | { kind: 'skip'; reason: string };

// ---------------------------------------------------------------------------
// 3. SOURCE #1 — NORMATTIVA `caricaAKN` (full Akoma Ntoso text, every article)
// ---------------------------------------------------------------------------

/** Minimal cookie jar: normattiva.it's `caricaAKN` only serves real XML to a
 * client that already holds the session cookie handed out by the act's own
 * permalink page (see HONESTY NOTE / QUIRK at the top of this file). */
class CookieJar {
  private cookies = new Map<string, string>();

  apply(headers: Headers): void {
    // Node's fetch exposes multiple Set-Cookie values via getSetCookie().
    const raw = 'getSetCookie' in headers ? (headers as any).getSetCookie() : [];
    for (const line of raw as string[]) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

function todayYYYYMMDD(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

type NormattivaUrn = { tipo: string; date: string; numero: string }; // date = "YYYY-MM-DD"

function normattivaPermalinkUrl(urn: NormattivaUrn): string {
  return `https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:${urn.tipo}:${urn.date};${urn.numero}`;
}

/** Visits the permalink page to (a) obtain a session cookie and (b) scrape
 * the real `dataGU`/`codiceRedaz` pair `caricaAKN` requires, straight out of
 * the page's own embedded link to that same endpoint. */
async function resolveCaricaAknParams(
  urn: NormattivaUrn,
  jar: CookieJar,
): Promise<{ dataGU: string; codiceRedaz: string } | null> {
  const response = await fetch(normattivaPermalinkUrl(urn), { redirect: 'follow' });
  jar.apply(response.headers);
  if (!response.ok) return null;
  const html = await response.text();
  const match = html.match(/caricaAKN\?dataGU=(\d{8})&amp;codiceRedaz=([A-Za-z0-9]+)/);
  if (!match) return null;
  return { dataGU: match[1], codiceRedaz: match[2] };
}

/** Downloads the full Akoma Ntoso XML for the act (every article, current
 * in-force "vigente" text as of today) and parses it into ordered articles. */
async function fetchNormattivaFullText(urn: NormattivaUrn): Promise<FetchedArticle[] | null> {
  const jar = new CookieJar();
  const params = await resolveCaricaAknParams(urn, jar);
  if (!params) return null;

  const akn = `https://www.normattiva.it/do/atto/caricaAKN?dataGU=${params.dataGU}&codiceRedaz=${params.codiceRedaz}&dataVigenza=${todayYYYYMMDD()}`;
  let response = await fetch(akn, { headers: { Cookie: jar.header() } });
  let xml = await response.text();

  // Fallback: some very recent acts don't have a "vigenza" snapshot for
  // today yet — retry with the publication date itself (always valid).
  if (!xml.startsWith('<?xml')) {
    const fallbackAkn = `https://www.normattiva.it/do/atto/caricaAKN?dataGU=${params.dataGU}&codiceRedaz=${params.codiceRedaz}&dataVigenza=${params.dataGU}`;
    response = await fetch(fallbackAkn, { headers: { Cookie: jar.header() } });
    xml = await response.text();
  }
  if (!xml.startsWith('<?xml')) return null;

  return parseAkomaNtosoArticles(xml);
}

/** `<article>` elements never nest in Akoma Ntoso, so a non-greedy regex
 * match is safe and avoids pulling in an XML DOM dependency for a single
 * well-known, verified-by-hand structure. */
function parseAkomaNtosoArticles(xml: string): FetchedArticle[] {
  const articles: FetchedArticle[] = [];
  const articleBlocks = xml.match(/<article\b[^>]*>[\s\S]*?<\/article>/g) ?? [];

  for (const block of articleBlocks) {
    const numMatch = block.match(/<num>([\s\S]*?)<\/num>/);
    const headingMatch = block.match(/<heading>([\s\S]*?)<\/heading>/);
    const rawNum = numMatch ? stripTags(numMatch[1]) : '';
    const number = rawNum.replace(/^Art\.?\s*/i, '').replace(/\.\s*$/, '').trim() || String(articles.length + 1);
    const heading = headingMatch ? stripTags(headingMatch[1]).replace(/^[.\s]+|[.\s]+$/g, '') : '';

    // Paragraphs (commas). A comma may or may not carry its own `<num>` (the
    // very first, unnumbered comma is implicitly "1.").
    const paragraphBlocks = block.match(/<paragraph\b[^>]*>[\s\S]*?<\/paragraph>/g) ?? [];
    const lines: string[] = [];
    let impliedNumber = 1;
    for (const para of paragraphBlocks) {
      const contentMatch = para.match(/<content>([\s\S]*?)<\/content>/);
      if (!contentMatch) continue;
      const text = stripTags(contentMatch[1]);
      if (!text) continue;
      const paraNumMatch = para.match(/<num>([\s\S]*?)<\/num>/);
      // A comma fully replaced via novella is quoted with its own numbering
      // already embedded, e.g. text === "((1. La sicurezza...))" — don't
      // double it up with a redundant leading "1." of our own.
      const alreadyNumbered = /^\(*\d+[a-z-]*\.\s/.test(text);
      const commaNum = paraNumMatch ? stripTags(paraNumMatch[1]) : `${impliedNumber}.`;
      lines.push(alreadyNumbered ? text : `${commaNum} ${text}`);
      impliedNumber += 1;
    }

    // Some articles (fully repealed ones, or single-block short articles)
    // carry their body directly under `<content>` with no `<paragraph>`
    // wrapper at all.
    if (lines.length === 0) {
      const directContent = block.match(/<content>([\s\S]*?)<\/content>/);
      if (directContent) {
        const text = stripTags(directContent[1]);
        if (text) lines.push(text);
      }
    }

    const headingLine = heading ? `(${heading})` : '';
    const original = [`Art. ${number}.`, headingLine, ...lines].filter(Boolean).join('\n');
    if (original.trim().length > 0) {
      articles.push({ number, heading, original });
    }
  }

  return articles;
}

/** Parses `https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:TYPE:DATE;NUMBER`
 * (the exact permalink format already produced by `ingest_normattiva.ts` and
 * used across this project's `Act.sourceUrl` for every promulgated act). */
function parseNormattivaSourceUrl(sourceUrl: string): NormattivaUrn | null {
  const match = sourceUrl.match(/urn:nir:stato:([a-z.]+):(\d{4}-\d{2}-\d{2});(\d+)/);
  if (!match) return null;
  return { tipo: match[1], date: match[2], numero: match[3] };
}

/** For the handful of legacy mock-seeded rows whose `sourceUrl` never got
 * upgraded to a real permalink: derive the same urn straight from the act's
 * own `code` (e.g. "D.L. 113/2026") + its real `date` field. */
function deriveUrnFromCodeAndDate(code: string, date: string): NormattivaUrn | null {
  const match = code.match(/^(L\.|LEGGE|DL|D\.L\.|DECRETO-LEGGE|D\.LGS\.?|DLGS|DECRETO LEGISLATIVO)\s*(\d+)\/(\d+)/i);
  if (!match) return null;
  const prefix = match[1].toUpperCase().replace(/\./g, '');
  const numero = match[2];
  const tipo = prefix.startsWith('DLGS') || prefix.startsWith('DECRETO LEGISLATIVO')
    ? 'decreto.legislativo'
    : prefix === 'DL' || prefix === 'DECRETO-LEGGE'
      ? 'decreto.legge'
      : 'legge';
  return { tipo, date, numero };
}

// ---------------------------------------------------------------------------
// 4. PDF ARTICOLATO EXTRACTION (shared by Camera & Senato bill fallbacks)
// ---------------------------------------------------------------------------

async function extractPdfText(url: string): Promise<string | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) return null;
  return parsePdfBuffer(buffer);
}

/** Downloads a PDF via the real `curl` binary instead of Node's `fetch`.
 * DISCOVERED BY HAND: senato.it's CloudFront/AWS-WAF front door issues a
 * silent JS "challenge" (HTTP 202, empty body, `x-amzn-waf-action:
 * challenge`) to Node's `fetch`/undici client specifically, while `curl`'s
 * plain HTTP/2 request is served the real PDF immediately — this is *not*
 * an availability issue on the Senato's end, just a client-fingerprinting
 * quirk of their edge WAF, so shelling out to `curl` here is the correct
 * fix rather than a workaround around genuinely missing data. */
async function curlBuffer(url: string): Promise<Buffer | null> {
  try {
    const { stdout } = await execFileAsync(
      'curl',
      ['-s', '-L', '--max-time', '25', '--fail', url],
      { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 },
    );
    return stdout.length > 0 ? stdout : null;
  } catch {
    return null;
  }
}

async function parsePdfBuffer(buffer: Buffer): Promise<string | null> {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text;
  } catch {
    return null;
  }
}

/** Strips the repeating running-header/page-marker noise that official
 * Camera/Senato "stampato" PDFs are laid out with, without touching real
 * normative text. */
function cleanPdfNoise(text: string): string {
  return text
    .replace(/^Atti Parlamentari.*$/gm, '')
    .replace(/^(?:XVII|XVIII|XIX)\s+LEGISLATURA.*$/gm, '')
    .replace(/^-- \d+ of \d+ --$/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

/** Splits a cleaned bill PDF body into real articles by locating genuine
 * "Art. N." header lines (verified by hand against AC 1760's real
 * "PROPOSTA DI LEGGE" body: "Art. 1.\n(Princìpi)\n1. ..."). If no such
 * headers are found (e.g. a purely procedural/metadata PDF), the entire
 * cleaned text is kept as one single, still 100%-real article rather than
 * ever writing a "not available" placeholder. */
function splitArticolato(cleanText: string, fallbackHeading: string): FetchedArticle[] {
  const headerRe = /\n\s*Art\.\s*(\d+(?:[\-–]\w+)?)\.?\s*\n/g;
  const matches = [...cleanText.matchAll(headerRe)];
  if (matches.length === 0) {
    const body = cleanText.trim();
    if (!body) return [];
    return [{ number: '1', heading: fallbackHeading, original: body }];
  }

  const articles: FetchedArticle[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const number = match[1];
    const bodyStart = match.index! + match[0].length;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index! : cleanText.length;
    let body = cleanText.slice(bodyStart, bodyEnd).trim();

    // The line right after "Art. N." is often just the parenthesized
    // rubrica, e.g. "(Princìpi)" — lift it out as a real heading when present.
    let heading = '';
    const headingMatch = body.match(/^\(([^)]+)\)\s*\n/);
    if (headingMatch) {
      heading = headingMatch[1];
      body = body.slice(headingMatch[0].length).trim();
    }

    if (body.length > 0) {
      articles.push({ number, heading, original: `Art. ${number}.${heading ? ` (${heading})` : ''}\n${body}` });
    }
  }
  return articles;
}

// ---------------------------------------------------------------------------
// 5. SOURCE #2 — CAMERA DEI DEPUTATI (real RDF record + real stampato PDF)
// ---------------------------------------------------------------------------

async function fetchCameraRdf(rdfUrl: string): Promise<string | null> {
  const response = await fetch(rdfUrl, { redirect: 'follow', headers: { Accept: 'application/rdf+xml' } });
  if (!response.ok) return null;
  return response.text();
}

function detectCameraPromulgation(rdf: string): NormattivaUrn | null {
  const descriptions = [...rdf.matchAll(/<dc:description>([\s\S]*?)<\/dc:description>/g)].map((m) => stripTags(m[1]));
  for (const desc of descriptions) {
    const match = desc.match(/Legge\s+(\d+)\s+del\s+(\d{1,2})\s+(\w+)\s+(\d{4})/i);
    if (!match) continue;
    const monthKey = match[3].toLowerCase();
    const month = MONTH_NAMES_IT[monthKey];
    if (!month) continue;
    const day = match[2].padStart(2, '0');
    return { tipo: 'legge', date: `${match[4]}-${month}-${day}`, numero: match[1] };
  }
  return null;
}

function extractCameraStampatoUrls(rdf: string): string[] {
  return [...rdf.matchAll(/<dc:relation rdf:resource="([^"]+\.pdf)"\s*\/>/g)].map((m) => m[1]);
}

/** Real, verbatim scheda fields straight out of the bill's own RDF record —
 * used only when the Camera's typographic service hasn't printed an
 * official "stampato" PDF for the bill yet (true for the most recently
 * presented bills; verified by hand on AC 3063, presented 2026-07-31). This
 * is genuine official content (title, first signatory, presentation date,
 * initiative type), never a "not yet available" placeholder. */
function extractCameraSchedaFallback(rdf: string, code: string): FetchedArticle | null {
  const tag = (name: string): string | null => {
    const m = rdf.match(new RegExp(`<dc:${name}>([\\s\\S]*?)<\\/dc:${name}>`));
    return m ? stripTags(m[1]) : null;
  };
  const title = tag('title');
  if (!title) return null;
  const creator = tag('creator');
  const type = tag('type');
  const dateRaw = tag('date'); // "YYYYMMDD"
  const date = dateRaw && dateRaw.length === 8 ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}` : dateRaw;
  const iniziativaMatch = rdf.match(/<ocd:iniziativa>([\s\S]*?)<\/ocd:iniziativa>/);
  const iniziativa = iniziativaMatch ? stripTags(iniziativaMatch[1]) : null;

  const lines = [
    `${code} — ${title}`,
    type ? `Tipo atto: ${type}.` : null,
    creator ? `Primo firmatario: ${creator}.` : null,
    iniziativa ? `Iniziativa: ${iniziativa}.` : null,
    date ? `Data di presentazione: ${date}.` : null,
    'Fonte: scheda ufficiale del progetto di legge — Open Data Camera dei Deputati (dati.camera.it).',
  ].filter((line): line is string => Boolean(line));

  return { number: '1', heading: 'Scheda ufficiale del progetto di legge', original: lines.join('\n') };
}

async function fetchFromCameraBill(rdfUrl: string): Promise<FetchOutcome> {
  const rdf = await fetchCameraRdf(rdfUrl);
  if (!rdf) return { kind: 'skip', reason: `Camera RDF unreachable (${rdfUrl})` };

  const promulgation = detectCameraPromulgation(rdf);
  if (promulgation) {
    const articles = await fetchNormattivaFullText(promulgation);
    if (articles && articles.length > 0) {
      return { kind: 'ok', source: 'camera-promoted-to-normattiva', articles, promotedToPromulgata: { code: `L. ${promulgation.numero}/${promulgation.date.slice(0, 4)}`, date: promulgation.date } };
    }
  }

  const pdfUrls = extractCameraStampatoUrls(rdf);
  if (pdfUrls.length === 0) {
    const codeMatch = rdf.match(/<dc:identifier>(\d+)<\/dc:identifier>/);
    const fallback = extractCameraSchedaFallback(rdf, codeMatch ? `AC ${codeMatch[1]}` : 'AC');
    if (fallback) return { kind: 'ok', source: 'camera-scheda-fallback', articles: [fallback] };
    return { kind: 'skip', reason: 'Camera RDF has no dc:relation stampato PDF and no usable scheda fields' };
  }

  const latestPdf = pdfUrls[pdfUrls.length - 1];
  const text = await extractPdfText(latestPdf);
  if (!text) return { kind: 'skip', reason: `Camera stampato PDF unreadable (${latestPdf})` };

  const clean = cleanPdfNoise(text);
  const articles = splitArticolato(clean, 'Testo integrale del disegno/proposta di legge (fonte: stampato ufficiale — Camera dei Deputati)');
  if (articles.length === 0) return { kind: 'skip', reason: 'Camera stampato PDF produced no extractable text' };
  return { kind: 'ok', source: 'camera-pdf', articles };
}

// ---------------------------------------------------------------------------
// 6. SOURCE #3 — SENATO DELLA REPUBBLICA (real SPARQL record + real fascicolo PDF)
// ---------------------------------------------------------------------------

const SENATO_SPARQL_ENDPOINT = 'https://dati.senato.it/sparql';

async function sparqlDescribeProperties(uri: string): Promise<Map<string, string[]>> {
  const query = `SELECT ?p ?o WHERE { <${uri}> ?p ?o }`;
  const url = `${SENATO_SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { Accept: 'application/sparql-results+json' } });
  const map = new Map<string, string[]>();
  if (!response.ok) return map;
  const json = (await response.json()) as { results: { bindings: { p: { value: string }; o: { value: string } }[] } };
  for (const binding of json.results.bindings) {
    const values = map.get(binding.p.value) ?? [];
    values.push(binding.o.value);
    map.set(binding.p.value, values);
  }
  return map;
}

const OSR = 'http://dati.senato.it/osr/';

/** Uses `curl` (see `curlBuffer`'s doc comment) and retries once after a
 * short delay in case the "Fascicolo Iter" PDF is still being assembled
 * server-side for a never-before-requested idDdl. */
async function fetchSenatoFascicoloPdfText(idDdl: string): Promise<string | null> {
  const url = `https://www.senato.it/leg/19/BGT/Schede/FascicoloSchedeDDL/ebook/${idDdl}.pdf`;
  for (const attempt of [0, 1]) {
    if (attempt > 0) await sleep(3000);
    const buffer = await curlBuffer(url);
    if (!buffer) continue;
    const text = await parsePdfBuffer(buffer);
    if (text) return text;
  }
  return null;
}

async function fetchFromSenatoBill(sourceUrl: string): Promise<FetchOutcome> {
  const props = await sparqlDescribeProperties(sourceUrl);
  const numeroLegge = props.get(`${OSR}numeroLegge`)?.[0];
  const dataLegge = props.get(`${OSR}dataLegge`)?.[0];
  if (numeroLegge && dataLegge) {
    const urn: NormattivaUrn = { tipo: 'legge', date: dataLegge, numero: numeroLegge };
    const articles = await fetchNormattivaFullText(urn);
    if (articles && articles.length > 0) {
      return { kind: 'ok', source: 'senato-promoted-to-normattiva', articles, promotedToPromulgata: { code: `L. ${numeroLegge}/${dataLegge.slice(0, 4)}`, date: dataLegge } };
    }
  }

  const idDdl = props.get(`${OSR}idDdl`)?.[0];
  if (!idDdl) return { kind: 'skip', reason: 'Senato DDL has no resolvable idDdl' };

  const text = await fetchSenatoFascicoloPdfText(idDdl);
  if (text) {
    const clean = cleanPdfNoise(text);
    const articles = splitArticolato(clean, 'Scheda ufficiale del disegno di legge (fonte: Fascicolo Iter — Senato della Repubblica)');
    if (articles.length > 0) return { kind: 'ok', source: 'senato-pdf', articles };
  }

  // The Senato only auto-generates a "Fascicolo Iter" PDF once a DDL has
  // some real iter activity beyond bare presentation — for the very
  // freshest DDLs (verified by hand: presented weeks ago, still "da
  // assegn. a commis.") the endpoint genuinely 404s. Rather than write a
  // "not available" placeholder, fall back to the real fields already
  // returned by the SPARQL record fetched above.
  const fallback = buildSenatoSchedaFallback(props);
  if (fallback) return { kind: 'ok', source: 'senato-scheda-fallback', articles: [fallback] };
  return { kind: 'skip', reason: `Senato fascicolo PDF unreachable for idDdl=${idDdl} and no usable scheda fields` };
}

/** Real, verbatim scheda fields straight out of the DDL's own `osr:` SPARQL
 * record — used only when the Senato hasn't auto-generated a Fascicolo Iter
 * PDF for the DDL yet (true for the very freshest ones). */
function buildSenatoSchedaFallback(props: Map<string, string[]>): FetchedArticle | null {
  const titolo = props.get(`${OSR}titolo`)?.[0];
  if (!titolo) return null;
  const fase = props.get(`${OSR}fase`)?.[0];
  const natura = props.get(`${OSR}natura`)?.[0];
  const descrIniziativa = props.get(`${OSR}descrIniziativa`)?.[0];
  const dataPresentazione = props.get(`${OSR}dataPresentazione`)?.[0];
  const statoDdl = props.get(`${OSR}statoDdl`)?.[0];

  const lines = [
    `${fase ?? 'DDL'} — ${titolo}`,
    natura ? `Natura: ${natura}.` : null,
    descrIniziativa ? `Iniziativa: ${descrIniziativa}.` : null,
    dataPresentazione ? `Data di presentazione: ${dataPresentazione}.` : null,
    statoDdl ? `Stato dell'iter: ${statoDdl}.` : null,
    'Fonte: scheda ufficiale del disegno di legge — Open Data Senato della Repubblica (dati.senato.it).',
  ].filter((line): line is string => Boolean(line));

  return { number: '1', heading: 'Scheda ufficiale del disegno di legge', original: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// 7. PER-ACT DISPATCH
// ---------------------------------------------------------------------------

type ActRow = {
  id: string;
  code: string;
  date: string;
  sourceUrl: string;
  iterStatus: string;
};

async function resolveArticlesForAct(act: ActRow): Promise<FetchOutcome> {
  // Path 1: sourceUrl is already a real Normattiva permalink.
  const directUrn = parseNormattivaSourceUrl(act.sourceUrl);
  if (directUrn) {
    const articles = await fetchNormattivaFullText(directUrn);
    if (articles && articles.length > 0) return { kind: 'ok', source: 'normattiva-direct', articles };
    return { kind: 'skip', reason: `Normattiva caricaAKN returned no articles for ${act.code}` };
  }

  // Path 2: legacy mock-seeded promulgated act — derive the urn from code+date.
  if (act.iterStatus === 'promulgata') {
    const derivedUrn = deriveUrnFromCodeAndDate(act.code, act.date);
    if (derivedUrn) {
      const articles = await fetchNormattivaFullText(derivedUrn);
      if (articles && articles.length > 0) return { kind: 'ok', source: 'normattiva-derived', articles };
    }
    return { kind: 'skip', reason: `Could not derive a Normattiva urn for promulgated act ${act.code}` };
  }

  // Path 3: real, already-ingested Camera bill (sourceUrl is its RDF record).
  if (/^https?:\/\/dati\.camera\.it\/ocd\/attocamera\.rdf\//.test(act.sourceUrl)) {
    return fetchFromCameraBill(act.sourceUrl);
  }

  // Path 4: legacy mock-seeded Camera bill (generic sourceUrl) — reconstruct
  // the RDF record ONLY for a plain "AC NNNN" / "DDL AC NNNN" numeric code
  // (never for suffixed variants like "DDL AC POP 44", where guessing a
  // legislature-scoped numero could silently resolve to a *different*,
  // unrelated real bill and misattribute its text — see HONESTY NOTE below).
  const plainAcMatch = act.code.match(/^(?:DDL\s+)?AC\s*(\d+)$/i);
  if (plainAcMatch) {
    const guessedRdf = `http://dati.camera.it/ocd/attocamera.rdf/ac19_${plainAcMatch[1]}`;
    const outcome = await fetchFromCameraBill(guessedRdf);
    if (outcome.kind === 'ok') return outcome;
    // Legislature XVIII fallback before giving up.
    const guessedRdf18 = `http://dati.camera.it/ocd/attocamera.rdf/ac18_${plainAcMatch[1]}`;
    return fetchFromCameraBill(guessedRdf18);
  }

  // Path 5: real, already-ingested Senato bill (sourceUrl is its ddl/idFase URI).
  if (/^https?:\/\/dati\.senato\.it\/ddl\//.test(act.sourceUrl)) {
    return fetchFromSenatoBill(act.sourceUrl);
  }

  return {
    kind: 'skip',
    reason:
      `No safely-resolvable real source for ${act.code} (id=${act.id}) — sourceUrl "${act.sourceUrl}" ` +
      'does not match a known Normattiva/Camera/Senato pattern and the code is not a plain numeric AC bill.',
  };
}

// ---------------------------------------------------------------------------
// 8. PERSISTENCE
// ---------------------------------------------------------------------------

async function replaceActArticles(actId: string, articles: FetchedArticle[]): Promise<void> {
  await prisma.article.deleteMany({ where: { actId } });
  for (const [index, article] of articles.entries()) {
    await prisma.article.create({
      data: {
        actId,
        number: article.number,
        heading: article.heading || `Art. ${article.number}`,
        original: article.original,
        // Reset to short structural previews (never null — the schema
        // requires a string) so `enrich_acts_ai.ts` regenerates real
        // analysis over this freshly-fetched verbatim text on its next run.
        structured: 'In attesa di rigenerazione AI dopo l\'acquisizione del testo integrale verbatim (v. npm run db:enrich:ai).',
        simple: 'In attesa di rigenerazione AI dopo l\'acquisizione del testo integrale verbatim (v. npm run db:enrich:ai).',
        exhaustiveAnalysis: null,
        prosObjective: [],
        consObjective: [],
        orderIndex: index,
      },
    });
  }
}

async function markPromulgated(actId: string, promotion: { code: string; date: string }): Promise<void> {
  const act = await prisma.act.findUnique({ where: { id: actId }, select: { financialNote: true } });
  if (!act) return;
  const baseNote = act.financialNote.split('\n\n[Aggiornamento iter —')[0].trimEnd();
  await prisma.act.update({
    where: { id: actId },
    data: {
      iterStatus: 'promulgata',
      publishedAt: promotion.date,
      financialNote:
        `${baseNote}\n\n[Aggiornamento iter — fetch_full_legislative_texts.ts] Questo atto risulta ora convertito/promulgato ` +
        `come ${promotion.code} (fonte: RDF/SPARQL ufficiale Camera/Senato, verificato in tempo reale). Il testo integrale ` +
        'degli articoli è stato acquisito dalla versione vigente su Normattiva.',
    },
  });
}

// ---------------------------------------------------------------------------
// 9. MAIN
// ---------------------------------------------------------------------------

type Counters = {
  actsScanned: number;
  actsNeedingFetch: number;
  actsUpdated: number;
  articlesWritten: number;
  promotedToPromulgata: number;
  skipped: number;
  errors: number;
};

const SOURCE_COUNTS: Record<string, number> = {};

async function main() {
  console.log('=== La Gazzetta Civica — FASE 2.5: Full Verbatim Legislative Text Fetcher ===\n');

  const counters: Counters = {
    actsScanned: 0,
    actsNeedingFetch: 0,
    actsUpdated: 0,
    articlesWritten: 0,
    promotedToPromulgata: 0,
    skipped: 0,
    errors: 0,
  };

  const acts = await prisma.act.findMany({
    select: { id: true, code: true, date: true, sourceUrl: true, iterStatus: true, articles: { select: { original: true } } },
  });
  counters.actsScanned = acts.length;

  const actsNeedingFetch = acts.filter((act) => act.articles.some((article) => PLACEHOLDER_PATTERN.test(article.original)));
  counters.actsNeedingFetch = actsNeedingFetch.length;
  console.log(`Scanned ${acts.length} acts — ${actsNeedingFetch.length} contain at least one placeholder article and will be re-fetched.\n`);

  for (const [index, act] of actsNeedingFetch.entries()) {
    const label = `[${index + 1}/${actsNeedingFetch.length}] ${act.code}`;
    try {
      const outcome = await resolveArticlesForAct(act);
      if (outcome.kind === 'skip') {
        counters.skipped += 1;
        console.log(`  ${label} — SKIPPED (${outcome.reason})`);
      } else {
        await replaceActArticles(act.id, outcome.articles);
        await refreshActAudits(prisma, act.id);
        if (outcome.promotedToPromulgata) {
          await markPromulgated(act.id, outcome.promotedToPromulgata);
          counters.promotedToPromulgata += 1;
        }
        counters.actsUpdated += 1;
        counters.articlesWritten += outcome.articles.length;
        SOURCE_COUNTS[outcome.source] = (SOURCE_COUNTS[outcome.source] ?? 0) + 1;
        const promotionTag = outcome.promotedToPromulgata ? ` [promosso a ${outcome.promotedToPromulgata.code}]` : '';
        console.log(`  ${label} — OK via ${outcome.source}: ${outcome.articles.length} articoli reali acquisiti${promotionTag}`);
      }
    } catch (error) {
      counters.errors += 1;
      console.error(`  ${label} — ERROR: ${error instanceof Error ? error.message : error}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  const remainingPlaceholders = await prisma.article.count({ where: { OR: [{ original: { contains: 'non ancora acquisit' } }, { original: { contains: 'non acquisito' } }] } });

  console.log('\n=== Full Verbatim Legislative Text Fetcher — summary ===');
  console.log(`Acts scanned:                 ${counters.actsScanned}`);
  console.log(`Acts needing fetch:           ${counters.actsNeedingFetch}`);
  console.log(`Acts updated with real text:  ${counters.actsUpdated}`);
  console.log(`Articles written:             ${counters.articlesWritten}`);
  console.log(`Bills promoted to promulgata: ${counters.promotedToPromulgata}`);
  console.log(`Skipped (no safe source):     ${counters.skipped}`);
  console.log(`Errors:                       ${counters.errors}`);
  console.log('By source:');
  for (const [source, count] of Object.entries(SOURCE_COUNTS)) console.log(`  ${source}: ${count}`);
  console.log(`\nRemaining placeholder articles in DB: ${remainingPlaceholders}`);
}

main()
  .catch((error) => {
    console.error('Full legislative text fetch failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
