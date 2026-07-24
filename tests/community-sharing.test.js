import assert from 'node:assert/strict';
import test from 'node:test';

await import('../src/community-sharing.js');
const {
  enqueueCommunityReport,
  buildCommunityIssueUrl,
  markCommunityReportsSubmitted,
  generateClientId,
  buildVerificationPayload,
  loadAutoReportedCache,
  saveAutoReportedCache,
  wasAlreadyAutoReported
} = globalThis.XybCommunitySharing;

test('queues only normalized unique blocked handles', () => {
  let state = enqueueCommunityReport(null, '@Spam_User', 100);
  state = enqueueCommunityReport(state, 'spam_user', 200);
  state = enqueueCommunityReport(state, 'not a handle', 300);

  assert.deepEqual(state.pending, ['@spam_user']);
  assert.equal(state.updatedAt, 100);
});

test('does not queue handles that were already submitted', () => {
  const state = enqueueCommunityReport({
    pending: [],
    submitted: ['@known_spam'],
    updatedAt: 100
  }, '@Known_Spam', 200);

  assert.deepEqual(state.pending, []);
  assert.deepEqual(state.submitted, ['@known_spam']);
});

test('builds a GitHub issue URL without putting reported handles in query parameters', () => {
  const url = new URL(buildCommunityIssueUrl('0.4.0'));

  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/BaikkAce/x-yellow-blocker/issues/new');
  assert.equal(url.searchParams.get('template'), 'community-block-report.yml');
  assert.equal(url.searchParams.get('version'), '0.4.0');
  assert.equal(url.searchParams.has('handles'), false);
  assert.equal(url.searchParams.has('body'), false);
});

test('moves an opened report batch out of the pending queue', () => {
  const state = markCommunityReportsSubmitted({
    pending: ['@one', '@two', '@three'],
    submitted: [],
    updatedAt: 100
  }, ['@one', '@three'], 200);

  assert.deepEqual(state.pending, ['@two']);
  assert.deepEqual(state.submitted, ['@one', '@three']);
  assert.equal(state.updatedAt, 200);
});

// --- auto-report ---

test('generateClientId creates 22-char alphanumeric string', () => {
  const id1 = generateClientId();
  const id2 = generateClientId();

  assert.equal(typeof id1, 'string');
  assert.equal(id1.length, 22);
  assert.match(id1, /^[a-z0-9]{22}$/);
  // Uniqueness: two consecutive calls should produce different values
  assert.notEqual(id1, id2);
});

test('buildVerificationPayload extracts score and reasons from verdict', () => {
  const verdict = {
    score: 85,
    category: 'adult_solicitation',
    reasons: ['display-name adult keyword', 'reply contains lure'],
    shouldHide: true,
    shouldAutoBlock: true
  };

  const payload = buildVerificationPayload(verdict);
  assert.equal(payload.score, 85);
  assert.equal(payload.category, 'adult_solicitation');
  assert.deepEqual(payload.reasons, ['display-name adult keyword', 'reply contains lure']);
});

test('buildVerificationPayload returns null for missing verdict', () => {
  assert.equal(buildVerificationPayload(null), null);
  assert.equal(buildVerificationPayload(undefined), null);
});

test('buildVerificationPayload defaults missing fields', () => {
  const payload = buildVerificationPayload({});
  assert.equal(payload.score, 0);
  assert.equal(payload.category, '');
  assert.deepEqual(payload.reasons, []);
});

test('loadAutoReportedCache parses stored handles', async () => {
  const mockGet = async (key) => ({ autoReported: ['@spam1', '@Spam1', '@spam2'] });
  const cache = await loadAutoReportedCache(mockGet);

  assert.ok(Array.isArray(cache));
  assert.ok(cache.includes('@spam1'));
  assert.ok(cache.includes('@spam2'));
  // Deduplication happens at the save stage; load just normalizes
});

test('loadAutoReportedCache handles missing data', async () => {
  const mockGet = async () => ({});
  const cache = await loadAutoReportedCache(mockGet);
  assert.deepEqual(cache, []);
});

test('wasAlreadyAutoReported detects existing handles', () => {
  const cache = ['@spam1', '@spam2'];

  assert.equal(wasAlreadyAutoReported(cache, '@spam1'), true);
  assert.equal(wasAlreadyAutoReported(cache, '  @SPAM1  '), true);
  assert.equal(wasAlreadyAutoReported(cache, '@new_spam'), false);
  // Empty/invalid handle returns falsy (normalizeHandle produces '')
  assert.ok(!wasAlreadyAutoReported(cache, ''));
});

test('saveAutoReportedCache appends and enforces max size', async () => {
  const stored = {};
  const mockSet = async (items) => { Object.assign(stored, items); };

  let cache = [];
  cache = await saveAutoReportedCache(mockSet, cache, '@spam1');
  assert.ok(stored.autoReported.includes('@spam1'));
  assert.ok(cache.includes('@spam1'));

  cache = await saveAutoReportedCache(mockSet, cache, '@spam1'); // duplicate
  // saveAutoReportedCache always appends; caller (content.js) checks wasAlreadyAutoReported first
  assert.ok(cache.length > 1); // Both '@spam1' entries present

  // Test max cache enforcement
  const initial = [];
  let bigCache = initial;
  for (let i = 0; i < 600; i++) {
    bigCache = await saveAutoReportedCache(mockSet, bigCache, `@user${i}`);
  }
  // Default MAX_AUTO_REPORTED_CACHE is 500
  assert.ok(bigCache.length <= 500);
  assert.equal(bigCache[0], '@user100'); // first 100 dropped
});

test('getOrCreateClientId generates and persists clientId', async () => {
  const storage = {};
  const mockGet = async (key) => {
    if (key === 'xybClientId') return storage;
    return {};
  };
  const mockSet = async (items) => { Object.assign(storage, items); };

  // First call: generates new id
  const id1 = await globalThis.XybCommunitySharing.getOrCreateClientId(mockGet, mockSet);
  assert.equal(typeof id1, 'string');
  assert.equal(id1.length, 22);

  // Second call: returns same id
  const id2 = await globalThis.XybCommunitySharing.getOrCreateClientId(mockGet, mockSet);
  assert.equal(id1, id2);
});
