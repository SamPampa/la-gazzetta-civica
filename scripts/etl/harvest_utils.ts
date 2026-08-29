/**
 * Pure helpers for the PHASE 4 nightly parliamentary harvester.
 * No network, no Prisma — unit-tested in `tests/etl_harvester.test.ts`.
 */

export const LOOKBACK_HOURS = 48;
export const REQUEST_TIMEOUT_MS = 10_000;

export const PLACEHOLDER_ARTICLE_PATTERN =
  /non\s+(?:ancora\s+)?(?:[eè]\s+stato\s+)?acquisit[oi]|testo integrale degli articoli successivi/i;

export type LookbackCutoff = {
  iso: string;
  yyyymmdd: string;
  since: Date;
};

export function lookbackCutoff(now: Date = new Date(), hours = LOOKBACK_HOURS): LookbackCutoff {
  const since = new Date(now.getTime() - hours * 3_600_000);
  const iso = since.toISOString().slice(0, 10);
  return { iso, yyyymmdd: iso.replace(/-/g, ''), since };
}

export function isoFromYyyymmdd(raw: string | undefined): string | null {
  if (!raw || raw.length !== 8 || !/^\d{8}$/.test(raw)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

/** Camera `yyyymmdd`, Senato ISO, or already-truncated `YYYY-MM-DD`. */
export function toIsoDate(raw: string | undefined, fallback: string): string {
  return isoFromYyyymmdd(raw) ?? (raw && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : fallback);
}

export function isOnOrAfterIso(value: string | null | undefined, cutoffIso: string): boolean {
  if (!value) return false;
  const iso = value.length === 8 && /^\d{8}$/.test(value) ? isoFromYyyymmdd(value) : value.slice(0, 10);
  return !!iso && iso >= cutoffIso;
}

export type CrossChamberCodes = {
  camera: string[];
  senato: string[];
};

/** Maps Camera (`AC` / `A.C.` / `C.`) and Senato (`AS` / `A.S.` / `S.`) citations in official titles. */
export function extractCrossChamberCodes(text: string): CrossChamberCodes {
  const camera = new Set<string>();
  const senato = new Set<string>();
  const source = text ?? '';

  for (const match of source.matchAll(/\bA\.?\s*C\.?\s*(\d{2,5})\b/gi)) {
    camera.add(match[1]);
  }
  for (const match of source.matchAll(/\bC\.\s*(\d{2,5})\b/g)) {
    camera.add(match[1]);
  }
  for (const match of source.matchAll(/\bA\.?\s*S\.?\s*(\d{2,5})\b/gi)) {
    senato.add(match[1]);
  }
  for (const match of source.matchAll(/\bS\.\s*(\d{2,5})\b/g)) {
    senato.add(match[1]);
  }

  return { camera: [...camera], senato: [...senato] };
}

export function detectConfidenceVoteMention(text: string): boolean {
  return /questione di fiducia|questioni di fiducia/i.test(text);
}

export type SyndicationItem = {
  title: string;
  link: string;
  pubDate: string | null;
};

function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function tagValue(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : null;
}

/**
 * Parses RSS 2.0 `<item>` and Atom `<entry>` blocks. Returns [] on HTML
 * challenge pages or otherwise non-syndication payloads.
 */
export function parseSyndicationItems(xml: string): SyndicationItem[] {
  if (!xml || /<html[\s>]/i.test(xml)) return [];

  const items: SyndicationItem[] = [];
  const rssBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  for (const block of rssBlocks) {
    const title = tagValue(block, 'title') ?? '';
    const link = tagValue(block, 'link') ?? tagValue(block, 'guid') ?? '';
    const pubDate = tagValue(block, 'pubDate') ?? tagValue(block, 'dc:date');
    if (title || link) items.push({ title, link, pubDate });
  }

  const atomBlocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  for (const block of atomBlocks) {
    const title = tagValue(block, 'title') ?? '';
    const linkHref = block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? tagValue(block, 'id') ?? '';
    const pubDate = tagValue(block, 'updated') ?? tagValue(block, 'published');
    if (title || linkHref) items.push({ title, link: linkHref, pubDate });
  }

  return items;
}

export function isoFromSyndicationDate(raw: string | null): string | null {
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}
