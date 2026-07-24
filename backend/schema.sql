-- XYB Reports — D1 database schema
-- `wrangler d1 execute xyb-reports-db --local --file ./schema.sql`

CREATE TABLE IF NOT EXISTS reports (
  handle TEXT NOT NULL,
  client_id TEXT NOT NULL,
  reported_at INTEGER NOT NULL,
  PRIMARY KEY (handle, client_id)
);

CREATE TABLE IF NOT EXISTS approved_accounts (
  handle TEXT PRIMARY KEY,
  approved_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  client_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

-- Global request counter (sliding 1-minute window) for DDoS mitigation
CREATE TABLE IF NOT EXISTS global_rate (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL
);

-- Track clientIds that submit excessive invalid/faked verification payloads
CREATE TABLE IF NOT EXISTS client_scores (
  client_id TEXT PRIMARY KEY,
  total_requests INTEGER NOT NULL DEFAULT 0,
  rejected_requests INTEGER NOT NULL DEFAULT 0,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  banned INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS disputes (
  handle TEXT NOT NULL,
  client_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (handle, client_id)
);

-- Handles removed via community disputes (self-healing). Re-adding a demoted
-- handle requires a higher reporter threshold to prevent oscillation.
CREATE TABLE IF NOT EXISTS demoted_accounts (
  handle TEXT PRIMARY KEY,
  demoted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_handle ON reports (handle);
CREATE INDEX IF NOT EXISTS idx_rate_limits_client ON rate_limits (client_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ts ON rate_limits (timestamp);
CREATE INDEX IF NOT EXISTS idx_global_rate_ts ON global_rate (timestamp);
CREATE INDEX IF NOT EXISTS idx_disputes_handle ON disputes (handle);
