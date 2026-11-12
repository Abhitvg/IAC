-- Migration 0012: Experiments, Analytics, and DSAR Requests
-- Hard Lines Enforced:
-- H3/H6: Experiments on CV headlines and outreach hooks must respect confirmed Career Graph and zero guarantees.
-- Privacy: GDPR / CCPA / DPDP full data export and deletion logs.

CREATE TABLE IF NOT EXISTS experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_dimension text NOT NULL CHECK (target_dimension IN ('cv_headline', 'outreach_hook')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('draft', 'running', 'concluded', 'halted')),
  min_sample_size integer NOT NULL DEFAULT 30,
  winner_variant_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS experiment_variants (
  id text NOT NULL,
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  content text NOT NULL,
  allocation_weight numeric NOT NULL DEFAULT 1.0,
  impressions integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  PRIMARY KEY (experiment_id, id)
);

CREATE TABLE IF NOT EXISTS experiment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  variant_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'conversion', 'reply', 'interview')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dsar_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('export', 'delete')),
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  requester_subject text NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_experiments_tenant ON experiments(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_experiment_events_exp ON experiment_events(experiment_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_dsar_requests_tenant ON dsar_requests(tenant_id, request_type);

-- Row-Level Security
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_experiments ON experiments;
CREATE POLICY tenant_isolation_experiments ON experiments
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE experiment_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_variants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_experiment_variants ON experiment_variants;
CREATE POLICY tenant_isolation_experiment_variants ON experiment_variants
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE experiment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_experiment_events ON experiment_events;
CREATE POLICY tenant_isolation_experiment_events ON experiment_events
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE dsar_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE dsar_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_dsar_requests ON dsar_requests;
CREATE POLICY tenant_isolation_dsar_requests ON dsar_requests
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

