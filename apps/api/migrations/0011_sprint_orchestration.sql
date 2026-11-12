-- Migration 0011: Sprint Orchestration, Allocations, and Auto-Pause Events
-- Hard Lines Enforced:
-- H6: Forecasts are ranges with calibration notes; no outcome guarantees.
-- Standing-Consent Auto-Pause: Triggers for bounce, spam, ATS error spike, truthfulness gate spike.

CREATE TABLE IF NOT EXISTS sprint_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES sprint_contracts(id),
  status text NOT NULL CHECK (status IN ('scheduled', 'active', 'paused', 'completed', 'aborted')),
  target_duration_hours integer NOT NULL DEFAULT 72 CHECK (target_duration_hours >= 72 AND target_duration_hours <= 96),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  config jsonb NOT NULL DEFAULT '{}',
  metrics jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sprint_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sprint_id uuid NOT NULL REFERENCES sprint_runs(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('ats', 'email', 'referral', 'linkedin_assist')),
  target_role text NOT NULL,
  template_id text NOT NULL,
  weight numeric NOT NULL DEFAULT 1.0,
  pulls integer NOT NULL DEFAULT 0,
  successes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'throttled', 'halted')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sprint_auto_pause_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sprint_id uuid NOT NULL REFERENCES sprint_runs(id) ON DELETE CASCADE,
  channel text NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'bounce_rate_spike',
    'spam_complaint',
    'mailbox_warning',
    'ats_error_spike',
    'truthfulness_gate_spike',
    'negative_reply_spike',
    'linkedin_restriction'
  )),
  metric_value numeric NOT NULL,
  threshold numeric NOT NULL,
  details text NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_sprint_runs_tenant_status ON sprint_runs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sprint_allocations_sprint ON sprint_allocations(sprint_id);
CREATE INDEX IF NOT EXISTS idx_sprint_auto_pause_tenant ON sprint_auto_pause_events(tenant_id, trigger_type);

-- Row-Level Security
ALTER TABLE sprint_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprint_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_sprint_runs ON sprint_runs;
CREATE POLICY tenant_isolation_sprint_runs ON sprint_runs
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE sprint_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprint_allocations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_sprint_allocations ON sprint_allocations;
CREATE POLICY tenant_isolation_sprint_allocations ON sprint_allocations
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE sprint_auto_pause_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprint_auto_pause_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_sprint_auto_pause ON sprint_auto_pause_events;
CREATE POLICY tenant_isolation_sprint_auto_pause ON sprint_auto_pause_events
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
