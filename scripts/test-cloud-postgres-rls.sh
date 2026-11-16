#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to a disposable PostgreSQL database}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -n "${POSTGRES_CONTAINER_ID:-}" ]]; then
  psql() {
    docker exec -i "$POSTGRES_CONTAINER_ID" psql "$@"
  }
else
  command -v psql >/dev/null 2>&1 || {
    echo "psql is required when POSTGRES_CONTAINER_ID is not set."
    exit 1
  }
  psql() {
    command psql "$@"
  }
fi
export -f psql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < "$ROOT/apps/api/migrations/0001_cloud_foundation.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < "$ROOT/apps/api/migrations/0002_runtime_role_hardening.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < "$ROOT/apps/api/migrations/0003_sprint_contract_revisions.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < "$ROOT/apps/api/migrations/0004_shared_rate_limits.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < "$ROOT/apps/api/migrations/0005_career_graph_facts.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < "$ROOT/apps/api/migrations/0006_linkedin_oauth.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < "$ROOT/apps/api/migrations/0007_linkedin_oauth_callback.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < "$ROOT/apps/api/migrations/0008_linkedin_scheduled_posts.sql"

DATABASE_URL="$DATABASE_URL" \
TENANT_ID="30000000-0000-4000-8000-000000000003" \
TENANT_NAME="Bootstrap Integration Tenant" \
OWNER_SUBJECT="bootstrap-integration-owner" \
  bash "$ROOT/scripts/provision-careerops-tenant.sh"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $bootstrap$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tenant_memberships
     WHERE tenant_id = '30000000-0000-4000-8000-000000000003'
       AND subject = 'bootstrap-integration-owner' AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Privileged tenant bootstrap did not create the owner membership';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tenant_controls
     WHERE tenant_id = '30000000-0000-4000-8000-000000000003'
       AND global_kill_switch = true
  ) THEN
    RAISE EXCEPTION 'New tenant did not default to global kill switch enabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM audit_events
     WHERE tenant_id = '30000000-0000-4000-8000-000000000003'
       AND action = 'tenant.provisioned' AND previous_hash IS NULL
  ) THEN
    RAISE EXCEPTION 'Tenant bootstrap did not append initial audit event';
  END IF;
END
$bootstrap$;
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO tenants (id, display_name) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Tenant A'),
  ('20000000-0000-4000-8000-000000000002', 'Tenant B');
INSERT INTO tenant_memberships (tenant_id, subject, role) VALUES
  ('10000000-0000-4000-8000-000000000001', 'user-a', 'owner'),
  ('20000000-0000-4000-8000-000000000002', 'user-b', 'owner'),
  ('20000000-0000-4000-8000-000000000002', 'user-a', 'member');
INSERT INTO tenant_controls (tenant_id) VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002');
SQL

-- Seed two tenant-bound scheduled posts through the ordinary app role. One is due
-- so the separate worker role can claim it; one is in the future for RLS checks.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
SET ROLE careerops_app;
BEGIN;
SELECT set_config('app.user_subject', 'user-a', true);
SELECT set_config('app.tenant_id', '10000000-0000-4000-8000-000000000001', true);
INSERT INTO linkedin_scheduled_posts (
  id, tenant_id, subject, idempotency_key, commentary, scheduled_at, next_attempt_at
) VALUES (
  '33333333-3333-4333-8333-333333333333',
  '10000000-0000-4000-8000-000000000001',
  'user-a', 'schedule_tenant_a_01', 'Tenant A scheduled post',
  now() - interval '1 minute', now() - interval '1 minute'
);
SELECT set_config('app.tenant_id', '20000000-0000-4000-8000-000000000002', true);
INSERT INTO linkedin_scheduled_posts (
  id, tenant_id, subject, idempotency_key, commentary, scheduled_at, next_attempt_at
) VALUES (
  '44444444-4444-4444-8444-444444444444',
  '20000000-0000-4000-8000-000000000002',
  'user-a', 'schedule_tenant_b_01', 'Tenant B scheduled post',
  now() + interval '1 day', now() + interval '1 day'
);
COMMIT;
RESET ROLE;
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $scheduler_privileges$
DECLARE
  fn_bypass boolean;
  owner_name text;
  force_rls boolean;
