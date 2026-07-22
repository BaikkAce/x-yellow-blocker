import assert from 'node:assert/strict';
import test from 'node:test';

await import('../src/remote-lists.js');
await import('../src/defaults.js');
await import('../src/detector.js');

const {
  parseKeywordList,
  parseAccountList,
  createRemoteBlocklists,
  normalizeBlockedAccount,
  fetchRemoteBlocklists
} = globalThis.XybRemoteLists;
const { evaluateTweet } = globalThis.XybDetector;

test('parses public blocklists with comments, blanks, and duplicates', () => {
  const keywords = parseKeywordList('# comment\n同城上门\n\nsao货\n同城上门\n');
  const accounts = parseAccountList('# spam authors\n@Spam_User\nspam_user\nhttps://x.com/AnotherSpam\n');

  assert.deepEqual(keywords, ['同城上门', 'sao货']);
  assert.deepEqual(accounts, ['@spam_user', '@anotherspam']);
  assert.equal(normalizeBlockedAccount('https://twitter.com/Test_User/status/1'), '@test_user');
});

test('creates a cacheable remote list snapshot', () => {
  const snapshot = createRemoteBlocklists({
    keywordsText: '同城上门\n主页能打',
    accountsText: '@spam_one\n@spam_two',
    fetchedAt: 123
  });

  assert.deepEqual(snapshot.keywords, ['同城上门', '主页能打']);
  assert.deepEqual(snapshot.accounts, ['@spam_one', '@spam_two']);
  assert.equal(snapshot.fetchedAt, 123);
});

test('fetches both public lists into one cache snapshot', async () => {
  const responses = new Map([
    ['keywords-url', '同城上门\nsao货'],
    ['accounts-url', '@spam_one\n@spam_two']
  ]);
  const fakeFetch = async url => ({
    ok: responses.has(url),
    status: responses.has(url) ? 200 : 404,
    text: async () => responses.get(url) || ''
  });

  const snapshot = await fetchRemoteBlocklists(fakeFetch, {
    keywords: 'keywords-url',
    accounts: 'accounts-url'
  });

  assert.deepEqual(snapshot.keywords, ['同城上门', 'sao货']);
  assert.deepEqual(snapshot.accounts, ['@spam_one', '@spam_two']);
  assert.equal(snapshot.source, 'github');
});

test('rejects a partial remote refresh so callers keep the previous cache', async () => {
  const fakeFetch = async url => ({
    ok: url === 'keywords-url',
    status: url === 'keywords-url' ? 200 : 503,
    text: async () => '同城上门'
  });

  await assert.rejects(
    fetchRemoteBlocklists(fakeFetch, { keywords: 'keywords-url', accounts: 'accounts-url' }),
    /accounts list request failed: 503/
  );
});

test('remote blocked accounts are always auto-block candidates', () => {
  const result = evaluateTweet({
    handle: '@Known_Spam',
    displayName: 'Normal User',
    tweetText: 'ordinary text',
    isReply: false,
    externalLinks: []
  }, { blockedAccounts: ['@known_spam'] });

  assert.equal(result.shouldAutoBlock, true);
  assert.ok(result.reasons.includes('remote blocked account'));
});

test('remote keywords augment the detector without changing built-in rules', () => {
  const result = evaluateTweet({
    handle: '@unknown_user',
    displayName: 'Normal User',
    tweetText: '新型暗号词 @target',
    isReply: false,
    externalLinks: []
  }, { remoteKeywords: ['新型暗号词'] });

  assert.equal(result.shouldAutoBlock, true);
  assert.ok(result.reasons.includes('remote blocked keyword: 新型暗号词'));
});
