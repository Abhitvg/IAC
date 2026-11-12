-- Migration 0006: Application Tracker, State Machine Events, and Activity Feed
BEGIN;

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  company text NOT NULL CHECK (length(company) BETWEEN 1 AND 160),
  role text NOT NULL CHECK (length(role) BETWEEN 1 AND 160),
  source_url text CHECK (source_url IS NULL OR length(source_url) <= 1024),
  external_job_id text CHECK (external_job_id IS NULL OR length(external_job_id) <= 256),
  status text NOT NULL CHECK (
    status IN (
      'scouted',
      'evaluated',
      'tailored',
      'queued',
      'submitting',
      'applied',
      'outreach_sent',
      'replied',
      'interviewing',
      'offer',
      'rejected',
      'withdrawn',
      'archived'
    )
  ),
  channel text NOT NULL CHECK (channel IN ('ats', 'email', 'linkedin_assist', 'calendar')),
  score numeric(3, 2) CHECK (score IS NULL OR (score >= 1.00 AND score <= 5.00)),
  submission_proof jsonb CHECK (submission_proof IS NULL OR jsonb_typeof(submission_proof) = 'object'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, company, role, external_job_id)
);

CREATE INDEX applications_tenant_status_idx
  ON applications (tenant_id, status, updated_at DESC);

CREATE TABLE application_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  application_id uuid NOT NULL,
  from_status text CHECK (
    from_status IS NULL OR from_status IN (
      'scouted',
      'evaluated',
      'tailored',
      'queued',
      'submitting',
      'applied',
      'outreach_sent',
      'replied',
      'interviewing',
      'offer',
      'rejected',
      'withdrawn',
      'archived'
    )
  ),
  to_status text NOT NULL CHECK (
    to_status IN (
      'scouted',
      'evaluated',
      'tailored',
      'queued',
      'submitting',
      'applied',
      'outreach_sent',
      'replied',
      'interviewing',
      'offer',
      'rejected',
      'withdrawn',
      'archived'
    )
  ),
  reason text CHECK (reason IS NULL OR length(reason) <= 512),
  actor_subject text NOT NULL CHECK (length(actor_subject) BETWEEN 1 AND 255),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, application_id) REFERENCES applications(tenant_id, id)
);

CREATE INDEX application_timeline_events_idx
  ON application_timeline_events (tenant_id, application_id, created_at ASC);

CREATE TABLE activity_feed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 64),
  severity text NOT NULL CHECK (severity IN ('info', 'warn', 'error', 'success')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 255),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 4000),
  actor_subject text NOT NULL CHECK (length(actor_subject) BETWEEN 1 AND 255),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activity_feed_events_tenant_idx
  ON activity_feed_events (tenant_id, created_at DESC);

-- Enable Forced Row Level Security
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications FORCE ROW LEVEL SECURITY;
CREATE POLICY applications_tenant_isolation ON applications
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE application_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_timeline_events FORCE ROW LEVEL SECURITY;
CREATE POLICY application_timeline_events_tenant_isolation ON application_timeline_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE activity_feed_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed_events FORCE ROW LEVEL SECURITY;
CREATE POLICY activity_feed_events_tenant_isolation ON activity_feed_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Append-only triggers for events
CREATE OR REPLACE FUNCTION reject_timeline_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Timeline and activity feed events are append-only';
END;
$$;

CREATE TRIGGER application_timeline_no_update_delete
BEFORE UPDATE OR DELETE ON application_timeline_events
FOR EACH ROW EXECUTE FUNCTION reject_timeline_mutation();

CREATE TRIGGER application_timeline_no_truncate
BEFORE TRUNCATE ON application_timeline_events
FOR EACH STATEMENT EXECUTE FUNCTION reject_timeline_mutation();

CREATE TRIGGER activity_feed_no_update_delete
BEFORE UPDATE OR DELETE ON activity_feed_events
FOR EACH ROW EXECUTE FUNCTION reject_timeline_mutation();

CREATE TRIGGER activity_feed_no_truncate
BEFORE TRUNCATE ON activity_feed_events
FOR EACH STATEMENT EXECUTE FUNCTION reject_timeline_mutation();

-- Grants
GRANT SELECT, INSERT, UPDATE ON applications TO careerops_app;
GRANT SELECT, INSERT ON application_timeline_events, activity_feed_events TO careerops_app;

COMMIT;

