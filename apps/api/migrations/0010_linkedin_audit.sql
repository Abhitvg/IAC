-- Migration 0010: LinkedIn Profile Audits with Strict Tenant RLS
BEGIN;

CREATE TABLE linkedin_profile_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  overall_score int NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  headline_score int NOT NULL CHECK (headline_score BETWEEN 0 AND 100),
  about_score int NOT NULL CHECK (about_score BETWEEN 0 AND 100),
  skills_score int NOT NULL CHECK (skills_score BETWEEN 0 AND 100),
  suggested_headline text NOT NULL CHECK (length(suggested_headline) <= 500),
  suggested_about text NOT NULL CHECK (length(suggested_about) <= 4000),
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(recommendations) = 'array'),
  open_to_work_guidance jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(open_to_work_guidance) = 'object'),
  audited_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX linkedin_audits_tenant_idx
  ON linkedin_profile_audits (tenant_id, audited_at DESC);

ALTER TABLE linkedin_profile_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_profile_audits FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_linkedin_profile_audits
  ON linkedin_profile_audits
  AS RESTRICTIVE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON TABLE linkedin_profile_audits FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE linkedin_profile_audits TO CURRENT_USER;

COMMIT;

