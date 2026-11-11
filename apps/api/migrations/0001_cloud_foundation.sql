-- CareerOps M0: tenant identity, controls, Sprint Contract and append-only audit log.
-- Apply with a dedicated migration role. Runtime roles must not own these tables.

BEGIN;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleting')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  role text NOT NULL CHECK (role IN ('owner', 'member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, subject),
  UNIQUE (subject)
);

CREATE TABLE IF NOT EXISTS tenant_controls (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  global_kill_switch boolean NOT NULL DEFAULT true,
  paused_channels text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (paused_channels <@ ARRAY['ats', 'email', 'calendar', 'linkedin_assist']::text[])
);

CREATE TABLE IF NOT EXISTS sprint_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  contract_json jsonb NOT NULL,
  contract_hash char(64) NOT NULL,
  accepted_by text NOT NULL,
  accepted_at timestamptz NOT NULL,
  signature char(64) NOT NULL,
  revoked_at timestamptz,
  UNIQUE (tenant_id, version),
  UNIQUE (tenant_id, contract_hash)
);

CREATE TABLE IF NOT EXISTS audit_events (
  sequence_id bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_subject text NOT NULL,
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 100),
  entity_type text NOT NULL CHECK (length(entity_type) BETWEEN 1 AND 80),
  entity_id text NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 200),
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash char(64),
  event_hash char(64) NOT NULL,
  PRIMARY KEY (tenant_id, sequence_id),
  UNIQUE (tenant_id, event_hash)
);

CREATE INDEX IF NOT EXISTS tenant_memberships_subject_idx ON tenant_memberships(subject);
CREATE INDEX IF NOT EXISTS sprint_contracts_active_idx ON sprint_contracts(tenant_id, accepted_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS audit_events_tenant_time_idx ON audit_events(tenant_id, occurred_at DESC);

-- Every request transaction sets app.user_subject before resolving membership,
-- then app.tenant_id before touching tenant-owned rows.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self_access ON tenants
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_self_lookup ON tenant_memberships
  FOR SELECT
  USING (subject = NULLIF(current_setting('app.user_subject', true), ''));

ALTER TABLE tenant_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_controls FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_controls_isolation ON tenant_controls
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE sprint_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprint_contracts FORCE ROW LEVEL SECURITY;
CREATE POLICY sprint_contracts_isolation ON sprint_contracts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_isolation ON audit_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Audit rows are append-only for the runtime role. Migration/retention roles are separate.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM CURRENT_USER;

COMMIT;
