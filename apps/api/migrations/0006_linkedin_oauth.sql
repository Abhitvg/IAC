-- LinkedIn OAuth state and encrypted token envelopes.
-- Access/refresh tokens are encrypted with the tenant envelope cipher; plaintext tokens never enter PostgreSQL.
BEGIN;

CREATE TABLE IF NOT EXISTS linkedin_oauth_states (
  state_hash char(64) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject text NOT NULL,
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_oauth_states_expiry_idx
  ON linkedin_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS linkedin_connections (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject text NOT NULL,
  token_envelope jsonb NOT NULL,
  granted_scopes text[] NOT NULL DEFAULT '{}',
  token_expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, subject)
);

ALTER TABLE linkedin_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_oauth_states FORCE ROW LEVEL SECURITY;
CREATE POLICY linkedin_oauth_states_tenant_isolation ON linkedin_oauth_states
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE linkedin_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY linkedin_connections_tenant_isolation ON linkedin_connections
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

COMMIT;
