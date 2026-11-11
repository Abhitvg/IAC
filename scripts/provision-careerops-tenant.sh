#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must use a login explicitly granted membership in careerops_provisioner}"
: "${TENANT_ID:?TENANT_ID must be a UUID}"
: "${TENANT_NAME:?TENANT_NAME is required}"
: "${OWNER_SUBJECT:?OWNER_SUBJECT must be the exact OIDC issuer subject}"

if [[ ! "$TENANT_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]]; then
  echo "TENANT_ID must be a valid UUID." >&2
  exit 2
fi
if [[ ${#TENANT_NAME} -lt 1 || ${#TENANT_NAME} -gt 160 ]]; then
  echo "TENANT_NAME must contain 1-160 characters." >&2
  exit 2
fi
if [[ ${#OWNER_SUBJECT} -lt 1 || ${#OWNER_SUBJECT} -gt 255 ]]; then
  echo "OWNER_SUBJECT must contain 1-255 characters." >&2
  exit 2
fi

OCCURRED_AT="$(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ')"
EVENT_HASH="$(node - "$TENANT_ID" "$OWNER_SUBJECT" "$OCCURRED_AT" <<'NODE'
const { createHash } = require('node:crypto');
const [tenantId, actorSubject, occurredAt] = process.argv.slice(2);
const input = {
  tenantId,
  actorSubject,
  action: 'tenant.provisioned',
  entityType: 'tenant',
  entityId: tenantId,
  occurredAt,
  metadata: { source: 'privileged-bootstrap' },
  previousHash: null,
};
const stable = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
};
process.stdout.write(createHash('sha256').update(stable(input)).digest('hex'));
NODE
)"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v tenant_id="$TENANT_ID" \
  -v tenant_name="$TENANT_NAME" \
  -v owner_subject="$OWNER_SUBJECT" \
  -v occurred_at="$OCCURRED_AT" \
  -v event_hash="$EVENT_HASH" <<'SQL'
SET ROLE careerops_provisioner;
BEGIN;

INSERT INTO tenants (id, display_name)
VALUES (:'tenant_id'::uuid, :'tenant_name');

INSERT INTO tenant_memberships (tenant_id, subject, role, status)
VALUES (:'tenant_id'::uuid, :'owner_subject', 'owner', 'active');

INSERT INTO tenant_controls (tenant_id, global_kill_switch, paused_channels)
VALUES (:'tenant_id'::uuid, true, '{}');

INSERT INTO audit_events (
  tenant_id, actor_subject, action, entity_type, entity_id,
  occurred_at, metadata, previous_hash, event_hash
) VALUES (
  :'tenant_id'::uuid, :'owner_subject', 'tenant.provisioned', 'tenant',
  :'tenant_id', :'occurred_at'::timestamptz,
  '{"source":"privileged-bootstrap"}'::jsonb, NULL, :'event_hash'
);

COMMIT;
RESET ROLE;
SQL

echo "Tenant provisioned. Global kill switch remains ENABLED; no automation is authorized."
