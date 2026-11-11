-- Career Graph facts are immutable, versioned records. Payloads are encrypted client-side
-- or by a trusted KMS-backed adapter before persistence; plaintext is never stored here.
BEGIN;

CREATE TABLE career_graph_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fact_key text NOT NULL CHECK (length(fact_key) BETWEEN 1 AND 120),
  version integer NOT NULL CHECK (version > 0),
  value_envelope jsonb NOT NULL CHECK (
    value_envelope->>'algorithm' = 'A256GCM'
    AND value_envelope ? 'wrappedKey'
    AND value_envelope ? 'keyVersion'
    AND value_envelope ? 'iv'
    AND value_envelope ? 'authTag'
    AND value_envelope ? 'ciphertext'
    AND value_envelope->>'tenantId' = tenant_id::text
  ),
  source_kind text NOT NULL CHECK (source_kind IN ('user_input', 'document', 'integration', 'import')),
  source_reference text CHECK (source_reference IS NULL OR length(source_reference) <= 512),
  evidence_sha256 char(64) CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[a-f0-9]{64}$'),
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, fact_key, version),
  UNIQUE (tenant_id, id)
);

CREATE INDEX career_graph_facts_latest_idx
  ON career_graph_facts (tenant_id, fact_key, version DESC);

CREATE TABLE career_graph_fact_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  fact_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('confirmed', 'rejected')),
  reviewed_by text NOT NULL CHECK (length(reviewed_by) BETWEEN 1 AND 255),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  reason text CHECK (reason IS NULL OR length(reason) <= 512),
  FOREIGN KEY (tenant_id, fact_id) REFERENCES career_graph_facts(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, fact_id)
);

CREATE INDEX career_graph_fact_reviews_latest_idx
  ON career_graph_fact_reviews (tenant_id, fact_id, reviewed_at DESC, id DESC);

ALTER TABLE career_graph_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_graph_facts FORCE ROW LEVEL SECURITY;
CREATE POLICY career_graph_facts_tenant_isolation ON career_graph_facts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND created_by = NULLIF(current_setting('app.user_subject', true), '')
  );

ALTER TABLE career_graph_fact_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_graph_fact_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY career_graph_fact_reviews_tenant_isolation ON career_graph_fact_reviews
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND reviewed_by = NULLIF(current_setting('app.user_subject', true), '')
  );

-- Both tables are append-only: corrections create a new fact version/review event.
CREATE OR REPLACE FUNCTION reject_career_graph_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Career Graph facts and reviews are append-only';
END;
$$;

CREATE TRIGGER career_graph_facts_no_update_delete
BEFORE UPDATE OR DELETE ON career_graph_facts
FOR EACH ROW EXECUTE FUNCTION reject_career_graph_mutation();
CREATE TRIGGER career_graph_facts_no_truncate
BEFORE TRUNCATE ON career_graph_facts
FOR EACH STATEMENT EXECUTE FUNCTION reject_career_graph_mutation();
CREATE TRIGGER career_graph_reviews_no_update_delete
BEFORE UPDATE OR DELETE ON career_graph_fact_reviews
FOR EACH ROW EXECUTE FUNCTION reject_career_graph_mutation();
CREATE TRIGGER career_graph_reviews_no_truncate
BEFORE TRUNCATE ON career_graph_fact_reviews
FOR EACH STATEMENT EXECUTE FUNCTION reject_career_graph_mutation();

GRANT SELECT, INSERT ON career_graph_facts, career_graph_fact_reviews TO careerops_app;
GRANT SELECT, INSERT ON career_graph_facts, career_graph_fact_reviews TO careerops_provisioner;

COMMIT;
