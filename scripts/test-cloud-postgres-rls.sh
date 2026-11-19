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
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < "$ROOT/apps/api/migrations/0007_linkedin_runtime_grants.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < "$ROOT/apps/api/migrations/0008_linkedin_subject_isolation.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < "$ROOT/apps/api/migrations/0009_career_graph_envelope_revisions.sql"

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

if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
SET ROLE careerops_app;
BEGIN;
SELECT set_config('app.user_subject', 'user-a', true);
SELECT set_config('app.tenant_id', '10000000-0000-4000-8000-000000000001', true);
INSERT INTO linkedin_connections
  (tenant_id, subject, token_envelope, granted_scopes, token_expires_at)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'user-other', '{"ciphertext":"unauthorized"}', ARRAY['openid'], now() + interval '1 hour');
COMMIT;
SQL
then
  echo "Expected LinkedIn subject policy to reject cross-user token insertion, but it succeeded."
  exit 1
fi

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

-- Envelope rotation appends a tenant-scoped revision without mutating the fact row.
INSERT INTO career_graph_envelope_rotation_jobs (
  tenant_id, target_key_version, last_fact_id, rotated_count, status, created_by, updated_by
)
SELECT tenant_id, 'test-key-v2', id, 2, 'running', 'user-a', 'user-a'
  FROM career_graph_facts
 WHERE tenant_id = '10000000-0000-4000-8000-000000000001'
   AND fact_key = 'profile.current_role'
 ORDER BY id DESC
 LIMIT 1;

INSERT INTO career_graph_fact_envelope_revisions (
  tenant_id, fact_id, revision, value_envelope, rotated_by
)
SELECT
  tenant_id,
  id,
  2,
  jsonb_build_object(
    'algorithm', 'A256GCM',
    'wrappedKey', 'd3JhcHBlZC1rZXktdjI=',
    'keyVersion', 'test-key-v2',
    'iv', 'AAAAAAAAAAAAAAAA',
    'authTag', 'AAAAAAAAAAAAAAAAAAAAAA==',
    'ciphertext', 'Y2lwaGVydGV4dA==',
    'tenantId', tenant_id::text,
    'context', 'career-graph:profile.current_role'
  ),
  'user-a'
FROM career_graph_facts
WHERE tenant_id = '10000000-0000-4000-8000-000000000001'
  AND fact_key = 'profile.current_role';

UPDATE career_graph_envelope_rotation_jobs
   SET status = 'completed', updated_by = 'user-a', updated_at = now()
 WHERE tenant_id = '10000000-0000-4000-8000-000000000001'
   AND target_key_version = 'test-key-v2';

DO $rotation_rls$
DECLARE
  visible_revisions integer;
  visible_jobs integer;
  cross_tenant_revisions integer;
  cross_tenant_jobs integer;
  current_key_version text;
BEGIN
  SELECT count(*) INTO visible_revisions FROM career_graph_fact_envelope_revisions;
  SELECT count(*) INTO visible_jobs FROM career_graph_envelope_rotation_jobs;
  SELECT count(*) INTO cross_tenant_revisions FROM career_graph_fact_envelope_revisions
   WHERE tenant_id = '20000000-0000-4000-8000-000000000002';
  SELECT count(*) INTO cross_tenant_jobs FROM career_graph_envelope_rotation_jobs
   WHERE tenant_id = '20000000-0000-4000-8000-000000000002';
  SELECT min(value_envelope->>'keyVersion') INTO current_key_version
    FROM career_graph_fact_envelope_revisions
   WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
  IF visible_revisions <> 2 OR visible_jobs <> 1 OR cross_tenant_revisions <> 0
     OR cross_tenant_jobs <> 0 OR current_key_version <> 'test-key-v2' THEN
    RAISE EXCEPTION 'Career Graph envelope revision or rotation-job RLS failed';
  END IF;
END
$rotation_rls$;
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
UPDATE career_graph_envelope_rotation_jobs
   SET status = 'running', updated_by = 'user-a', updated_at = now()
 WHERE tenant_id = '10000000-0000-4000-8000-000000000001'
   AND target_key_version = 'test-key-v2';
COMMIT;
SQL
then
  echo "Expected completed Career Graph rotation job to remain terminal, but it reopened."
  exit 1
fi

if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
SET ROLE careerops_app;
BEGIN;
SELECT set_config('app.user_subject', 'user-a', true);
SELECT set_config('app.tenant_id', '10000000-0000-4000-8000-000000000001', true);
UPDATE career_graph_fact_envelope_revisions
   SET rotated_by = 'tampered'
 WHERE tenant_id = '10000000-0000-4000-8000-000000000001';
