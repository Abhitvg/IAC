-- Separate schema version from tenant acceptance revision. A tenant may accept a new
-- Sprint Contract after revoking the previous one without changing the JSON schema version.
BEGIN;
ALTER TABLE sprint_contracts ADD COLUMN IF NOT EXISTS revision integer;
UPDATE sprint_contracts SET revision = 1 WHERE revision IS NULL;
ALTER TABLE sprint_contracts ALTER COLUMN revision SET NOT NULL;
ALTER TABLE sprint_contracts ALTER COLUMN revision SET DEFAULT 1;
ALTER TABLE sprint_contracts DROP CONSTRAINT IF EXISTS sprint_contracts_tenant_id_version_key;
CREATE UNIQUE INDEX IF NOT EXISTS sprint_contracts_tenant_revision_idx
  ON sprint_contracts (tenant_id, revision);
CREATE INDEX IF NOT EXISTS sprint_contracts_active_revision_idx
  ON sprint_contracts (tenant_id, revision DESC)
  WHERE revoked_at IS NULL;
COMMIT;
