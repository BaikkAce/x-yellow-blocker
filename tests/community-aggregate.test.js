import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateCommunityReports,
  extractReportedHandles,
  mergeEligibleAccounts
} from '../scripts/aggregate-community-reports.mjs';

test('extracts only valid handles from the issue form handle section', () => {
  const body = [
    '### Reported X handles',
    '',
    '@One',
    'https://x.com/Two',
    'not a handle',
    '',
    '### Extension version',
    '',
    '0.4.0',
    '',
    '@outside_section'
  ].join('\n');

  assert.deepEqual(extractReportedHandles(body), ['@one', '@two']);
});

test('counts each GitHub reporter once per handle', () => {
  const issue = body => ({ body, author: { login: 'alice' } });
  const reports = aggregateCommunityReports([
    issue('### Reported X handles\n\n@spam_one\n@spam_one\n\n### Extension version\n\n0.4.0'),
    { body: '### Reported X handles\n\n@spam_one\n\n### Extension version\n\n0.4.0', author: { login: 'bob' } }
  ]);

  assert.equal(reports.get('@spam_one').size, 2);
});

test('merges only quorum accounts and protects owner allowlist', () => {
  const reports = new Map([
    ['@quorum_spam', new Set(['alice', 'bob', 'carol'])],
    ['@one_report', new Set(['alice'])],
    ['@trusted', new Set(['alice', 'bob', 'carol', 'dave'])]
  ]);

  const merged = mergeEligibleAccounts({
    existingAccounts: ['@existing'],
    protectedAccounts: ['@trusted'],
    reports,
    minimumReporters: 3
  });

  assert.deepEqual(merged.added, ['@quorum_spam']);
  assert.deepEqual(merged.accounts, ['@existing', '@quorum_spam']);
});
