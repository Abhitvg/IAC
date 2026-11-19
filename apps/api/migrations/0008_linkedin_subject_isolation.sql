-- LinkedIn credentials and OAuth state are private to the authenticated subject,
-- not merely to the wider tenant. The store sets both context values per transaction.
BEGIN;

DROP POLICY IF EXISTS linkedin_oauth_states_tenant_isolation ON linkedin_oauth_states;
CREATE POLICY linkedin_oauth_states_subject_isolation ON linkedin_oauth_states
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND subject = NULLIF(current_setting('app.user_subject', true), '')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND subject = NULLIF(current_setting('app.user_subject', true), '')
  );

DROP POLICY IF EXISTS linkedin_connections_tenant_isolation ON linkedin_connections;
CREATE POLICY linkedin_connections_subject_isolation ON linkedin_connections
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND subject = NULLIF(current_setting('app.user_subject', true), '')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND subject = NULLIF(current_setting('app.user_subject', true), '')
  );

COMMIT;
