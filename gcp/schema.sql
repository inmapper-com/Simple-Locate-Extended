-- SimpleLocate logs table (Cloud SQL Postgres)
-- Run via: gcloud sql connect INSTANCE --user=postgres --database=simple_locate < gcp/schema.sql
-- Or paste into the Cloud SQL Studio / psql session.

CREATE TABLE IF NOT EXISTS test_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  session_id TEXT,
  label TEXT,
  device TEXT,
  platform TEXT,
  reason TEXT,
  entry_count INT,
  duration_ms BIGINT,
  orig_bytes INT,
  compressed BOOLEAN,
  stats JSONB,
  payload_gz TEXT,
  payload TEXT
);

CREATE INDEX IF NOT EXISTS test_logs_created_at_idx ON test_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS test_logs_label_idx ON test_logs (label);
CREATE INDEX IF NOT EXISTS test_logs_session_id_idx ON test_logs (session_id);

-- App role used by Cloud Functions (DATABASE_URL user)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE test_logs TO locate_app;
GRANT USAGE, SELECT ON SEQUENCE test_logs_id_seq TO locate_app;
