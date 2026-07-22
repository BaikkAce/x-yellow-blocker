import assert from 'node:assert/strict';
import test from 'node:test';

await import('../src/community-sharing.js');
const {
  enqueueCommunityReport,
  buildCommunityIssueUrl,
  markCommunityReportsSubmitted
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