BEGIN
  SELECT rolbypassrls INTO fn_bypass FROM pg_roles WHERE rolname = 'careerops_scheduler_fn';
  SELECT pg_get_userbyid(relowner), relforcerowsecurity
    INTO owner_name, force_rls
    FROM pg_class WHERE oid = 'linkedin_scheduled_posts'::regclass;
  IF fn_bypass IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Scheduler function owner must not have BYPASSRLS';
  END IF;
  IF owner_name <> 'careerops_scheduler_fn' OR force_rls THEN
    RAISE EXCEPTION 'Scheduled-post RLS owner configuration is invalid';
  END IF;
  IF pg_has_role('careerops_app', 'careerops_scheduler', 'MEMBER') THEN
    RAISE EXCEPTION 'Application role must not be a scheduler role member';
  END IF;
  IF has_function_privilege('careerops_app', 'claim_linkedin_scheduled_posts_due(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Application role must not execute cross-tenant claim function';
  END IF;
  IF has_function_privilege('careerops_app', 'transition_linkedin_scheduled_post(uuid,uuid,text,text,text,text,timestamp with time zone)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Application role must not execute cross-tenant transition function';
  END IF;
  IF has_table_privilege('careerops_app', 'linkedin_scheduled_posts', 'UPDATE') THEN
    RAISE EXCEPTION 'Application role must not update scheduled-post rows directly';
  END IF;
  IF has_table_privilege('careerops_scheduler', 'linkedin_scheduled_posts', 'SELECT') THEN
    RAISE EXCEPTION 'Scheduler execution group must not have direct table read grants';
  END IF;
END
$scheduler_privileges$;
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
SET ROLE careerops_app;
BEGIN;
SELECT set_config('app.user_subject', 'user-a', true);
SELECT set_config('app.tenant_id', '10000000-0000-4000-8000-000000000001', true);
DO $schedule_rls$
DECLARE visible_posts integer;
BEGIN
  SELECT count(*) INTO visible_posts FROM linkedin_scheduled_posts;
  IF visible_posts <> 1 THEN
    RAISE EXCEPTION 'Scheduled-post tenant RLS failed for tenant A: % visible rows', visible_posts;
  END IF;
END
$schedule_rls$;
SELECT set_config('app.tenant_id', '20000000-0000-4000-8000-000000000002', true);
DO $schedule_rls$
DECLARE visible_posts integer;
BEGIN
  SELECT count(*) INTO visible_posts FROM linkedin_scheduled_posts;
  IF visible_posts <> 1 THEN
    RAISE EXCEPTION 'Scheduled-post tenant RLS failed for tenant B: % visible rows', visible_posts;
  END IF;
END
$schedule_rls$;
SELECT set_config('app.user_subject', 'user-b', true);
DO $schedule_rls$
DECLARE visible_posts integer;
BEGIN
  SELECT count(*) INTO visible_posts FROM linkedin_scheduled_posts;
  IF visible_posts <> 0 THEN
    RAISE EXCEPTION 'Scheduled-post subject RLS failed: unrelated member sees % rows', visible_posts;
  END IF;
END
$schedule_rls$;
ROLLBACK;
RESET ROLE;
SQL

DO $scheduler_login_setup$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'careerops_scheduler_ci') THEN
    CREATE ROLE careerops_scheduler_ci LOGIN;
  END IF;
END
$scheduler_login_setup$;
GRANT careerops_scheduler TO careerops_scheduler_ci;

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
SET SESSION AUTHORIZATION careerops_scheduler_ci;
DO $scheduler_claim$
DECLARE claimed_count integer;
BEGIN
  SELECT count(*) INTO claimed_count FROM claim_linkedin_scheduled_posts_due(10);
  IF claimed_count <> 1 THEN
    RAISE EXCEPTION 'Dedicated scheduler role should claim exactly one due post, got %', claimed_count;
  END IF;
END
$scheduler_claim$;
SELECT transition_linkedin_scheduled_post(
  '33333333-3333-4333-8333-333333333333',
  '10000000-0000-4000-8000-000000000001',
  'user-a',
  'published',
  'urn:li:share:scheduled-ci',
  NULL,
  NULL
);
RESET SESSION AUTHORIZATION;
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
SET ROLE careerops_app;
BEGIN;
SELECT set_config('app.user_subject', 'user-a', true);
SELECT set_config('app.tenant_id', '10000000-0000-4000-8000-000000000001', true);
DO $scheduler_result$
DECLARE current_status text; published_urn text;
BEGIN
  SELECT status, published_post_urn INTO current_status, published_urn
    FROM linkedin_scheduled_posts
   WHERE id = '33333333-3333-4333-8333-333333333333';
  IF current_status <> 'published' OR published_urn <> 'urn:li:share:scheduled-ci' THEN
    RAISE EXCEPTION 'Dedicated scheduler transition did not persist the published result';
  END IF;
END
$scheduler_result$;
ROLLBACK;
RESET ROLE;
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
SET ROLE careerops_app;
BEGIN;
INSERT INTO api_rate_limit_buckets (bucket_key, window_started_at, request_count, expires_at)
VALUES (repeat('b', 64), date_trunc('minute', now()), 1, now() + interval '2 minutes')
ON CONFLICT (bucket_key) DO UPDATE SET request_count = api_rate_limit_buckets.request_count + 1;
DO $rate_limit$
DECLARE bucket_count integer;
BEGIN
  SELECT request_count INTO bucket_count FROM api_rate_limit_buckets
   WHERE bucket_key = repeat('b', 64);
  IF bucket_count <> 1 THEN
    RAISE EXCEPTION 'Runtime rate-limit table access failed: expected count 1, got %', bucket_count;
  END IF;
END
$rate_limit$;
DELETE FROM api_rate_limit_buckets WHERE bucket_key = repeat('b', 64);
COMMIT;
RESET ROLE;
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
SET ROLE careerops_app;
BEGIN;
SELECT set_config('app.user_subject', 'user-a', true);
DO $$
DECLARE visible_memberships integer;
BEGIN
  SELECT count(*) INTO visible_memberships FROM tenant_memberships;
  IF visible_memberships <> 2 THEN
    RAISE EXCEPTION 'Membership RLS failed: expected 2 rows for a multi-tenant subject, got %', visible_memberships;
  END IF;
END
$$;
SELECT set_config('app.tenant_id', '10000000-0000-4000-8000-000000000001', true);
DO $$
DECLARE visible_controls integer;
BEGIN
  SELECT count(*) INTO visible_controls FROM tenant_controls;
  IF visible_controls <> 1 THEN
    RAISE EXCEPTION 'Tenant RLS failed: expected 1 control row, got %', visible_controls;
  END IF;
END
$$;
INSERT INTO sprint_contracts (tenant_id, version, contract_json, contract_hash, accepted_by, accepted_at, signature)
VALUES (
  '10000000-0000-4000-8000-000000000001', 1, '{}'::jsonb, repeat('c', 64),
  'user-a', now(), repeat('d', 64)
);
DO $active_contract$
BEGIN
  BEGIN
    INSERT INTO sprint_contracts
      (tenant_id, version, revision, contract_json, contract_hash, accepted_by, accepted_at, signature)
    VALUES (
      '10000000-0000-4000-8000-000000000001', 1, 2, '{}'::jsonb, repeat('e', 64),
      'user-a', now(), repeat('f', 64)
    );
    RAISE EXCEPTION 'A second active Sprint Contract was unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END
$active_contract$;
UPDATE sprint_contracts SET revoked_at = now()
 WHERE tenant_id = '10000000-0000-4000-8000-000000000001' AND version = 1;

-- After revocation, a replacement acceptance can use the next revision.
INSERT INTO sprint_contracts (tenant_id, version, revision, contract_json, contract_hash, accepted_by, accepted_at, signature)
VALUES (
  '10000000-0000-4000-8000-000000000001', 1, 2, '{}'::jsonb, repeat('e', 64),
  'user-a', now(), repeat('f', 64)
);
INSERT INTO audit_events (
  tenant_id, actor_subject, action, entity_type, entity_id,
  occurred_at, metadata, previous_hash, event_hash
) VALUES (
  '10000000-0000-4000-8000-000000000001', 'user-a', 'test.append',
  'test', 'tenant-a', now(), '{}'::jsonb, NULL, repeat('a', 64)
);

-- Career Graph facts must use contiguous versions and tenant-bound encrypted envelopes.
INSERT INTO career_graph_facts (
  tenant_id, fact_key, version, value_envelope, source_kind, created_by
) VALUES (
  '10000000-0000-4000-8000-000000000001',
  'profile.current_role',
  1,
  jsonb_build_object(
    'algorithm', 'A256GCM',
    'wrappedKey', 'wrapped-key',
    'keyVersion', 'test-key-v1',
    'iv', 'AAAAAAAAAAAAAAAA',
    'authTag', 'AAAAAAAAAAAAAAAAAAAAAA==',
    'ciphertext', 'ciphertext',
    'tenantId', '10000000-0000-4000-8000-000000000001',
    'context', 'career-graph:profile.current_role'
  ),
  'user_input',
  'user-a'
);
INSERT INTO career_graph_facts (
  tenant_id, fact_key, version, value_envelope, source_kind, created_by
) SELECT
  tenant_id, fact_key, 2, value_envelope, source_kind, created_by
  FROM career_graph_facts
 WHERE tenant_id = '10000000-0000-4000-8000-000000000001'
   AND fact_key = 'profile.current_role' AND version = 1;

INSERT INTO career_graph_fact_reviews (tenant_id, fact_id, decision, reviewed_by)
SELECT tenant_id, id, 'confirmed', 'user-a'
  FROM career_graph_facts
 WHERE tenant_id = '10000000-0000-4000-8000-000000000001'
   AND fact_key = 'profile.current_role' AND version = 1;
COMMIT;
SQL

if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
SET ROLE careerops_app;
BEGIN;
SELECT set_config('app.user_subject', 'user-a', true);
SELECT set_config('app.tenant_id', '10000000-0000-4000-8000-000000000001', true);
INSERT INTO career_graph_facts (
  tenant_id, fact_key, version, value_envelope, source_kind, created_by
)
SELECT
  tenant_id, fact_key, 4, value_envelope, source_kind, created_by
  FROM career_graph_facts
 WHERE tenant_id = '10000000-0000-4000-8000-000000000001'
   AND fact_key = 'profile.current_role' AND version = 1;
COMMIT;
SQL
then
  echo "Expected non-contiguous Career Graph fact version to be rejected, but it succeeded."
  exit 1
fi

if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
SET ROLE careerops_app;
BEGIN;
SELECT set_config('app.user_subject', 'user-b', true);
SELECT set_config('app.tenant_id', '10000000-0000-4000-8000-000000000001', true);
INSERT INTO career_graph_fact_reviews (tenant_id, fact_id, decision, reviewed_by)
SELECT tenant_id, id, 'confirmed', 'user-b'
  FROM career_graph_facts
 WHERE tenant_id = '10000000-0000-4000-8000-000000000001'
   AND fact_key = 'profile.current_role' AND version = 2;
COMMIT;
SQL
then
  echo "Expected non-contributor Career Graph review to be rejected, but it succeeded."
  exit 1
fi

if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
SET ROLE careerops_app;
BEGIN;
SELECT set_config('app.user_subject', 'user-a', true);
SELECT set_config('app.tenant_id', '10000000-0000-4000-8000-000000000001', true);
UPDATE career_graph_facts SET source_kind = 'import'
 WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
COMMIT;
SQL
then
  echo "Expected append-only Career Graph fact update to be rejected, but it succeeded."
  exit 1
fi

if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
SET ROLE careerops_app;
BEGIN;
SELECT set_config('app.user_subject', 'user-a', true);
SELECT set_config('app.tenant_id', '10000000-0000-4000-8000-000000000001', true);
INSERT INTO career_graph_facts (
  tenant_id, fact_key, version, value_envelope, source_kind, created_by
) VALUES (
  '20000000-0000-4000-8000-000000000002',
  'profile.current_role',
  1,
  '{"algorithm":"A256GCM","wrappedKey":"wrapped-key","keyVersion":"test-key-v1","iv":"AAAAAAAAAAAAAAAA","authTag":"AAAAAAAAAAAAAAAAAAAAAA==","ciphertext":"ciphertext","tenantId":"20000000-0000-4000-8000-000000000002","context":"career-graph:profile.current_role"}'::jsonb,
  'user_input',
  'user-a'
);
COMMIT;
SQL
then
  echo "Expected cross-tenant Career Graph insert to be rejected, but it succeeded."
  exit 1
fi

if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
SET ROLE careerops_app;
BEGIN;
SELECT set_config('app.user_subject', 'user-a', true);
SELECT set_config('app.tenant_id', '10000000-0000-4000-8000-000000000001', true);
UPDATE audit_events SET action = 'tampered'
 WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
COMMIT;
SQL
then
  echo "Expected append-only audit update to be rejected, but it succeeded."
  exit 1
fi

if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
SET ROLE careerops_app;
BEGIN;
SELECT set_config('app.user_subject', 'user-a', true);
SELECT set_config('app.tenant_id', '10000000-0000-4000-8000-000000000001', true);
INSERT INTO tenant_controls (tenant_id)
VALUES ('20000000-0000-4000-8000-000000000002');
COMMIT;
SQL
then
  echo "Expected cross-tenant insert to be rejected, but it succeeded."
  exit 1
fi

echo "PostgreSQL tenant RLS, Career Graph integrity, audit immutability, and isolated LinkedIn scheduler checks passed."
