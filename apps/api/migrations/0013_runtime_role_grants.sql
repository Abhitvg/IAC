-- Migration 0013: Complete Runtime Role Grants for careerops_app
-- Grants non-owner app role access to all CareerOps tables with FORCE RLS active

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'careerops_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON assist_queue_items TO careerops_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_connections, inbound_messages TO careerops_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON people, suppression_list, outreach_messages TO careerops_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON linkedin_profile_audits TO careerops_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON sprint_runs, sprint_allocations, sprint_auto_pause_events TO careerops_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON experiments, experiment_variants, experiment_events, dsar_requests TO careerops_app;
    -- Also allow DELETE on career_graph_facts, applications for DSAR erasure
    GRANT DELETE ON career_graph_facts, career_graph_fact_reviews, applications, application_timeline_events TO careerops_app;
  END IF;
END
$$;

