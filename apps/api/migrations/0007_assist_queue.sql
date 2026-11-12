-- Migration 0007: Assist Queue Table with Strict Row-Level Security
BEGIN;

CREATE TABLE assist_queue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  company text NOT NULL CHECK (length(company) BETWEEN 1 AND 160),
  role text NOT NULL CHECK (length(role) BETWEEN 1 AND 160),
  platform text NOT NULL CHECK (
    platform IN (
      'greenhouse',
      'lever',
      'ashby',
      'workable',
      'smartrecruiters',
      'workday',
      'linkedin_assist',
      'custom'
    )
  ),
  target_url text NOT NULL CHECK (length(target_url) <= 1024),
  hand_off_reason text NOT NULL CHECK (
    hand_off_reason IN (
      'captcha_detected',
      'login_required',
      'mfa_required',
      'unsupported_form_flow',
      'missing_default_answer',
      'linkedin_assist'
    )
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'opened', 'completed', 'dismissed')
  ),
  prefilled_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(prefilled_payload) = 'object'),
  assist_notes text CHECK (assist_notes IS NULL OR length(assist_notes) <= 2000),
  user_gesture_required boolean NOT NULL DEFAULT true,
  opened_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX assist_queue_tenant_status_idx
  ON assist_queue_items (tenant_id, status, created_at DESC);

CREATE INDEX assist_queue_tenant_app_idx
  ON assist_queue_items (tenant_id, application_id)
  WHERE application_id IS NOT NULL;

-- Enable and force strict Row-Level Security
ALTER TABLE assist_queue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE assist_queue_items FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_assist_queue_items
  ON assist_queue_items
  AS RESTRICTIVE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON TABLE assist_queue_items FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE assist_queue_items TO CURRENT_USER;

COMMIT;

