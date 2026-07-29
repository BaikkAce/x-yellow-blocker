import assert from 'node:assert/strict';
import test from 'node:test';

await import('../src/remote-lists.js');
await import('../src/defaults.js');
await import('../src/detector.js');

const {
  REMOTE_LIST_URLS,
  parseKeywordList,
  parseLureSamples,
  createRemoteBlocklists,
  fetchRemoteBlocklists
} = globalThis.XybRemoteLists;
const { evaluateTweet } = globalThis.XybDetector;

const sampleJson = JSON.stringify({
  version: 2,
  updatedAt: '2026-07-29T00:00:00Z',
  samples: [{
    id: '2026-07-homepage-lure',
    displayName: '同城搭子',
    text: '哥哥看看主页，今晚可以见面',
    category: 'cn_adult_solicitation'
  }]
});

test('parses only safe keyword and lure-language data', () => {
  const keywords = parseKeywordList('# comment\n同城上门\n\nsao货\n同城上门\n<script>\n');
  const samples = parseLureSamples(sampleJson);

  assert.deepEqual(keywords, ['同城上门', 'sao货']);
  assert.equal(samples.length, 1);
  assert.equal(samples[0].id, '2026-07-homepage-lure');
  assert.deepEqual(Object.keys(REMOTE_LIST_URLS).sort(), ['keywords', 'lureSamples']);
});

test('creates a cache snapshot without account data', () => {
  const snapshot = createRemoteBlocklists({
    keywordsText: '同城上门\n主页能打',
    lureSamplesText: sampleJson,
    fetchedAt: 123
  });

  assert.deepEqual(snapshot.keywords, ['同城上门', '主页能打']);
  assert.equal(snapshot.lureSamples.length, 1);
  assert.equal(snapshot.fetchedAt, 123);
  assert.equal(snapshot.source, 'github-curated-data');
  assert.equal('accounts' in snapshot, false);
});

test('fetches both recognition files atomically', async () => {
  const responses = new Map([
    ['keywords-url', '同城上门\nsao货'],
    ['samples-url', sampleJson]
  ]);
  const fakeFetch = async url => ({
    ok: responses.has(url),
    status: responses.has(url) ? 200 : 404,
    text: async () => responses.get(url) || ''
  });

  const snapshot = await fetchRemoteBlocklists(fakeFetch, {
    keywords: 'keywords-url',
    lureSamples: 'samples-url'
  });

  assert.deepEqual(snapshot.keywords, ['同城上门', 'sao货']);
  assert.equal(snapshot.lureSamples.length, 1);
});

test('rejects a partial refresh so callers keep the previous cache', async () => {
  const fakeFetch = async url => ({
    ok: url === 'keywords-url',
    status: url === 'keywords-url' ? 200 : 503,
    text: async () => '同城上门'
  });

  await assert.rejects(
    fetchRemoteBlocklists(fakeFetch, { keywords: 'keywords-url', lureSamples: 'samples-url' }),
    /lure samples request failed: 503/
  );
});

test('remote keywords augment reply detection without account matching', () => {
  const result = evaluateTweet({
    handle: '@unknown_user',
    displayName: 'Normal User',
    tweetText: '新型暗号词 @target',
    isReply: true,
    externalLinks: []
  }, { remoteKeywords: ['新型暗号词'] });

  assert.equal(result.shouldAutoBlock, true);
  assert.ok(result.reasons.includes('remote blocked keyword: 新型暗号词'));
});

test('remote language samples affect replies but not ordinary timeline posts', () => {
  const samples = parseLureSamples(sampleJson);
  const reply = evaluateTweet({
    handle: '@unknown_user',
    displayName: '同城搭子',
    tweetText: '哥哥看看主页 今晚可以见面',
    isReply: true,
    externalLinks: []
  }, { remoteLureSamples: samples });
  const timeline = evaluateTweet({
    handle: '@unknown_user',
    displayName: '同城搭子',
    tweetText: '哥哥看看主页 今晚可以见面',
    isReply: false,
    externalLinks: []
  }, { remoteLureSamples: samples });

  assert.equal(reply.shouldAutoBlock, true);
  assert.equal(timeline.shouldAutoBlock, false);
});
