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
    AND length(value_envelope->>'wrappedKey') BETWEEN 1 AND 4096
    AND value_envelope->>'wrappedKey' ~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
    AND value_envelope->>'keyVersion' ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
    AND length(value_envelope->>'ciphertext') BETWEEN 1 AND 1000000
    AND value_envelope->>'ciphertext' ~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
    AND value_envelope->>'iv' ~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
    AND value_envelope->>'authTag' ~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
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

CREATE TABLE career_graph_envelope_rotation_jobs (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  target_key_version text NOT NULL CHECK (length(target_key_version) BETWEEN 1 AND 64),
  last_fact_id uuid,
  rotated_count bigint NOT NULL DEFAULT 0 CHECK (rotated_count >= 0),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed')),
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 255),
  updated_by text NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, target_key_version),
  FOREIGN KEY (tenant_id, last_fact_id) REFERENCES career_graph_facts(tenant_id, id)
);

ALTER TABLE career_graph_envelope_rotation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_graph_envelope_rotation_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY career_graph_envelope_rotation_jobs_tenant_isolation
  ON career_graph_envelope_rotation_jobs
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND created_by = NULLIF(current_setting('app.user_subject', true), '')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND created_by = NULLIF(current_setting('app.user_subject', true), '')
    AND updated_by = NULLIF(current_setting('app.user_subject', true), '')
  );

CREATE OR REPLACE FUNCTION enforce_career_graph_rotation_job_progress()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.target_key_version IS DISTINCT FROM OLD.target_key_version
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Career Graph rotation job identity is immutable';
  END IF;
  IF OLD.status = 'completed' AND NEW.status <> 'completed' THEN
    RAISE EXCEPTION 'Completed Career Graph rotation jobs cannot be reopened';
  END IF;
  IF NEW.status = 'completed' AND EXISTS (
    SELECT 1
      FROM career_graph_facts f
      LEFT JOIN LATERAL (
        SELECT value_envelope
          FROM career_graph_fact_envelope_revisions
         WHERE tenant_id = f.tenant_id AND fact_id = f.id
         ORDER BY revision DESC
         LIMIT 1
      ) er ON TRUE
     WHERE f.tenant_id = NEW.tenant_id
       AND COALESCE(er.value_envelope, f.value_envelope)->>'keyVersion'
           <> NEW.target_key_version
  ) THEN
    RAISE EXCEPTION 'Career Graph rotation job cannot complete while old-key envelopes remain';
  END IF;
  IF NEW.rotated_count < OLD.rotated_count THEN
    RAISE EXCEPTION 'Career Graph rotation count cannot decrease';
  END IF;
  IF OLD.last_fact_id IS NOT NULL
     AND (NEW.last_fact_id IS NULL OR NEW.last_fact_id < OLD.last_fact_id) THEN
    RAISE EXCEPTION 'Career Graph rotation cursor cannot move backwards';
  END IF;
  IF NEW.updated_by IS DISTINCT FROM NULLIF(current_setting('app.user_subject', true), '') THEN
    RAISE EXCEPTION 'Career Graph rotation job actor mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER career_graph_rotation_job_progress
BEFORE UPDATE ON career_graph_envelope_rotation_jobs
FOR EACH ROW EXECUTE FUNCTION enforce_career_graph_rotation_job_progress();

CREATE OR REPLACE FUNCTION enforce_career_graph_envelope_revision_context()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_context text;
BEGIN
  SELECT 'career-graph:' || fact_key
    INTO expected_context
    FROM career_graph_facts
   WHERE tenant_id = NEW.tenant_id AND id = NEW.fact_id;
  IF NOT FOUND OR NEW.value_envelope->>'context' IS DISTINCT FROM expected_context THEN
    RAISE EXCEPTION 'Career Graph envelope revision context does not match its fact';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM career_graph_envelope_rotation_jobs
     WHERE tenant_id = NEW.tenant_id
       AND target_key_version = NEW.value_envelope->>'keyVersion'
       AND created_by = NEW.rotated_by
       AND status = 'running'
  ) THEN
    RAISE EXCEPTION 'Career Graph envelope revision requires an active matching rotation job';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER career_graph_envelope_revision_context
BEFORE INSERT ON career_graph_fact_envelope_revisions
FOR EACH ROW EXECUTE FUNCTION enforce_career_graph_envelope_revision_context();

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
GRANT SELECT, INSERT ON career_graph_envelope_rotation_jobs TO careerops_app;
GRANT UPDATE (last_fact_id, rotated_count, status, updated_by, updated_at)
  ON career_graph_envelope_rotation_jobs TO careerops_app;

COMMIT;
