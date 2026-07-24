# XYB Community Reports Backend

Cloudflare Worker + D1 that aggregates anonymous community reports and commits to GitHub.

## Deployment

### Prerequisites

- Cloudflare account
- `wrangler` CLI installed: `npm install -g wrangler`
- GitHub fine-grained PAT with:
  - Repository: `BaikkAce/x-yellow-blocker`
  - Permissions: `Contents: Read and write`

### One-time setup

```bash
# 1. Login
wrangler login

# 2. Create D1 database
wrangler d1 create xyb-reports-db

# 3. Copy the database_id output into wrangler.toml (both places)

# 4. Initialize database schema
wrangler d1 execute xyb-reports-db --local --file schema.sql

# 5. Set secrets
wrangler secret put GITHUB_TOKEN       # paste your fine-grained PAT
wrangler secret put GITHUB_REPO        # BaikkAce/x-yellow-blocker

# 6. Deploy
wrangler deploy

# 7. Copy the worker URL (e.g. https://xyb-reports.YOUR_SUBDOMAIN.workers.dev)
#    and update WORKER_URL in src/defaults.js
```

### Production schema

```bash
wrangler d1 execute xyb-reports-db --remote --file schema.sql
```

## Defense Layers

| Layer | Mechanism | What it blocks |
|-------|-----------|----------------|
| 1 | Request validation | Body >16KB, >50 handles, malformed JSON |
| 2 | Client reputation | Clients with >80% rejection rate after 20+ attempts get **permanently banned** |
| 3 | Per-client rate limit | 50 reports/clientId/hour |
| 4 | Global rate limit | 1000 requests/minute total (all clients combined) |
| 5 | Verification check | score ≥ 65, non-empty category, non-empty reasons |
| **6** | **Cloudflare WAF** | **Configure in dashboard — see below** |

### Layer 6: Cloudflare WAF (critical — must configure)

The Worker's code-level global rate limit (1000/min) runs *inside* the Worker. Under extreme DDoS,
the Worker itself still gets invoked. Cloudflare WAF runs *before* the Worker — requests never
reach your code. **This is the strongest defense layer.**

Go to your Cloudflare dashboard:
1. Select your Workers domain
2. **Security → WAF → Rate limiting rules**
3. Create a rule:

```
Field:     URI Path
Operator:  equals
Value:     /api/report

Rate:      500 requests per 1 minute
Action:    Block
Response:  429 Too Many Requests
```

This means: **at most 500 POST /api/report per minute total, enforced at edge.**

For paid plans, you can also configure:
- DDoS Protection settings (under Security → DDoS)
- Bot Fight Mode (blocks automated traffic patterns)

### Cost Protection

- **Free tier**: 100,000 requests/day. With WAF at 500/min, max effective daily load is 720,000,
  but the Worker's own 1000/min global limit caps it lower. Free tier is sufficient for normal use.
- If under attack: Cloudflare's free DDoS protection absorbs traffic before WAF drops it —
  you won't be billed for blocked requests.
- Set a spending cap in your Cloudflare account to prevent any billing surprises.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/stats` | Approved accounts count |
| POST | `/api/report` | Submit blocked handles |

### POST /api/report

**Limits**: max 50 handles per request, max 16KB body

```json
{
  "handles": ["@spam_user"],
  "clientId": "abc123def456ghi789jkl0",
  "verifications": {
    "@spam_user": {
      "score": 95,
      "category": "cn_adult_solicitation",
      "reasons": ["explicit Chinese adult term", "contact lure"]
    }
  }
}
```

### Error responses

| Status | Meaning |
|--------|---------|
| 400 | Invalid request (bad JSON, missing fields, too many handles) |
| 403 | Client permanently banned (excessive invalid verification payloads) |
| 413 | Request body too large (>16KB) |
| 429 | Rate limited (per-client or global) |

## Security properties

- Anonymous clientId: random 22-char per installation, no identity linkage
- Rate limit: 50 reports/hour per clientId + 1000 req/min global
- Client reputation: auto-ban after 20+ requests with >80% rejection rate
- Verification: each report requires score ≥ 65 + detection reasons
- Threshold: 3 distinct clients required before committing to GitHub
- Protected accounts: never accepted for reporting
- No IP logging, no user tracking
- GitHub token stored as Cloudflare Secret, never in extension code
- Periodic cleanup: old data purged automatically (1min–30day windows per table)
