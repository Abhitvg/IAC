-- Tenant-scoped LinkedIn text-post schedule with idempotency and a restricted worker API.
BEGIN;

CREATE TABLE linkedin_scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{12,64}$'),
  commentary text NOT NULL CHECK (length(btrim(commentary)) BETWEEN 1 AND 3000),
  scheduled_at timestamptz NOT NULL,
  next_attempt_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'processing', 'published', 'failed', 'cancelled', 'unknown_outcome', 'needs_review')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 100),
  lock_expires_at timestamptz,
  published_post_urn text CHECK (published_post_urn IS NULL OR length(published_post_urn) <= 512),
  error_code text CHECK (error_code IS NULL OR length(error_code) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, subject, idempotency_key)
);

CREATE INDEX linkedin_scheduled_posts_due_idx
  ON linkedin_scheduled_posts(next_attempt_at, created_at)
  WHERE status = 'scheduled';

CREATE INDEX linkedin_scheduled_posts_tenant_subject_idx
  ON linkedin_scheduled_posts(tenant_id, subject, scheduled_at DESC);

ALTER TABLE linkedin_scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_scheduled_posts FORCE ROW LEVEL SECURITY;

CREATE POLICY linkedin_scheduled_posts_member_isolation
  ON linkedin_scheduled_posts
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND subject = NULLIF(current_setting('app.user_subject', true), '')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND subject = NULLIF(current_setting('app.user_subject', true), '')
  );

-- The deployed runtime role must have explicit table grants for the earlier LinkedIn token tables.
GRANT SELECT, INSERT, DELETE ON linkedin_oauth_states TO careerops_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON linkedin_connections TO careerops_app;
GRANT SELECT, INSERT ON linkedin_scheduled_posts TO careerops_app;

-- No-login BYPASSRLS role is used only as SECURITY DEFINER function owner.
-- It cannot connect and the application role receives no membership in it.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'careerops_scheduler_fn') THEN
    CREATE ROLE careerops_scheduler_fn NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
  END IF;
END
$role$;

ALTER ROLE careerops_scheduler_fn NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;

-- Separate, non-login execution group for the scheduler pool. A dedicated login
-- configured by the operator must be granted membership in this role. The API
-- application login must never be a member of it.
DO $scheduler_role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'careerops_scheduler') THEN
    CREATE ROLE careerops_scheduler NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$scheduler_role$;

ALTER ROLE careerops_scheduler NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO careerops_scheduler;
GRANT USAGE ON SCHEMA public TO careerops_scheduler_fn;
GRANT SELECT, UPDATE ON linkedin_scheduled_posts TO careerops_scheduler_fn;

CREATE OR REPLACE FUNCTION claim_linkedin_scheduled_posts_due(p_limit integer)
RETURNS SETOF linkedin_scheduled_posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT pg_has_role(session_user, 'careerops_scheduler', 'MEMBER') THEN
    RAISE EXCEPTION 'Dedicated LinkedIn scheduler database role required';
  END IF;

  UPDATE linkedin_scheduled_posts
     SET status = 'unknown_outcome',
         error_code = 'worker_interrupted',
         lock_expires_at = NULL,
         updated_at = now()
   WHERE status = 'processing'
     AND lock_expires_at IS NOT NULL
     AND lock_expires_at <= now();

  RETURN QUERY
  WITH due AS (
    SELECT id
      FROM linkedin_scheduled_posts
     WHERE status = 'scheduled'
       AND next_attempt_at <= now()
     ORDER BY next_attempt_at, created_at
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 50))
  )
  UPDATE linkedin_scheduled_posts AS post
     SET status = 'processing',
         attempt_count = post.attempt_count + 1,
         lock_expires_at = now() + interval '5 minutes',
         updated_at = now()
    FROM due
   WHERE post.id = due.id
  RETURNING post.*;
END;
$fn$;

