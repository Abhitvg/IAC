-- Shared, database-backed API rate limiting across horizontally scaled API instances.
-- Bucket identifiers are HMACs; raw IPs and tenant identifiers are never stored here.
BEGIN;

CREATE TABLE IF NOT EXISTS api_rate_limit_buckets (
  bucket_key char(64) PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS api_rate_limit_buckets_expiry_idx
  ON api_rate_limit_buckets (expires_at);

REVOKE ALL ON api_rate_limit_buckets FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON api_rate_limit_buckets TO careerops_app;

COMMIT;
