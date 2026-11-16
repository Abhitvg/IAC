-- Permit a LinkedIn OAuth browser callback to consume one unguessable state exactly once.
-- The callback handler never receives or accepts a tenant identifier from the browser.
BEGIN;

CREATE POLICY linkedin_oauth_states_callback_consume
  ON linkedin_oauth_states
  FOR DELETE
  USING (current_setting('app.linkedin_oauth_callback', true) = 'true');

COMMIT;
