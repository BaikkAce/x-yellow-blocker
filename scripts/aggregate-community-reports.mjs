import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HANDLE_PATTERN = /^[a-z0-9_]{1,20}$/i;

function normalizeHandle(value) {
  const raw = String(value || '').trim();
  const urlMatch = raw.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,20})(?:\/|$)/i);
  const candidate = (urlMatch ? urlMatch[1] : raw.replace(/^@+/, '')).toLowerCase();
  return HANDLE_PATTERN.test(candidate) ? `@${candidate}` : '';
}

function parseHandleLines(value, limit = 1000) {
  const seen = new Set();
  return String(value || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(normalizeHandle)
    .filter(Boolean)
    .filter(handle => {
      if (seen.has(handle)) return false;
      seen.add(handle);
      return true;
    })
    .slice(0, limit);
}

export function extractReportedHandles(body) {
  const section = String(body || '').match(/(?:^|\n)### Reported X handles\s*\n([\s\S]*?)(?=\n### |$)/i);
  return section ? parseHandleLines(section[1], 30) : [];
}

export function aggregateCommunityReports(issues) {
  const reports = new Map();
  for (const issue of Array.isArray(issues) ? issues : []) {
    const reporter = String(issue && issue.author && issue.author.login || '').trim().toLowerCase();
    if (!reporter) continue;
    for (const handle of extractReportedHandles(issue.body)) {
      if (!reports.has(handle)) reports.set(handle, new Set());
      reports.get(handle).add(reporter);
    }
  }
  return reports;
}

export function mergeEligibleAccounts({ existingAccounts, protectedAccounts, reports, minimumReporters = 3 }) {
  const existing = parseHandleLines((existingAccounts || []).join('\n'));
  const existingSet = new Set(existing);
  const protectedSet = new Set(parseHandleLines((protectedAccounts || []).join('\n')));
  const added = [];

  for (const [handle, reporters] of reports.entries()) {
    if (reporters.size < minimumReporters || existingSet.has(handle) || protectedSet.has(handle)) continue;
    existingSet.add(handle);
    added.push(handle);
  }

  added.sort();
  return { accounts: [...existing, ...added], added };
}

function runCli() {
  const [issuesPath, accountsPath, protectedPath] = process.argv.slice(2);
  if (!issuesPath || !accountsPath || !protectedPath) {
    throw new Error('Usage: node scripts/aggregate-community-reports.mjs ISSUES_JSON ACCOUNTS_TXT PROTECTED_TXT');
  }

  const issues = JSON.parse(fs.readFileSync(issuesPath, 'utf8'));
  const accountText = fs.readFileSync(accountsPath, 'utf8');
  const protectedText = fs.readFileSync(protectedPath, 'utf8');
  const reports = aggregateCommunityReports(issues);
  const result = mergeEligibleAccounts({
    existingAccounts: parseHandleLines(accountText),
    protectedAccounts: parseHandleLines(protectedText),
    reports,
    minimumReporters: Number(process.env.MIN_REPORTERS || 3)
  });

  if (!result.added.length) {
    console.log('No community accounts reached the reporter threshold.');
    return;
  }

  const output = `${accountText.trimEnd()}\n${result.added.join('\n')}\n`;
  fs.writeFileSync(accountsPath, output);
  console.log(`Added ${result.added.length} community account(s): ${result.added.join(', ')}`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) runCli();
