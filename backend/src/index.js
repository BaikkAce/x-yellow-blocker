// X Yellow Blocker — community report aggregation backend
// Runs on Cloudflare Workers + D1
//
// Flow:
//   Extension POST /api/report { handles, clientId, verifications }
//   Aggregates distinct clientIds per handle
//   When a handle reaches MIN_REPORTERS (1) distinct clients:
//     commits to GitHub blocklists/accounts.txt
//
// Self-healing (disputes):
//   Extension POST /api/dispute { handle, clientId }
//   When a handle reaches DISPUTE_THRESHOLD (3) distinct dispute clients:
//     removed from the shared list (demoted). Re-adding a demoted handle
//     needs RE_ADD_THRESHOLD (2) distinct reporters to prevent oscillation.
//
// Defense layers (innermost → outermost):
//   1. Request validation — body size, handle count, field types
//   2. Client reputation — auto-ban clients with high rejection rate
//   3. Per-client rate limit — 50 reports / 20 disputes per clientId per hour
//   4. Global rate limit — 1000 requests/minute total
//   5. Verification check — score ≥ 65, non-empty reasons
//   6. Cloudflare WAF — configure in dashboard (recommended: 500 req/min)
//
// Security:
//   - Anonymous clientId (random 22-char, no identity linkage)
//   - No IP logging, no user tracking
//   - Protected accounts never accepted
//   - GitHub PAT stored as Cloudflare Secret, never in client code

// 1-person sync: first distinct reporter commits the handle to the shared list.
const MIN_REPORTERS = 1;
// Demoted handles need 2 distinct reporters to re-enter (anti-flap).
const RE_ADD_THRESHOLD = 2;
// Distinct dispute clients required to remove a handle (self-healing).
const DISPUTE_THRESHOLD = 3;
const MAX_REPORTS_PER_CLIENT_PER_HOUR = 50;
const MAX_DISPUTES_PER_CLIENT_PER_HOUR = 20;
const MAX_HANDLES_PER_REQUEST = 50;
const MAX_BODY_BYTES = 16384; // 16 KB
const GLOBAL_RATE_LIMIT_PER_MINUTE = 1000;

// Client reputation: ban thresholds
const MIN_REQUESTS_FOR_REPUTATION = 20;
const MAX_REJECTION_RATE = 0.8; // 80% rejection → ban
const PROTECTED_PATH = '/blocklists/protected-accounts.txt';

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ---------------------------------------------------------------------------
// Strict handle validation — defense-in-depth before writing to GitHub
// Only @ + [a-z0-9_]{1,20} is accepted. No scripts, HTML, or arbitrary text.
// ---------------------------------------------------------------------------
const HANDLE_REGEX = /^@[a-z0-9_]{1,20}$/;
const MAX_HANDLES_PER_COMMIT = 100;
const MAX_ACCOUNTS_FILE_LINES = 50000;

function isStrictValidHandle(h) {
  return typeof h === 'string' && HANDLE_REGEX.test(h);
}

