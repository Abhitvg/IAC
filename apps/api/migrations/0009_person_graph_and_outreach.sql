-- Migration 0009: Person Graph, Suppression List, and Outreach Messages with Strict Tenant RLS
BEGIN;

CREATE TABLE people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (length(email) <= 254),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  company text NOT NULL CHECK (length(company) BETWEEN 1 AND 160),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  role_domain text NOT NULL CHECK (
    role_domain IN ('recruiter', 'hiring_manager', 'peer_engineer', 'alumni', 'executive', 'other')
  ),
  relationship text NOT NULL CHECK (
    relationship IN ('1st_degree', 'alumni', 'ex_colleague', 'conference_speaker', 'open_source', 'cold')
  ),
  verification_source text NOT NULL CHECK (
    verification_source IN ('licensed_provider', 'public_company_page', 'user_imported_connection')
  ),
  time_zone text NOT NULL DEFAULT 'America/New_York' CHECK (length(time_zone) <= 64),
  linkedin_url text CHECK (linkedin_url IS NULL OR length(linkedin_url) <= 1024),
  last_contacted_at timestamptz,
  crm_stage text NOT NULL DEFAULT 'lead' CHECK (
    crm_stage IN ('lead', 'contacted', 'replied', 'meeting_scheduled', 'opted_out', 'closed')
  ),
  notes text CHECK (notes IS NULL OR length(notes) <= 4000),
  how_i_can_help text CHECK (how_i_can_help IS NULL OR length(how_i_can_help) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, email)
);

CREATE INDEX people_tenant_company_idx
  ON people (tenant_id, company, crm_stage);

ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE people FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_people
  ON people
  AS RESTRICTIVE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON TABLE people FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE people TO CURRENT_USER;

CREATE TABLE suppression_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text CHECK (email IS NULL OR length(email) <= 254),
  domain text CHECK (domain IS NULL OR length(domain) <= 254),
  reason text NOT NULL CHECK (reason IN ('opt_out', 'bounce', 'spam_complaint', 'manual')),
  suppressed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK (email IS NOT NULL OR domain IS NOT NULL)
);

CREATE INDEX suppression_tenant_email_idx
  ON suppression_list (tenant_id, email)
  WHERE email IS NOT NULL;

CREATE INDEX suppression_tenant_domain_idx
  ON suppression_list (tenant_id, domain)
  WHERE domain IS NOT NULL;

ALTER TABLE suppression_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppression_list FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_suppression_list
  ON suppression_list
  AS RESTRICTIVE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON TABLE suppression_list FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE suppression_list TO CURRENT_USER;

CREATE TABLE outreach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  sequence_step int NOT NULL DEFAULT 1 CHECK (sequence_step BETWEEN 1 AND 3),
  subject text NOT NULL CHECK (length(subject) <= 500),
  body_text text NOT NULL CHECK (length(body_text) <= 5000),
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent' CHECK (
    status IN ('sent', 'delivered', 'bounced', 'replied', 'opted_out')
  ),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX outreach_tenant_person_idx
  ON outreach_messages (tenant_id, person_id, sent_at DESC);

ALTER TABLE outreach_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_outreach_messages
  ON outreach_messages
  AS RESTRICTIVE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON TABLE outreach_messages FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE outreach_messages TO CURRENT_USER;

COMMIT;

