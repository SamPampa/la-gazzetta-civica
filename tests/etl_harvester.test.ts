import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDaysIso,
  dateSlices,
  detectConfidenceVoteMention,
  extractCrossChamberCodes,
  isoFromSyndicationDate,
  isoFromYyyymmdd,
  isIsoInClosedRange,
  isOnOrAfterIso,
  lookbackCutoff,
  monthProgress,
  parseSyndicationItems,
  toIsoDate,
} from '../scripts/etl/harvest_utils';

describe('ETL lookback window', () => {
  it('computes a 48h ISO / yyyymmdd cutoff', () => {
    const cutoff = lookbackCutoff(new Date('2026-08-29T03:00:00Z'), 48);
    assert.equal(cutoff.iso, '2026-08-27');
    assert.equal(cutoff.yyyymmdd, '20260827');
  });

  it('normalizes Camera yyyymmdd dates', () => {
    assert.equal(isoFromYyyymmdd('20260828'), '2026-08-28');
    assert.equal(isoFromYyyymmdd('20268'), null);
    assert.equal(isOnOrAfterIso('20260828', '2026-08-27'), true);
    assert.equal(isOnOrAfterIso('2026-08-26', '2026-08-27'), false);
    assert.equal(toIsoDate('20260828', '2026-01-01'), '2026-08-28');
    assert.equal(toIsoDate('2026-08-28T12:00:00', '2026-01-01'), '2026-08-28');
  });
});

describe('cross-chamber act codes', () => {
  it('pairs AC and AS citations in official titles', () => {
    const codes = extractCrossChamberCodes(
      'Conversione in legge del decreto-legge 26 agosto 2026, n. 153, già A.C. 3088 e A.S. 2022',
    );
    assert.deepEqual(codes.camera, ['3088']);
    assert.deepEqual(codes.senato, ['2022']);
  });
});

describe('fiducia detection', () => {
  it('flags only an explicit questione di fiducia', () => {
    assert.equal(detectConfidenceVoteMention('Approvato con questione di fiducia'), true);
    assert.equal(detectConfidenceVoteMention('Conversione in legge del decreto-legge n. 153'), false);
  });
});

describe('RSS / Atom parser', () => {
  it('reads RSS 2.0 items and ignores HTML challenge pages', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>A.S. 2100 — Disegno di legge</title><link>https://www.senato.it/leg/19/BGT/Schede/Ddliter/2100.htm</link><pubDate>Thu, 28 Aug 2026 10:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const items = parseSyndicationItems(xml);
    assert.equal(items.length, 1);
    assert.match(items[0].title, /A\.S\. 2100/);
    assert.equal(isoFromSyndicationDate(items[0].pubDate), '2026-08-28');
    assert.deepEqual(parseSyndicationItems('<html><body>captcha</body></html>'), []);
  });
});

describe('2-year backfill slices', () => {
  it('covers 2024-08-01 → 2026-08-29 in 60-day windows without gaps', () => {
    const slices = dateSlices('2024-08-01', '2026-08-29', 60);
    assert.equal(slices[0].startIso, '2024-08-01');
    assert.equal(slices[0].endIso, '2024-09-29');
    assert.equal(slices[0].startYmd, '20240801');
    assert.equal(slices.at(-1)?.endIso, '2026-08-29');
    assert.equal(slices.at(-1)?.total, slices.length);
    assert.equal(addDaysIso(slices[0].endIso, 1), slices[1].startIso);
    assert.equal(isIsoInClosedRange('2024-08-01', '2024-08-01', '2024-09-29'), true);
    assert.equal(isIsoInClosedRange('2024-09-30', '2024-08-01', '2024-09-29'), false);
    const progress = monthProgress('2024-08-15', '2024-08-01', '2026-08-29');
    assert.equal(progress.month, 1);
    assert.equal(progress.total, 25);
  });
});
