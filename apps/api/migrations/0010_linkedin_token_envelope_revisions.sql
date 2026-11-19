-- LinkedIn token envelope revisions preserve the prior ciphertext during KMS migration.
-- Each connection is scoped to one authenticated tenant + subject; migration runs
-- one connection at a time under the same row/advisory lock used by token writes.
BEGIN;

CREATE TABLE linkedin_connection_envelope_revisions (
  tenant_id uuid NOT NULL,
  subject text NOT NULL,
  revision integer NOT NULL CHECK (revision > 1),
  token_envelope jsonb NOT NULL CHECK (
    jsonb_typeof(token_envelope) = 'object'
    AND token_envelope->>'algorithm' = 'A256GCM'
    AND token_envelope->>'tenantId' = tenant_id::text
    AND token_envelope->>'context' = ('linkedin-token:' || subject)
    AND token_envelope->>'wrappedKey' IS NOT NULL
    AND length(token_envelope->>'wrappedKey') BETWEEN 4 AND 16384
    AND token_envelope->>'wrappedKey' ~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
    AND token_envelope->>'keyVersion' IS NOT NULL
    AND token_envelope->>'keyVersion' ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
    AND token_envelope->>'iv' IS NOT NULL
    AND token_envelope->>'iv' ~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
    AND COALESCE(octet_length(decode(token_envelope->>'iv', 'base64')) = 12, false)
    AND token_envelope->>'authTag' IS NOT NULL
    AND token_envelope->>'authTag' ~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
    AND COALESCE(octet_length(decode(token_envelope->>'authTag', 'base64')) = 16, false)
    AND token_envelope->>'ciphertext' IS NOT NULL
    AND length(token_envelope->>'ciphertext') BETWEEN 4 AND 1000000
    AND token_envelope->>'ciphertext' ~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
  ),
  rotated_by text NOT NULL CHECK (length(rotated_by) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, subject, revision),
  FOREIGN KEY (tenant_id, subject)
    REFERENCES linkedin_connections(tenant_id, subject) ON DELETE CASCADE
);

CREATE INDEX linkedin_connection_envelope_revisions_latest_idx
  ON linkedin_connection_envelope_revisions (tenant_id, subject, revision DESC);

ALTER TABLE linkedin_connection_envelope_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_connection_envelope_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY linkedin_connection_envelope_revisions_subject_isolation
  ON linkedin_connection_envelope_revisions
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND subject = NULLIF(current_setting('app.user_subject', true), '')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND subject = NULLIF(current_setting('app.user_subject', true), '')
    AND rotated_by = NULLIF(current_setting('app.user_subject', true), '')
  );

CREATE OR REPLACE FUNCTION reject_linkedin_envelope_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'LinkedIn token envelope revisions cannot be updated or truncated';
END;
$$;

CREATE TRIGGER linkedin_envelope_revisions_no_update
BEFORE UPDATE ON linkedin_connection_envelope_revisions
FOR EACH ROW EXECUTE FUNCTION reject_linkedin_envelope_revision_mutation();

CREATE TRIGGER linkedin_envelope_revisions_no_truncate
BEFORE TRUNCATE ON linkedin_connection_envelope_revisions
FOR EACH STATEMENT EXECUTE FUNCTION reject_linkedin_envelope_revision_mutation();

REVOKE ALL ON linkedin_connection_envelope_revisions FROM PUBLIC;
GRANT SELECT, INSERT ON linkedin_connection_envelope_revisions TO careerops_app;

COMMIT;
