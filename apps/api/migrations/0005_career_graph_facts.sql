-- Career Graph facts are immutable, versioned records. Payloads are encrypted client-side
-- or by a trusted KMS-backed adapter before persistence; plaintext is never stored here.
BEGIN;

CREATE TABLE career_graph_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  fact_key text NOT NULL CHECK (
    length(fact_key) BETWEEN 1 AND 120
    AND fact_key ~ '^[a-z][a-z0-9_.-]{0,119}$'
  ),
  version integer NOT NULL CHECK (version > 0),
  value_envelope jsonb NOT NULL CHECK (
    jsonb_typeof(value_envelope) = 'object'
    AND value_envelope->>'algorithm' = 'A256GCM'
    AND value_envelope ? 'wrappedKey'
    AND value_envelope ? 'keyVersion'
    AND value_envelope ? 'iv'
    AND value_envelope ? 'authTag'
    AND value_envelope ? 'ciphertext'
    AND value_envelope->>'wrappedKey' IS NOT NULL
    AND value_envelope->>'keyVersion' IS NOT NULL
    AND value_envelope->>'ciphertext' IS NOT NULL
    AND value_envelope->>'iv' IS NOT NULL
    AND value_envelope->>'authTag' IS NOT NULL
    AND value_envelope->>'tenantId' IS NOT NULL
    AND value_envelope->>'context' IS NOT NULL
    AND length(value_envelope->>'wrappedKey') BETWEEN 1 AND 4096
    AND length(value_envelope->>'keyVersion') BETWEEN 1 AND 128
    AND length(value_envelope->>'ciphertext') BETWEEN 1 AND 1000000
    AND value_envelope->>'context' = 'career-graph:' || fact_key
    AND COALESCE(octet_length(decode(value_envelope->>'iv', 'base64')) = 12, false)
    AND COALESCE(octet_length(decode(value_envelope->>'authTag', 'base64')) = 16, false)
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
  FOREIGN KEY (tenant_id, fact_id) REFERENCES career_graph_facts(tenant_id, id),
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

-- Serialize inserts per tenant/fact key and require contiguous immutable versions.
CREATE OR REPLACE FUNCTION enforce_career_graph_fact_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_version integer;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.tenant_id::text || ':' || NEW.fact_key, 0)
  );
  SELECT COALESCE(MAX(version), 0) + 1
    INTO expected_version
    FROM career_graph_facts
   WHERE tenant_id = NEW.tenant_id AND fact_key = NEW.fact_key;
  IF NEW.version <> expected_version THEN
    RAISE EXCEPTION 'Career Graph fact version must be %, received %',
      expected_version, NEW.version;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER career_graph_facts_version_sequence
BEFORE INSERT ON career_graph_facts
FOR EACH ROW EXECUTE FUNCTION enforce_career_graph_fact_version();

-- A fact can only be confirmed/rejected by the contributor recorded on that version.
CREATE OR REPLACE FUNCTION enforce_career_graph_fact_reviewer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  fact_creator text;
BEGIN
  SELECT created_by
    INTO fact_creator
    FROM career_graph_facts
   WHERE tenant_id = NEW.tenant_id AND id = NEW.fact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Career Graph fact does not exist in this tenant';
  END IF;
  IF NEW.reviewed_by IS DISTINCT FROM fact_creator THEN
    RAISE EXCEPTION 'Only the fact contributor may review this Career Graph fact';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER career_graph_fact_reviews_contributor_only
BEFORE INSERT ON career_graph_fact_reviews
FOR EACH ROW EXECUTE FUNCTION enforce_career_graph_fact_reviewer();

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

COMMIT;
