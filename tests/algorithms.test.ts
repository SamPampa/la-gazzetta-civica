import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateDelayDays } from '../lib/dates';
import { parseArchiveSearchParams } from '../lib/archive';
import { computeActAudits } from '../lib/services/audit_enrichment';
import {
  calculateExecutiveDominanceScore,
  classifyBillKind,
  computeDemocraticBypass,
  getBenchmarkDebateHours,
} from '../lib/services/democratic_bypass';
import { HIGH_SIMILARITY_THRESHOLD, calculateTextSimilarity, detectLobbyMatches } from '../lib/services/lobby_matcher';
import { OMNIBUS_DIVERGENCE_THRESHOLD, scanActForOmnibusAlerts } from '../lib/services/omnibus_detector';
import { MOCK_ACTS, getActById } from '../src/data/mockActs';

describe('ritardi attuativi', () => {
  const ref = new Date('2026-08-29T12:00:00Z');

  it('conta i giorni di calendario UTC rispetto a una data fissa', () => {
    assert.equal(calculateDelayDays('2026-08-01', ref), 28);
    assert.equal(calculateDelayDays('2026-08-29', ref), 0);
    assert.equal(calculateDelayDays('2026-09-01', ref), 0);
    assert.equal(calculateDelayDays(null, ref), 0);
  });

  it('ignora scadenze illeggibili', () => {
    assert.equal(calculateDelayDays('non-una-data', ref), 0);
    assert.equal(calculateDelayDays('   ', ref), 0);
  });
});

describe('lobby matcher', () => {
  it('assegna similarità alta a testi quasi identici', () => {
    const text =
      'I veicoli di mobilità personale a propulsione prevalentemente elettrica, ivi compresi i monopattini, devono essere muniti di contrassegno identificativo e di copertura assicurativa per la responsabilità civile verso terzi.';
    const score = calculateTextSimilarity(text, text);
    assert.ok(score >= HIGH_SIMILARITY_THRESHOLD, `expected ≥ 0.85, got ${score}`);
  });

  it('non tratta due testi vuoti come match perfetto', () => {
    assert.equal(calculateTextSimilarity('', ''), 0);
    assert.equal(calculateTextSimilarity('   ', 'articolo'), 0);
  });

  it('segna ≥ 85% tra l’art. 3 della L. 105/2026 e la memoria ANIASA', async () => {
    const act = MOCK_ACTS.find((row) => row.id === 'legge-105-2026');
    assert.ok(act);
    const art3 = act.articles.find((article) => article.number === '3');
    assert.ok(art3);
    const matches = await detectLobbyMatches({
      actId: act.id,
      articles: [{ number: art3.number, original: art3.original }],
    });
    const aniasa = matches.find((match) => match.organization === 'ANIASA');
    assert.ok(aniasa, 'ANIASA memo should be compared');
    assert.equal(aniasa.hasHighSimilarity, true);
    assert.ok(aniasa.similarityScore >= HIGH_SIMILARITY_THRESHOLD);
  });
});

describe('omnibus detector', () => {
  it('alza l’allerta sull’art. 5 della L. 105/2026 (concessioni vs codice della strada)', () => {
    const act = MOCK_ACTS.find((row) => row.id === 'legge-105-2026');
    assert.ok(act);
    const alerts = scanActForOmnibusAlerts({
      actCode: act.code,
      preamble: act.preamble,
      mainMateria: act.materia,
      articles: act.articles.map((article) => ({
        number: article.number,
        heading: article.heading,
        original: article.original,
      })),
    });
    const art5 = alerts.find((alert) => alert.articleNumber === '5');
    assert.ok(art5);
    assert.equal(art5.isOmnibusAlert, true);
    assert.ok(art5.divergenceScore >= OMNIBUS_DIVERGENCE_THRESHOLD);
  });
});

