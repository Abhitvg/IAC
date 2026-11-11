#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to a disposable PostgreSQL database}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/apps/api/migrations/0001_cloud_foundation.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/apps/api/migrations/0002_runtime_role_hardening.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/apps/api/migrations/0003_sprint_contract_revisions.sql"

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
UPDATE sprint_contracts SET revoked_at = now()
 WHERE tenant_id = '10000000-0000-4000-8000-000000000001' AND version = 1;

-- A second active acceptance for the same tenant must be rejected even with a new revision.
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
COMMIT;
SQL

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

echo "PostgreSQL tenant RLS and append-only audit integration checks passed."
