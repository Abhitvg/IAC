-- Migration 0008: Inbound Messages & OAuth Connections with Strict Tenant RLS
BEGIN;

CREATE TABLE oauth_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'microsoft', 'imap_smtp')),
  service_type text NOT NULL CHECK (service_type IN ('email', 'calendar', 'both')),
  encrypted_tokens jsonb NOT NULL CHECK (jsonb_typeof(encrypted_tokens) = 'object'),
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, provider, service_type)
);

CREATE INDEX oauth_connections_tenant_provider_idx
  ON oauth_connections (tenant_id, provider, service_type);

ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_connections FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_oauth_connections
  ON oauth_connections
  AS RESTRICTIVE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON TABLE oauth_connections FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE oauth_connections TO CURRENT_USER;

CREATE TABLE inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('google', 'microsoft', 'imap_smtp', 'webhook')),
  external_message_id text NOT NULL CHECK (length(external_message_id) <= 256),
  thread_id text CHECK (thread_id IS NULL OR length(thread_id) <= 256),
  sender_email text NOT NULL CHECK (length(sender_email) <= 254),
  sender_name text CHECK (sender_name IS NULL OR length(sender_name) <= 160),
  subject text NOT NULL CHECK (length(subject) <= 500),
  snippet text CHECK (snippet IS NULL OR length(snippet) <= 2000),
  classification text NOT NULL CHECK (
    classification IN (
      'interview_invite',
      'assessment',
      'info_request',
      'rejection',
      'referral_confirmation',
      'spam',
      'other'
    )
  ),
  requires_action boolean NOT NULL DEFAULT false,
  handled boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  received_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, external_message_id)
);

CREATE INDEX inbound_messages_tenant_classification_idx
  ON inbound_messages (tenant_id, classification, received_at DESC);

CREATE INDEX inbound_messages_tenant_handled_idx
  ON inbound_messages (tenant_id, handled)
  WHERE handled = false;

ALTER TABLE inbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_inbound_messages
  ON inbound_messages
  AS RESTRICTIVE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON TABLE inbound_messages FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE inbound_messages TO CURRENT_USER;

COMMIT;

