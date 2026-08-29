import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getActs, getActById } from '../lib/db/acts';
import { getObservatoryMetrics } from '../lib/db/observatory';
import { GET as getObservatory } from '../app/api/observatory/route';

describe('layer dati e rotte', () => {
  it('getActById async restituisce null per un id assente dal catalogo', async () => {
    const act = await getActById('atto-inesistente-xyz-404');
    assert.equal(act, null);
  });

  it('getActs pagina senza caricare i testi integrali', async () => {
    const result = await getActs({ page: 1, pageSize: 2, timeRange: 'all' });
    assert.ok(result.total >= result.items.length);
    assert.equal(result.pageSize, 2);
    assert.ok(result.items.length <= 2);
    for (const item of result.items) {
      assert.equal('articles' in item, false);
      assert.ok(item.id);
      assert.ok(item.code);
    }
  });

  it('osservatorio espone summary, classifica e distribuzione copertura', async () => {
    const data = await getObservatoryMetrics();
    assert.ok(data.summary.totalActsTracked >= 0);
    assert.ok(typeof data.summary.omnibusAlertsCount === 'number');
    assert.ok(typeof data.summary.lobbyAlertsCount === 'number');
    assert.ok(typeof data.summary.confidenceVoteRate === 'number');
    assert.ok(Array.isArray(data.ministryLeaderboard));
    assert.equal(data.coverageDistribution.length, 3);
    assert.ok(Array.isArray(data.iterVelocity));
    assert.ok(Array.isArray(data.topDelayedActs));
  });

  it('GET /api/observatory risponde 200 con lo stesso contratto', async () => {
    const response = await getObservatory();
    assert.equal(response.status, 200);
    const body = (await response.json()) as Awaited<ReturnType<typeof getObservatoryMetrics>>;
    assert.ok(body.summary);
    assert.ok('lobbyAlertsCount' in body.summary);
    assert.ok(Array.isArray(body.topDelayedActs));
  });
});