ALTER FUNCTION claim_linkedin_scheduled_posts_due(integer) OWNER TO careerops_scheduler_fn;
REVOKE ALL ON FUNCTION claim_linkedin_scheduled_posts_due(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_linkedin_scheduled_posts_due(integer) FROM careerops_app;
GRANT EXECUTE ON FUNCTION claim_linkedin_scheduled_posts_due(integer) TO careerops_scheduler;

CREATE OR REPLACE FUNCTION transition_linkedin_scheduled_post(
  p_id uuid,
  p_tenant_id uuid,
  p_subject text,
  p_status text,
  p_published_post_urn text,
  p_error_code text,
  p_next_attempt_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  affected integer;
BEGIN
  IF NOT pg_has_role(session_user, 'careerops_scheduler', 'MEMBER') THEN
    RAISE EXCEPTION 'Dedicated LinkedIn scheduler database role required';
  END IF;
  IF p_status NOT IN ('scheduled', 'published', 'failed', 'unknown_outcome', 'needs_review') THEN
    RAISE EXCEPTION 'Invalid scheduled LinkedIn post transition';
  END IF;
  IF p_error_code IS NOT NULL AND length(p_error_code) > 120 THEN
    RAISE EXCEPTION 'Invalid scheduled LinkedIn post error code';
  END IF;
  IF p_published_post_urn IS NOT NULL AND length(p_published_post_urn) > 512 THEN
    RAISE EXCEPTION 'Invalid LinkedIn post URN';
  END IF;
  IF p_status = 'published' AND p_published_post_urn IS NULL THEN
    RAISE EXCEPTION 'Published post URN is required';
  END IF;
  IF p_status = 'scheduled' AND p_next_attempt_at IS NULL THEN
    RAISE EXCEPTION 'Retry time is required';
  END IF;

  UPDATE linkedin_scheduled_posts
     SET status = p_status,
         published_post_urn = COALESCE(p_published_post_urn, published_post_urn),
         error_code = p_error_code,
         next_attempt_at = COALESCE(p_next_attempt_at, next_attempt_at),
         lock_expires_at = NULL,
         updated_at = now()
   WHERE id = p_id
     AND tenant_id = p_tenant_id
     AND subject = p_subject
     AND status = 'processing';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END;
$fn$;

ALTER FUNCTION transition_linkedin_scheduled_post(uuid, uuid, text, text, text, text, timestamptz)
  OWNER TO careerops_scheduler_fn;
REVOKE ALL ON FUNCTION transition_linkedin_scheduled_post(uuid, uuid, text, text, text, text, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION transition_linkedin_scheduled_post(uuid, uuid, text, text, text, text, timestamptz)
  FROM careerops_app;
GRANT EXECUTE ON FUNCTION transition_linkedin_scheduled_post(uuid, uuid, text, text, text, text, timestamptz)
  TO careerops_scheduler;

CREATE OR REPLACE FUNCTION cancel_linkedin_scheduled_post(
  p_id uuid,
  p_tenant_id uuid,
  p_subject text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  affected integer;
BEGIN
  IF p_tenant_id IS DISTINCT FROM NULLIF(current_setting('app.tenant_id', true), '')::uuid
     OR p_subject IS DISTINCT FROM NULLIF(current_setting('app.user_subject', true), '') THEN
    RAISE EXCEPTION 'Authenticated tenant and subject context required';
  END IF;

  UPDATE linkedin_scheduled_posts
     SET status = 'cancelled',
         lock_expires_at = NULL,
         updated_at = now()
   WHERE id = p_id
     AND tenant_id = p_tenant_id
     AND subject = p_subject
     AND status = 'scheduled';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END;
$fn$;

ALTER FUNCTION cancel_linkedin_scheduled_post(uuid, uuid, text) OWNER TO careerops_scheduler_fn;
REVOKE ALL ON FUNCTION cancel_linkedin_scheduled_post(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_linkedin_scheduled_post(uuid, uuid, text) TO careerops_app;

COMMIT;