describe('bypass democratico', () => {
  it('classifica DL, DDL e D.Lgs senza confondere i prefissi', () => {
    assert.equal(classifyBillKind('D.L. 113/2026'), 'decreto_legge');
    assert.equal(classifyBillKind('D.Lgs. 285/1992'), 'decreto_legislativo');
    assert.equal(classifyBillKind('DDL AC 1760'), 'disegno_di_legge');
    assert.equal(getBenchmarkDebateHours('D.L. 113/2026'), 48);
    assert.equal(getBenchmarkDebateHours('D.Lgs. 285/1992'), 24);
  });

  it('senza fatti d’Aula usa solo l’urgenza e non inventa la fiducia', () => {
    const score = calculateExecutiveDominanceScore({
      actCode: 'D.L. 113/2026',
      decreeUrgencyLevel: 80,
    });
    assert.equal(score, 8);
    const metrics = computeDemocraticBypass({
      actCode: 'D.L. 113/2026',
      decreeUrgencyLevel: 80,
    });
    assert.equal(metrics.confidenceVotePlaced, false);
    assert.equal(metrics.statusLevel, 'ordinario');
  });

  it('somma fiducia bicamerale e ghigliottina su fatti espliciti', () => {
    const score = calculateExecutiveDominanceScore({
      actCode: 'D.L. 113/2026',
      isConfidenceVote: true,
      confidenceVoteChamber: 'Entrambe',
      amendmentsPresented: 100,
      amendmentsGuillotined: 50,
      actualDebateHours: 24,
      decreeUrgencyLevel: 0,
    });
    // 50 fiducia + 15 contrazione (24/48) + 10 ghigliottina (50/100) = 75
    assert.equal(score, 75);
    const metrics = computeDemocraticBypass({
      actCode: 'D.L. 113/2026',
      isConfidenceVote: true,
      confidenceVoteChamber: 'Entrambe',
      amendmentsPresented: 100,
      amendmentsGuillotined: 50,
      actualDebateHours: 24,
      decreeUrgencyLevel: 0,
    });
    assert.equal(metrics.statusLevel, 'bypass_elevato');
    assert.equal(metrics.confidenceVotePlaced, true);
  });
});

describe('arricchimento audit (payload persistito)', () => {
  it('restituisce la forma JSON attesa e non inventa la fiducia', async () => {
    const act = MOCK_ACTS.find((row) => row.id === 'legge-105-2026');
    assert.ok(act);
    const payload = await computeActAudits({
      id: act.id,
      code: act.code,
      materia: act.materia,
      preamble: act.preamble,
      urgency: act.urgency,
      articles: act.articles.map((article) => ({
        number: article.number,
        heading: article.heading,
        original: article.original,
      })),
    });
    assert.equal(typeof payload.democraticBypass.executiveDominanceScore, 'number');
    assert.equal(payload.democraticBypass.confidenceVotePlaced, false);
    assert.ok(['ordinario', 'accelerato', 'bypass_elevato'].includes(payload.democraticBypass.statusLevel));
    assert.ok(payload.lobbyCheck === null || typeof payload.lobbyCheck.similarity === 'number');
    assert.ok(payload.omnibusRisk === null || payload.omnibusRisk.article.startsWith('Art. '));
  });
});

describe('catalogo e query archivio', () => {
  it('getActById sul corpus locale restituisce null per id sconosciuti', () => {
    assert.equal(getActById('atto-inesistente-xyz-404'), null);
    assert.equal(getActById('legge-105-2026')?.id, 'legge-105-2026');
    assert.equal(getActById('ddl-1435')?.id, 'legge-105-2026');
  });

  it('parseArchiveSearchParams defaulta a recenti e ignora filtri illegali', () => {
    const empty = parseArchiveSearchParams({});
    assert.equal(empty.timeRange, 'recent');
    assert.equal(empty.page, 1);
    assert.equal(empty.sort, 'urgency');
    assert.equal(empty.iter, undefined);

    const parsed = parseArchiveSearchParams({
      q: '  iva  ',
      page: '2',
      range: 'all',
      sort: 'date',
      iter: 'in_aula',
      iniziativa: 'not-a-value',
    });
    assert.equal(parsed.query, 'iva');
    assert.equal(parsed.page, 2);
    assert.equal(parsed.timeRange, 'all');
    assert.equal(parsed.sort, 'date');
    assert.equal(parsed.iter, 'in_aula');
    assert.equal(parsed.iniziativa, undefined);
  });
});
