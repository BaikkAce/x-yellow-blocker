import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../backend/src/index.js';

async function request(path, options) {
  return worker.fetch(new Request(`https://worker.example${path}`, options));
}

test('retired Worker reports account sharing disabled', async () => {
  const response = await request('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    version: '1.2.0',
    accountSharing: false,
    remoteData: ['keywords', 'lureSamples']
  });
});

test('retired Worker rejects legacy reports and disputes without reading bodies', async () => {
  for (const path of ['/api/report', '/api/dispute']) {
    const response = await request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: '@someone' })
    });
    assert.equal(response.status, 410);
    assert.equal((await response.json()).code, 'account_sharing_removed');
  }
});

test('retired Worker keeps compatibility responses and CORS', async () => {
  const stats = await request('/api/stats');
  assert.equal(stats.status, 200);
  assert.equal((await stats.json()).accountSharing, false);

  const options = await request('/api/report', { method: 'OPTIONS' });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');

  const missing = await request('/missing');
  assert.equal(missing.status, 404);
});
