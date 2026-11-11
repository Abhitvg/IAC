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
GRANT SELECT, UPDATE ON tenant_controls TO careerops_app;
GRANT SELECT, INSERT, UPDATE ON sprint_contracts TO careerops_app;
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

-- Runtime cannot mutate identity/membership tables or alter audit history.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON tenants, tenant_memberships FROM careerops_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM careerops_app;
