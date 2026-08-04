import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

const publishedSamples = parseLureSamples(
  await readFile(new URL('../blocklists/lure-samples.json', import.meta.url), 'utf8')
);

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

test('accepts safe display-name-only templates and rejects underspecified rows', () => {
  const samples = parseLureSamples(JSON.stringify({
    version: 2,
    samples: [
      {
        id: 'display-name-only',
        displayName: '催情春男用听话',
        text: '',
        category: 'cn_adult_solicitation'
      },
      {
        id: 'too-short',
        displayName: '春',
        text: 'hello',
        category: 'cn_adult_solicitation'
      }
    ]
  }));

  assert.equal(samples.length, 1);
  assert.equal(samples[0].id, 'display-name-only');
  assert.equal(samples[0].text, '');
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

test('blocks the August screenshot lure templates only in replies', () => {
  const replies = [
    {
      displayName: '邱兰🌸同城上门❤️喝茶选妃',
      tweetText: '应该没人比我玩的开了吧😡🧪我福不黑不信你看'
    },
    {
      displayName: '曹秀🌸同城上门❤️喝茶选妃',
      tweetText: '应该没人比我玩的开了吧🙂🙄我福不黑不信你看'
    },
    {
      displayName: '念卿🌸',
      tweetText: '应该没人比我玩的开了吧❄️😤我福不黑不信你看'
    },
    {
      displayName: '香卉',
      tweetText: '我果然太涩了🔔🍃有人想锐评一下我的福嘛'
    },
    {
      displayName: '碧玉',
      tweetText: '我果然太涩了🎊🌤️有人想锐评一下我的福嘛'
    },
    {
      displayName: '雁菡',
      tweetText: '我果然太涩了🍁🍟有人想锐评一下我的福嘛'
    },
    {
      displayName: '👉👉催情💊春💊男用💊听话🍬🌐',
      tweetText: 'i'
    }
  ];

  for (const sample of replies) {
    const result = evaluateTweet({ ...sample, isReply: true, externalLinks: [] }, {
      remoteLureSamples: publishedSamples
    });
    assert.equal(result.shouldHide, true, sample.displayName);
    assert.equal(result.shouldAutoBlock, true, sample.displayName);
  }

  const timeline = evaluateTweet({
    displayName: '念卿🌸',
    tweetText: '应该没人比我玩的开了吧❄️😤我福不黑不信你看',
    isReply: false,
    externalLinks: []
  }, { remoteLureSamples: publishedSamples });

  assert.equal(timeline.shouldHide, false);
  assert.equal(timeline.shouldAutoBlock, false);
});

test('does not overmatch nearby normal replies', () => {
  const samples = [
    {
      displayName: '游戏搭子',
      tweetText: '应该没人比我玩得久了吧，周末一起开黑不信你看'
    },
    {
      displayName: '春季男装',
      tweetText: 'i'
    },
    {
      displayName: '读书笔记',
      tweetText: '有人想锐评一下我的读后感吗'
    }
  ];

  for (const sample of samples) {
    const result = evaluateTweet({ ...sample, isReply: true, externalLinks: [] }, {
      remoteLureSamples: publishedSamples
    });
    assert.equal(result.shouldHide, false, sample.tweetText);
    assert.equal(result.shouldAutoBlock, false, sample.tweetText);
  }
});

test('blocks the August 4 profile-lure screenshot samples only in replies', () => {
  const replies = [
    {
      displayName: '同城牵线🌈真实可靠对接🌈点我头像',
      tweetText: '2026-08-04 15:34:53 🟨 Ive 🟦 Partially'
    },
    {
      displayName: '附近好友约见🌈真实资源🌈点我头像',
      tweetText: '2026-08-04 15:34:58 🟪 Infants 🔻 Sights'
    },
    {
      displayName: '线下资源🌈1-5线同步更新🌈看简介',
      tweetText: '2026-08-04 15:35:28 🔵 Partner 🔶 Pac,'
    }
  ];

  for (const sample of replies) {
    const result = evaluateTweet({ ...sample, isReply: true, externalLinks: [] }, {
      remoteLureSamples: publishedSamples
    });
    assert.equal(result.shouldHide, true, sample.displayName);
    assert.equal(result.shouldAutoBlock, true, sample.displayName);
  }

  const timeline = evaluateTweet({
    ...replies[0],
    isReply: false,
    externalLinks: []
  }, { remoteLureSamples: publishedSamples });

  assert.equal(timeline.shouldHide, false);
  assert.equal(timeline.shouldAutoBlock, false);
});
