const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { app } = require('../server');

test('read-only research API returns the manuscript experiment artifacts', async (t) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${base}/research-lab/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /SurakshyaPath Research Lab/);

  const endpoints = ['overview', 'models', 'allocation', 'routes', 'robustness'];
  const responses = await Promise.all(endpoints.map(async (name) => {
    const response = await fetch(`${base}/api/research/${name}`);
    assert.equal(response.status, 200, `/${name} should return HTTP 200`);
    return response.json();
  }));

  const [overview, models, allocation, routes, robustness] = responses;

  assert.equal(overview.dataset.recordCount, 1567);
  assert.equal(overview.dataset.canonicalSeed, 208304);
  assert.equal(overview.dataset.dataStatus, 'SYNTHETIC');
  assert.equal(overview.dataset.spatialUnits, 10);

  assert.deepEqual(
    models.models.map((model) => model.id),
    ['frequency-only', 'severity-only', 'frequency-severity', 'current-severity-recency']
  );
  assert.equal(models.models.find((model) => model.id === 'frequency-only').topZone, 'Bouddha');
  assert.equal(models.models.find((model) => model.id === 'severity-only').topZone, 'Thamel');

  assert.ok(allocation.officerCounts.includes(6));
  assert.ok(allocation.officerCounts.includes(12));
  assert.ok(allocation.officerCounts.includes(20));

  const frequency20 = allocation.models['frequency-only']['20'];
  const recency20 = allocation.models['current-severity-recency']['20'];
  assert.equal(frequency20.Chabahil, 0);
  assert.equal(frequency20.Bouddha, 6);
  assert.equal(recency20.Chabahil, 1);
  assert.equal(recency20.Bouddha, 5);
  assert.equal(
    Object.keys(frequency20).filter((zone) => frequency20[zone] !== recency20[zone]).length,
    2,
    'recency and frequency allocations differ only in Chabahil and Bouddha at budget 20'
  );

  assert.equal(routes.models['frequency-only'].nearestNeighbourKm, 23.62);
  assert.equal(routes.models['frequency-only'].optimizedKm, 22.31);
  assert.equal(routes.models['severity-only'].savingsPercent, 0);

  assert.deepEqual(robustness.seeds, [208304, 208305, 208306, 208307, 208308]);
  assert.equal(robustness.results.length, 5);
});

test('research endpoints are read-only and do not accept incident submissions', async (t) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
  });

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/research/overview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ incident: 'not accepted' })
  });

  assert.equal(response.status, 404);
});

test('research lab browser script is syntactically valid', () => {
  const scriptPath = path.join(__dirname, '..', 'public', 'research-lab', 'app.js');
  execFileSync(process.execPath, ['--check', scriptPath], { stdio: 'pipe' });
});
