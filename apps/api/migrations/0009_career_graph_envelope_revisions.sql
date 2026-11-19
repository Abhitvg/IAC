-- Append-only ciphertext revisions allow master-key rotation without mutating
-- immutable Career Graph facts or their evidence/provenance.
BEGIN;

CREATE TABLE career_graph_fact_envelope_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  fact_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 1),
  value_envelope jsonb NOT NULL CHECK (
    jsonb_typeof(value_envelope) = 'object'
    AND value_envelope->>'algorithm' = 'A256GCM'
    AND value_envelope->>'tenantId' = tenant_id::text
    AND value_envelope->>'context' IS NOT NULL
    AND value_envelope->>'wrappedKey' IS NOT NULL
    AND value_envelope->>'keyVersion' IS NOT NULL
    AND value_envelope->>'iv' IS NOT NULL
    AND value_envelope->>'authTag' IS NOT NULL
    AND value_envelope->>'ciphertext' IS NOT NULL
    AND COALESCE(octet_length(decode(value_envelope->>'iv', 'base64')) = 12, false)
    AND COALESCE(octet_length(decode(value_envelope->>'authTag', 'base64')) = 16, false)
  ),
  rotated_by text NOT NULL CHECK (length(rotated_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, fact_id) REFERENCES career_graph_facts(tenant_id, id),
  UNIQUE (tenant_id, fact_id, revision)
);

CREATE INDEX career_graph_fact_envelope_revisions_latest_idx
  ON career_graph_fact_envelope_revisions (tenant_id, fact_id, revision DESC);

ALTER TABLE career_graph_fact_envelope_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_graph_fact_envelope_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY career_graph_fact_envelope_revisions_tenant_isolation
  ON career_graph_fact_envelope_revisions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND rotated_by = NULLIF(current_setting('app.user_subject', true), '')
  );

CREATE OR REPLACE FUNCTION reject_career_graph_envelope_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Career Graph envelope revisions are append-only';
END;
$$;

CREATE TRIGGER career_graph_envelope_revisions_no_update_delete
BEFORE UPDATE OR DELETE ON career_graph_fact_envelope_revisions
FOR EACH ROW EXECUTE FUNCTION reject_career_graph_envelope_revision_mutation();

CREATE TRIGGER career_graph_envelope_revisions_no_truncate
BEFORE TRUNCATE ON career_graph_fact_envelope_revisions
FOR EACH STATEMENT EXECUTE FUNCTION reject_career_graph_envelope_revision_mutation();

GRANT SELECT, INSERT ON career_graph_fact_envelope_revisions TO careerops_app;

COMMIT;
