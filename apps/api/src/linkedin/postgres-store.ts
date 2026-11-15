import { createHash } from 'node:crypto';
import type {
  EncryptedEnvelope,
  TenantEnvelopeCipher,
} from '../../../../packages/cloud-core/src/encryption';
import type {
  LinkedInConnectionIdentity,
  LinkedInOAuthState,
  LinkedInOAuthStateStore,
  LinkedInTokenSet,
  LinkedInTokenVault,
} from './types';

interface SqlResult<Row> {
  rows: Row[];
  rowCount?: number | null;
}

interface SqlClient {
  query<Row = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ): Promise<SqlResult<Row>>;
  release(): void;
}

interface SqlPool {
  connect(): Promise<SqlClient>;
}

interface ConnectionRow {
  token_envelope: EncryptedEnvelope;
}

function stateHash(state: string): string {
  return createHash('sha256').update(state, 'utf8').digest('hex');
}

function tokenContext(subject: string): string {
  if (!subject || subject.length > 255) {
    throw new Error('Invalid LinkedIn token subject');
  }
  return `linkedin-token:${subject}`;
}

async function inTenant<T>(
  pool: SqlPool,
  tenantId: string,
  subject: string,
  work: (client: SqlClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_subject', $1, true)", [subject]);
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve original error.
    }
    throw error;
  } finally {
    client.release();
  }
}

export class LinkedInPostgresStore implements LinkedInOAuthStateStore, LinkedInTokenVault {
  constructor(
    private readonly pool: SqlPool,
    private readonly cipher: TenantEnvelopeCipher
  ) {}

  async save(state: LinkedInOAuthState): Promise<void> {
    await inTenant(
      this.pool,
      state.identity.tenantId,
      state.identity.subject,
      async (client) => {
        await client.query(
          `INSERT INTO linkedin_oauth_states
            (state_hash, tenant_id, subject, redirect_uri, expires_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            stateHash(state.state),
            state.identity.tenantId,
            state.identity.subject,
            state.redirectUri,
            new Date(state.expiresAt).toISOString(),
          ]
        );
      }
    );
  }

  async consume(
    state: string,
    identity: LinkedInConnectionIdentity
  ): Promise<LinkedInOAuthState | null> {
    const hash = stateHash(state);
    return inTenant(this.pool, identity.tenantId, identity.subject, async (client) => {
      const result = await client.query<{
        tenant_id: string;
        subject: string;
        redirect_uri: string;
        expires_at: Date | string;
      }>(
        `DELETE FROM linkedin_oauth_states
          WHERE state_hash = $1 AND tenant_id = $2 AND subject = $3
          RETURNING tenant_id, subject, redirect_uri, expires_at`,
        [hash, identity.tenantId, identity.subject]
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        state,
        identity: { tenantId: row.tenant_id, subject: row.subject },
        redirectUri: row.redirect_uri,
        expiresAt: new Date(row.expires_at).getTime(),
      };
    });
  }

  async put(identity: LinkedInConnectionIdentity, tokens: LinkedInTokenSet): Promise<void> {
    const context = tokenContext(identity.subject);
    const envelope = await this.cipher.encrypt(
      identity.tenantId,
      context,
      Buffer.from(JSON.stringify(tokens), 'utf8')
    );
    await inTenant(this.pool, identity.tenantId, identity.subject, async (client) => {
      await client.query(
        `INSERT INTO linkedin_connections
          (tenant_id, subject, token_envelope, granted_scopes, token_expires_at, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, $5, now())
         ON CONFLICT (tenant_id, subject) DO UPDATE SET
           token_envelope = EXCLUDED.token_envelope,
           granted_scopes = EXCLUDED.granted_scopes,
           token_expires_at = EXCLUDED.token_expires_at,
           updated_at = now()`,
        [
          identity.tenantId,
          identity.subject,
          JSON.stringify(envelope),
          tokens.grantedScopes,
          new Date(tokens.expiresAt).toISOString(),
        ]
      );
    });
  }

  async get(identity: LinkedInConnectionIdentity): Promise<LinkedInTokenSet | null> {
    return inTenant(this.pool, identity.tenantId, identity.subject, async (client) => {
      const result = await client.query<ConnectionRow>(
        `SELECT token_envelope FROM linkedin_connections
          WHERE tenant_id = $1 AND subject = $2`,
        [identity.tenantId, identity.subject]
      );
      const row = result.rows[0];
      if (!row) return null;

      const plaintext = await this.cipher.decrypt(
        row.token_envelope,
        identity.tenantId,
        tokenContext(identity.subject)
      );
      try {
        const tokens = JSON.parse(plaintext.toString('utf8')) as LinkedInTokenSet;
        if (
          !Array.isArray(tokens.grantedScopes) ||
          typeof tokens.accessToken !== 'string' ||
          typeof tokens.memberId !== 'string' ||
          !/^[A-Za-z0-9_-]{1,255}$/.test(tokens.memberId) ||
          tokens.tokenType !== 'Bearer' ||
          !Number.isFinite(tokens.expiresAt)
        ) {
          throw new Error('Stored LinkedIn token envelope has an invalid payload');
        }
        return tokens;
      } finally {
        plaintext.fill(0);
      }
    });
  }

  async delete(identity: LinkedInConnectionIdentity): Promise<void> {
    await inTenant(this.pool, identity.tenantId, identity.subject, async (client) => {
      await client.query(
        'DELETE FROM linkedin_connections WHERE tenant_id = $1 AND subject = $2',
        [identity.tenantId, identity.subject]
      );
      await client.query(
        'DELETE FROM linkedin_oauth_states WHERE tenant_id = $1 AND subject = $2',
        [identity.tenantId, identity.subject]
      );
    });
  }
}
