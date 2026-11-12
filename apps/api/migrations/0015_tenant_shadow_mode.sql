-- Migration 0015: Tenant Shadow Mode and Dry-Run Execution Reports
-- Hard Lines Enforced:
-- H1: Zero unattended LinkedIn automation
-- H2: Zero CAPTCHA bypass
-- H3: Truthfulness Gate (unverified claims blocked and reported)
-- H4: Verified provenance only
-- H6: Zero outcome guarantees

ALTER TABLE tenant_controls
  ADD COLUMN IF NOT EXISTS shadow_mode boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS shadow_execution_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sprint_id uuid,
  run_at timestamptz NOT NULL DEFAULT now(),
  simulated_submits jsonb NOT NULL DEFAULT '[]',
  simulated_outreach jsonb NOT NULL DEFAULT '[]',
  truthfulness_blocks jsonb NOT NULL DEFAULT '[]',
  cap_suppression_decisions jsonb NOT NULL DEFAULT '[]',
  summary jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_reports_tenant_run ON shadow_execution_reports(tenant_id, run_at DESC);

-- Enable RLS with FORCE
ALTER TABLE shadow_execution_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE shadow_execution_reports FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_shadow_execution_reports ON shadow_execution_reports;
CREATE POLICY tenant_isolation_shadow_execution_reports ON shadow_execution_reports
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Grant privileges to non-owner runtime role if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'careerops_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON shadow_execution_reports TO careerops_app;
  END IF;
END $$;

