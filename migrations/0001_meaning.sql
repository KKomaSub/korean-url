-- D1 is only used for meaning-cache and accounting; redirect stays stateless.
CREATE TABLE IF NOT EXISTS meaning_cache (
 id TEXT PRIMARY KEY, interpretation TEXT NOT NULL, model TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_usage (
 day TEXT NOT NULL, ip_hash TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0,
 outage INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,ip_hash)
);
CREATE TABLE IF NOT EXISTS meaning_locks (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS api_state (id TEXT PRIMARY KEY, blocked_until INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_usage_day ON daily_usage(day);
CREATE INDEX IF NOT EXISTS idx_locks_exp ON meaning_locks(expires_at);
