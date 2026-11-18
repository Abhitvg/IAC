-- Grant only the operations used by LinkedInOAuthStateStore and LinkedInTokenVault.
-- The tables remain tenant-isolated by FORCE ROW LEVEL SECURITY policies from 0006.
BEGIN;

REVOKE ALL ON linkedin_oauth_states, linkedin_connections FROM PUBLIC;

-- OAuth state save/consume and cleanup use INSERT and DELETE ... RETURNING.
-- SELECT is required for the returned columns and token state lookup.
GRANT SELECT, INSERT, DELETE ON linkedin_oauth_states TO careerops_app;

-- Token vault reads, inserts/upserts, and disconnect cleanup.
GRANT SELECT, INSERT, DELETE ON linkedin_connections TO careerops_app;
GRANT UPDATE (token_envelope, granted_scopes, token_expires_at, updated_at)
  ON linkedin_connections TO careerops_app;

COMMIT;
