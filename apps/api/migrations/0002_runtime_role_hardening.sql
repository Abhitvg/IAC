-- Separate runtime role from the migration/table-owner role.
-- Apply as a database administrator; grant the deployment login membership in careerops_app.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'careerops_app') THEN
    CREATE ROLE careerops_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE careerops_app NOSUPERUSER NOBYPASSRLS;
REVOKE ALL ON tenants, tenant_memberships, tenant_controls, sprint_contracts, audit_events FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO careerops_app;
GRANT SELECT ON tenants, tenant_memberships TO careerops_app;
GRANT SELECT ON tenant_controls TO careerops_app;
GRANT UPDATE (global_kill_switch, paused_channels, updated_at) ON tenant_controls TO careerops_app;
GRANT SELECT, INSERT ON sprint_contracts TO careerops_app;
GRANT UPDATE (revoked_at) ON sprint_contracts TO careerops_app;
GRANT SELECT, INSERT ON audit_events TO careerops_app;
GRANT USAGE, SELECT ON SEQUENCE audit_events_sequence_id_seq TO careerops_app;

CREATE OR REPLACE FUNCTION reject_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_no_update_delete ON audit_events;
CREATE TRIGGER audit_events_no_update_delete
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();

DROP TRIGGER IF EXISTS audit_events_no_truncate ON audit_events;
CREATE TRIGGER audit_events_no_truncate
BEFORE TRUNCATE ON audit_events
FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_event_mutation();


-- Contract content and acceptance evidence are immutable. Revocation is one-way.
CREATE OR REPLACE FUNCTION enforce_sprint_contract_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.contract_json IS DISTINCT FROM OLD.contract_json
     OR NEW.contract_hash IS DISTINCT FROM OLD.contract_hash
     OR NEW.accepted_by IS DISTINCT FROM OLD.accepted_by
     OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
     OR NEW.signature IS DISTINCT FROM OLD.signature THEN
    RAISE EXCEPTION 'Sprint Contract acceptance evidence is immutable';
  END IF;
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'Sprint Contract revocation is irreversible';
  END IF;
  RETURN NEW;
END;
$;

DROP TRIGGER IF EXISTS sprint_contracts_immutable_evidence ON sprint_contracts;
CREATE TRIGGER sprint_contracts_immutable_evidence
BEFORE UPDATE ON sprint_contracts
FOR EACH ROW EXECUTE FUNCTION enforce_sprint_contract_immutability();

-- A tenant can only write audit events under the currently authenticated subject.
DROP POLICY IF EXISTS audit_events_isolation ON audit_events;
CREATE POLICY audit_events_isolation ON audit_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND actor_subject = NULLIF(current_setting('app.user_subject', true), '')
  );

DROP POLICY IF EXISTS sprint_contracts_isolation ON sprint_contracts;
CREATE POLICY sprint_contracts_isolation ON sprint_contracts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND accepted_by = NULLIF(current_setting('app.user_subject', true), '')
  );

-- Runtime cannot mutate identity/membership tables or alter audit history.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON tenants, tenant_memberships FROM careerops_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM careerops_app;