// ---------------------------------------------------------------------------
// GitHub API helper — commit new handles to accounts.txt
// ---------------------------------------------------------------------------
async function commitToGitHub(env, newHandles) {
  const { GITHUB_TOKEN, GITHUB_REPO } = env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    console.error('Missing GITHUB_TOKEN or GITHUB_REPO env vars');
    return false;
  }

  // Defense-in-depth: re-validate every handle before touching GitHub
  const sanitized = newHandles.filter(isStrictValidHandle);
  if (!sanitized.length) {
    console.warn('[commit] all handles failed strict validation, skipping commit');
    return false;
  }
  if (sanitized.length > MAX_HANDLES_PER_COMMIT) {
    console.warn(`[commit] too many handles (${sanitized.length}), truncating to ${MAX_HANDLES_PER_COMMIT}`);
    sanitized.length = MAX_HANDLES_PER_COMMIT;
  }

  const repo = GITHUB_REPO;
  const apiBase = `https://api.github.com/repos/${repo}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'xyb-worker/1.0',
    'Content-Type': 'application/json',
  };

  try {
    const getResp = await fetch(`${apiBase}/contents/blocklists/accounts.txt`, { headers });
    if (!getResp.ok) throw new Error(`Failed to fetch accounts.txt: ${getResp.status}`);
    const fileData = await getResp.json();
    const currentContent = atob(fileData.content);

    // Re-validate existing file content: only keep valid @handles and comments
    const existingLines = currentContent.split('\n');
    const existingHandles = new Set();
    for (const line of existingLines) {
      const trimmed = line.trim().toLowerCase();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (isStrictValidHandle(trimmed)) {
        existingHandles.add(trimmed);
      }
      // Non-handle lines are silently ignored (not written back)
    }

    const toAdd = sanitized.filter(h => !existingHandles.has(h.toLowerCase()));
    if (!toAdd.length) return true;

    // Safety: prevent unbounded file growth
    if (existingHandles.size + toAdd.length > MAX_ACCOUNTS_FILE_LINES) {
      console.error(`[commit] accounts.txt would exceed ${MAX_ACCOUNTS_FILE_LINES} lines, aborting`);
      return false;
    }

    // Reconstruct file with only validated content (strips any injected garbage)
    // ASCII-only header to avoid btoa() Latin1 encoding issues in Workers
    const header = '# X Yellow Blocker - community-reported accounts\n# Auto-managed by Cloudflare Worker. Do not edit manually.\n';
    const allHandles = [...existingHandles, ...toAdd].sort();
    const newContent = header + allHandles.join('\n') + '\n';
    // UTF-8 safe base64 encoding for Cloudflare Workers
    const encodedContent = btoa(String.fromCharCode(...new TextEncoder().encode(newContent)));
    const putResp = await fetch(`${apiBase}/contents/blocklists/accounts.txt`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `[auto] Add ${toAdd.length} community-reported account(s) at ${new Date().toISOString()}`,
        content: encodedContent,
        sha: fileData.sha,
        branch: 'main',
      }),
    });

    if (!putResp.ok) {
      const err = await putResp.text();
      throw new Error(`Commit failed: ${putResp.status} ${err.slice(0, 200)}`);
    }

    console.log(`[commit] added ${toAdd.length} accounts: ${toAdd.join(', ')}`);
    return true;
  } catch (error) {
    console.error('[commit] error:', error.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// GitHub API helper — remove handles from accounts.txt (self-healing demotion)
// ---------------------------------------------------------------------------
async function removeHandlesFromGitHub(env, toRemove) {
  const { GITHUB_TOKEN, GITHUB_REPO } = env;
  if (!GITHUB_TOKEN || !GITHUB_REPO || !toRemove || !toRemove.length) return false;

  const repo = GITHUB_REPO;
  const apiBase = `https://api.github.com/repos/${repo}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'xyb-worker/1.0',
    'Content-Type': 'application/json',
  };

  try {
    const getResp = await fetch(`${apiBase}/contents/blocklists/accounts.txt`, { headers });
    if (!getResp.ok) throw new Error(`Failed to fetch accounts.txt: ${getResp.status}`);
    const fileData = await getResp.json();
    const currentContent = atob(fileData.content);

    const removeSet = new Set(toRemove.map(h => String(h).toLowerCase()));
    const existingLines = currentContent.split('\n');
    const kept = [];
    let removedCount = 0;
    for (const line of existingLines) {
      const trimmed = line.trim().toLowerCase();
      if (!trimmed || trimmed.startsWith('#')) {
        kept.push(line);
        continue;
      }
      if (removeSet.has(trimmed)) {
        removedCount += 1;
        continue;
      }
      kept.push(line);
    }

    if (!removedCount) return true; // nothing to remove

    const newContent = kept.join('\n');
    const encodedContent = btoa(String.fromCharCode(...new TextEncoder().encode(newContent)));
    const putResp = await fetch(`${apiBase}/contents/blocklists/accounts.txt`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `[auto] Remove ${removedCount} disputed account(s) at ${new Date().toISOString()}`,
        content: encodedContent,
        sha: fileData.sha,
        branch: 'main',
      }),
    });

    if (!putResp.ok) {
      const err = await putResp.text();
      throw new Error(`Demote commit failed: ${putResp.status} ${err.slice(0, 200)}`);
    }

    console.log(`[demote] removed ${removedCount} account(s): ${toRemove.join(', ')}`);
    return true;
  } catch (error) {
    console.error('[demote] error:', error.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Fetch protected accounts from GitHub
// ---------------------------------------------------------------------------
async function loadProtectedAccounts(env) {
  const { GITHUB_TOKEN, GITHUB_REPO } = env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) return new Set();

  try {
    const resp = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_REPO}/main${PROTECTED_PATH}`,
      { headers: { 'User-Agent': 'xyb-worker/1.0' } }
    );
    if (!resp.ok) return new Set();
    const text = await resp.text();
    return new Set(
      text
        .split('\n')
        .map(l => l.trim().toLowerCase())
        .filter(l => l && !l.startsWith('#') && l.startsWith('@'))
    );
  } catch {
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// Handle normalization
// ---------------------------------------------------------------------------
function normalizeHandle(raw) {
  const s = String(raw || '').trim();
  const urlMatch = s.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,20})/i);
  const candidate = (urlMatch ? urlMatch[1] : s.replace(/^@+/, '')).toLowerCase();
  return /^[a-z0-9_]{1,20}$/.test(candidate) ? `@${candidate}` : '';
}

// ---------------------------------------------------------------------------
// Validate verification payload
// ---------------------------------------------------------------------------
function isValidVerification(v) {
  if (!v || typeof v !== 'object') return false;
  const score = Number(v.score);
  if (!Number.isFinite(score) || score < 65) return false;
  if (!v.category || v.category === 'protected' || v.category === 'normal') return false;
  if (!Array.isArray(v.reasons) || !v.reasons.length) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Layer 4: Global rate limit — sliding 1-minute window across ALL clients
// Prevents DDoS regardless of how many distinct clientIds attackers spawn.
// ---------------------------------------------------------------------------
async function checkGlobalRateLimit(env) {
  const db = env.DB;
  const oneMinuteAgo = Date.now() - 60000;

  // Clean old entries
  await db.prepare('DELETE FROM global_rate WHERE timestamp < ?').bind(oneMinuteAgo).run();

  const result = await db.prepare('SELECT COUNT(*) as cnt FROM global_rate').first();
  const current = result ? result.cnt : 0;

  return current < GLOBAL_RATE_LIMIT_PER_MINUTE;
}

async function recordGlobalRequest(env) {
  await env.DB.prepare('INSERT INTO global_rate (timestamp) VALUES (?)').bind(Date.now()).run();
}

// ---------------------------------------------------------------------------
// Layer 2: Client reputation — auto-ban suspicious clients
// A client with high rejection rate is likely an attacker forging payloads.
// ---------------------------------------------------------------------------
async function isClientBanned(env, clientId) {
  const db = env.DB;
  const row = await db.prepare('SELECT banned FROM client_scores WHERE client_id = ?').bind(clientId).first();
  return row && row.banned === 1;
}

async function updateClientScore(env, clientId, rejected) {
  const db = env.DB;
  const now = Date.now();

  const existing = await db.prepare('SELECT * FROM client_scores WHERE client_id = ?').bind(clientId).first();

  if (!existing) {
    await db.prepare(
      'INSERT INTO client_scores (client_id, total_requests, rejected_requests, first_seen, last_seen, banned) VALUES (?, 1, ?, ?, ?, 0)'
    ).bind(clientId, rejected ? 1 : 0, now, now).run();
    return false; // Not enough data to ban yet
  }

  const total = existing.total_requests + 1;
  const rejectedTotal = existing.rejected_requests + (rejected ? 1 : 0);

  await db.prepare(
    'UPDATE client_scores SET total_requests = ?, rejected_requests = ?, last_seen = ? WHERE client_id = ?'
  ).bind(total, rejectedTotal, now, clientId).run();

  // Ban if: enough samples AND rejection rate exceeds threshold
  if (total >= MIN_REQUESTS_FOR_REPUTATION && (rejectedTotal / total) > MAX_REJECTION_RATE) {
    await db.prepare('UPDATE client_scores SET banned = 1 WHERE client_id = ?').bind(clientId).run();
    console.warn(`[security] banned clientId ${clientId.slice(0, 8)}… — ${rejectedTotal}/${total} rejected`);
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Layer 3: Per-client rate limit — sliding 1-hour window (reports + disputes)
// ---------------------------------------------------------------------------
async function checkRateLimit(env, clientId, prefix) {
  if (!clientId) return false;
  const key = `${prefix}:${clientId}`;
  const db = env.DB;

  const oneHourAgo = Date.now() - 3600000;
  await db.prepare('DELETE FROM rate_limits WHERE client_id = ? AND timestamp < ?').bind(key, oneHourAgo).run();
  const result = await db.prepare('SELECT COUNT(*) as cnt FROM rate_limits WHERE client_id = ?').bind(key).first();
  return (result && result.cnt || 0) < MAX_REPORTS_PER_CLIENT_PER_HOUR;
}

async function recordRateEvent(env, clientId, prefix) {
  if (!clientId) return;
  const key = `${prefix}:${clientId}`;
  await env.DB.prepare('INSERT INTO rate_limits (client_id, timestamp) VALUES (?, ?)').bind(key, Date.now()).run();
}

// ---------------------------------------------------------------------------
// Periodic cleanup — prevent unbounded D1 growth
// ---------------------------------------------------------------------------
async function cleanupOldData(env) {
  const db = env.DB;
  const oneWeekAgo = Date.now() - 7 * 24 * 3600000;
  const oneDayAgo = Date.now() - 24 * 3600000;

  // Keep reports for 7 days (enough for aggregation window)
  await db.prepare('DELETE FROM reports WHERE reported_at < ?').bind(oneWeekAgo).run();

  // Rate limit entries only need 1-hour window; clean older ones
  const oneHourAgo = Date.now() - 3600000;
  await db.prepare('DELETE FROM rate_limits WHERE timestamp < ?').bind(oneHourAgo).run();

  // Global rate only needs 1-minute window
  const oneMinuteAgo = Date.now() - 60000;
  await db.prepare('DELETE FROM global_rate WHERE timestamp < ?').bind(oneMinuteAgo).run();

  // Clean old disputes (they only matter while a handle is contested)
  await db.prepare('DELETE FROM disputes WHERE created_at < ?').bind(oneWeekAgo).run();

  // Clean client_scores for banned clients after 30 days
  const thirtyDaysAgo = Date.now() - 30 * 24 * 3600000;
  await db.prepare('DELETE FROM client_scores WHERE banned = 1 AND last_seen < ?').bind(thirtyDaysAgo).run();

  // Clean demoted accounts after 30 days (allow natural re-accumulation)
  await db.prepare('DELETE FROM demoted_accounts WHERE demoted_at < ?').bind(thirtyDaysAgo).run();
}


// ---------------------------------------------------------------------------
// Main request handler
// ---------------------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Health check
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return jsonResponse({ ok: true, version: '1.0.0' });
    }

    // Get current approved accounts + dispute counts (public)
    if (request.method === 'GET' && url.pathname === '/api/stats') {
      const approved = await env.DB.prepare('SELECT COUNT(*) as total FROM approved_accounts').first();
      const disputed = await env.DB.prepare('SELECT COUNT(*) as total FROM disputes').first();
      return jsonResponse({
        total: approved ? approved.total : 0,
        disputes: disputed ? disputed.total : 0,
      });
    }

    // Report endpoint
    if (request.method === 'POST' && url.pathname === '/api/report') {
      // === Layer 1: Request validation ===
      const contentLength = Number(request.headers.get('content-length') || 0);
      if (contentLength > MAX_BODY_BYTES) {
        return jsonResponse({ error: 'request body too large' }, 413);
      }

      let body;
      try {
        const text = await request.text();
        if (text.length > MAX_BODY_BYTES) {
          return jsonResponse({ error: 'request body too large' }, 413);
        }
        body = JSON.parse(text);
      } catch {
        return jsonResponse({ error: 'invalid json' }, 400);
      }

      const { handles, clientId, verifications } = body;
      if (!Array.isArray(handles) || !handles.length || !clientId || typeof clientId !== 'string') {
        return jsonResponse({ error: 'missing handles, clientId, or verifications' }, 400);
      }

      if (clientId.length < 8 || clientId.length > 128) {
        return jsonResponse({ error: 'invalid clientId' }, 400);
      }

      if (handles.length > MAX_HANDLES_PER_REQUEST) {
        return jsonResponse({ error: `max ${MAX_HANDLES_PER_REQUEST} handles per request` }, 400);
      }

      // === Layer 2 + 4: Rate limits (must check BEFORE processing) ===
      const globalOk = await checkGlobalRateLimit(env);
      if (!globalOk) {
        return jsonResponse({ error: 'service busy, try again later' }, 429);
      }

      const alreadyBanned = await isClientBanned(env, clientId);
      if (alreadyBanned) {
        return jsonResponse({ error: 'client banned', permanent: true }, 403);
      }

      const perClientOk = await checkRateLimit(env, clientId, 'report');
      if (!perClientOk) {
        return jsonResponse({ error: 'rate limit exceeded', retryAfter: 3600 }, 429);
      }

      // Record global request first (before processing, to prevent amplification)
      await recordGlobalRequest(env);

      // === Layer 5: Load protected accounts ===
      const protectedAccounts = await loadProtectedAccounts(env);

      const results = [];
      const newlyApproved = [];
      let rejectedInThisRequest = 0;
      let acceptedInThisRequest = 0;

      for (const handle of handles) {
        const normalized = normalizeHandle(handle);
        if (!normalized) continue;
        if (protectedAccounts.has(normalized)) continue;

        // Check already approved
        const alreadyApproved = await env.DB
          .prepare('SELECT handle FROM approved_accounts WHERE handle = ?')
          .bind(normalized)
          .first();
        if (alreadyApproved) {
          results.push({ handle: normalized, status: 'already_approved' });
          acceptedInThisRequest++;
          continue;
        }

        // Verify the detection data
        const verification = verifications && verifications[handle];
        if (!isValidVerification(verification)) {
          results.push({ handle: normalized, status: 'invalid_verification' });
          rejectedInThisRequest++;
          continue;
        }

        // Insert report (INSERT OR IGNORE handles duplicate clientId+handle pairs)
        const insertReport = await env.DB
          .prepare('INSERT OR IGNORE INTO reports (handle, client_id, reported_at) VALUES (?, ?, ?)')
          .bind(normalized, clientId, Date.now())
          .run();

        // If newly inserted, record rate limit
        if (insertReport.changes > 0) {
          await recordRateEvent(env, clientId, 'report');
        }

        acceptedInThisRequest++;

        // Count distinct reporters
        const countResult = await env.DB
          .prepare('SELECT COUNT(DISTINCT client_id) as cnt FROM reports WHERE handle = ?')
          .bind(normalized)
          .first();

        const reporterCount = countResult ? countResult.cnt : 0;

        // Demoted handles need a higher threshold to re-enter (anti-flap)
        const demotedRow = await env.DB
          .prepare('SELECT handle FROM demoted_accounts WHERE handle = ?')
          .bind(normalized)
          .first();
        const needed = demotedRow ? RE_ADD_THRESHOLD : MIN_REPORTERS;

        if (reporterCount >= needed) {
          // Approve and track
          await env.DB
            .prepare('INSERT OR IGNORE INTO approved_accounts (handle, approved_at) VALUES (?, ?)')
            .bind(normalized, Date.now())
            .run();

          // Clear demotion on re-approval
          if (demotedRow) {
            await env.DB.prepare('DELETE FROM demoted_accounts WHERE handle = ?').bind(normalized).run();
          }

          newlyApproved.push(normalized);
          results.push({ handle: normalized, status: 'approved', reporters: reporterCount });
        } else {
          results.push({ handle: normalized, status: 'queued', reporters: reporterCount, needed });
        }
      }

      // === Layer 2: Update client reputation ===
      const hasRejection = rejectedInThisRequest > 0;
      const justBanned = await updateClientScore(env, clientId, hasRejection);
      if (justBanned) {
        return jsonResponse({ error: 'client banned due to suspicious activity', permanent: true }, 403);
      }

      // Commit newly approved accounts to GitHub (non-blocking)
      if (newlyApproved.length > 0) {
        ctx.waitUntil(commitToGitHub(env, newlyApproved));
      }

      // Periodic cleanup (non-blocking, runs once per ~100 requests probabilistically)
      if (Math.random() < 0.01) {
        ctx.waitUntil(cleanupOldData(env));
      }

      return jsonResponse({ results });
    }

    // Dispute endpoint — self-healing: flag a synced account as a false positive
    if (request.method === 'POST' && url.pathname === '/api/dispute') {
      const contentLength = Number(request.headers.get('content-length') || 0);
      if (contentLength > MAX_BODY_BYTES) {
        return jsonResponse({ error: 'request body too large' }, 413);
      }

      let body;
      try {
        const text = await request.text();
        if (text.length > MAX_BODY_BYTES) {
          return jsonResponse({ error: 'request body too large' }, 413);
        }
        body = JSON.parse(text);
      } catch {
        return jsonResponse({ error: 'invalid json' }, 400);
      }

      const { handle, clientId } = body;
      if (!handle || !clientId || typeof clientId !== 'string') {
        return jsonResponse({ error: 'missing handle or clientId' }, 400);
      }
      if (clientId.length < 8 || clientId.length > 128) {
        return jsonResponse({ error: 'invalid clientId' }, 400);
      }

      const normalized = normalizeHandle(handle);
      if (!isStrictValidHandle(normalized)) {
        return jsonResponse({ error: 'invalid handle' }, 400);
      }

      // === Rate limits ===
      const globalOk = await checkGlobalRateLimit(env);
      if (!globalOk) {
        return jsonResponse({ error: 'service busy, try again later' }, 429);
      }
      const alreadyBanned = await isClientBanned(env, clientId);
      if (alreadyBanned) {
        return jsonResponse({ error: 'client banned', permanent: true }, 403);
      }
      const perClientOk = await checkRateLimit(env, clientId, 'dispute');
      if (!perClientOk) {
        return jsonResponse({ error: 'rate limit exceeded', retryAfter: 3600 }, 429);
      }
      await recordGlobalRequest(env);

      // Never dispute a protected account
      const protectedAccounts = await loadProtectedAccounts(env);
      if (protectedAccounts.has(normalized)) {
        return jsonResponse({ handle: normalized, status: 'protected' });
      }

      // Record dispute (dedupe per clientId+handle)
      const insertDispute = await env.DB
        .prepare('INSERT OR IGNORE INTO disputes (handle, client_id, created_at) VALUES (?, ?, ?)')
        .bind(normalized, clientId, Date.now())
        .run();
      if (insertDispute.changes > 0) {
        await recordRateEvent(env, clientId, 'dispute');
      }

      const countResult = await env.DB
        .prepare('SELECT COUNT(DISTINCT client_id) as cnt FROM disputes WHERE handle = ?')
        .bind(normalized)
        .first();
      const disputeCount = countResult ? countResult.cnt : 0;

      if (disputeCount >= DISPUTE_THRESHOLD) {
        // Self-healing: remove from shared list
        const approvedRow = await env.DB
          .prepare('SELECT handle FROM approved_accounts WHERE handle = ?')
          .bind(normalized)
          .first();

        if (approvedRow) {
          await env.DB.prepare('DELETE FROM approved_accounts WHERE handle = ?').bind(normalized).run();
          ctx.waitUntil(removeHandlesFromGitHub(env, [normalized]));
        }
        // Mark demoted so re-adding needs RE_ADD_THRESHOLD distinct reporters
        await env.DB
          .prepare('INSERT OR REPLACE INTO demoted_accounts (handle, demoted_at) VALUES (?, ?)')
          .bind(normalized, Date.now())
          .run();
        // Drop accumulated reports/disputes so re-entry requires fresh signal
        await env.DB.prepare('DELETE FROM reports WHERE handle = ?').bind(normalized).run();
        await env.DB.prepare('DELETE FROM disputes WHERE handle = ?').bind(normalized).run();

        return jsonResponse({ handle: normalized, status: 'demoted', disputes: disputeCount });
      }

      return jsonResponse({ handle: normalized, status: 'recorded', disputes: disputeCount });
    }

    // Fallback
    return jsonResponse({ error: 'not found' }, 404);
  },
};