COMMIT;
SQL
then
  echo "Expected append-only Career Graph envelope revision update to be rejected, but it succeeded."
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

# Seed both tenants with LinkedIn integration rows; runtime access must remain tenant-scoped.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO linkedin_oauth_states (state_hash, tenant_id, subject, redirect_uri, expires_at)
VALUES
  (repeat('a', 64), '10000000-0000-4000-8000-000000000001', 'user-a', 'https://app.example.com/callback', now() + interval '10 minutes'),
  (repeat('c', 64), '10000000-0000-4000-8000-000000000001', 'user-other', 'https://app.example.com/callback', now() + interval '10 minutes'),
  (repeat('b', 64), '20000000-0000-4000-8000-000000000002', 'user-b', 'https://app.example.com/callback', now() + interval '10 minutes');

INSERT INTO linkedin_connections (tenant_id, subject, token_envelope, granted_scopes, token_expires_at)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'user-a', '{"ciphertext":"tenant-a-user-a"}', ARRAY['openid'], now() + interval '1 hour'),
  ('10000000-0000-4000-8000-000000000001', 'user-other', '{"ciphertext":"tenant-a-other-user"}', ARRAY['openid'], now() + interval '1 hour'),
  ('20000000-0000-4000-8000-000000000002', 'user-b', '{"ciphertext":"tenant-b"}', ARRAY['openid'], now() + interval '1 hour');
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
SET ROLE careerops_app;
BEGIN;
SELECT set_config('app.user_subject', 'user-a', true);
SELECT set_config('app.tenant_id', '10000000-0000-4000-8000-000000000001', true);
DO $linkedin_rls$
DECLARE
  visible_states integer;
  visible_connections integer;
  cross_tenant_states integer;
  cross_tenant_connections integer;
  other_subject_states integer;
  other_subject_connections integer;
BEGIN
  SELECT count(*) INTO visible_states FROM linkedin_oauth_states;
  SELECT count(*) INTO visible_connections FROM linkedin_connections;
  SELECT count(*) INTO cross_tenant_states FROM linkedin_oauth_states WHERE tenant_id = '20000000-0000-4000-8000-000000000002';
  SELECT count(*) INTO cross_tenant_connections FROM linkedin_connections WHERE tenant_id = '20000000-0000-4000-8000-000000000002';
  SELECT count(*) INTO other_subject_states FROM linkedin_oauth_states WHERE subject = 'user-other';
  SELECT count(*) INTO other_subject_connections FROM linkedin_connections WHERE subject = 'user-other';
  IF visible_states <> 1 OR visible_connections <> 1 THEN
    RAISE EXCEPTION 'LinkedIn runtime grants/subject RLS failed: expected one row per current subject';
  END IF;
  IF cross_tenant_states <> 0 OR cross_tenant_connections <> 0 THEN
    RAISE EXCEPTION 'LinkedIn tenant RLS exposed another tenant''s records';
  END IF;
  IF other_subject_states <> 0 OR other_subject_connections <> 0 THEN
    RAISE EXCEPTION 'LinkedIn subject RLS exposed another member''s records within the same tenant';
  END IF;
END
$linkedin_rls$;

-- Exercise the same INSERT/ON CONFLICT UPDATE and DELETE ... RETURNING permissions used by the store.
INSERT INTO linkedin_connections
  (tenant_id, subject, token_envelope, granted_scopes, token_expires_at)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'user-a', '{"ciphertext":"rotated"}', ARRAY['openid','profile'], now() + interval '2 hours')
ON CONFLICT (tenant_id, subject) DO UPDATE SET
  token_envelope = EXCLUDED.token_envelope,
  granted_scopes = EXCLUDED.granted_scopes,
  token_expires_at = EXCLUDED.token_expires_at,
  updated_at = now();

DELETE FROM linkedin_oauth_states
 WHERE state_hash = repeat('a', 64)
   AND tenant_id = '10000000-0000-4000-8000-000000000001'
   AND subject = 'user-a'
 RETURNING state_hash;
DELETE FROM linkedin_connections
 WHERE tenant_id = '10000000-0000-4000-8000-000000000001'
   AND subject = 'user-a';
COMMIT;
RESET ROLE;
SQL

echo "PostgreSQL tenant RLS, LinkedIn grants/RLS, Career Graph integrity, and append-only integration checks passed."
