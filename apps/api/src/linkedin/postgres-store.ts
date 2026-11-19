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
  query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<SqlResult<Row>>;
  release(): void;
}

export interface LinkedInSqlPool {
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
  pool: LinkedInSqlPool,
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
    private readonly pool: LinkedInSqlPool,
    private readonly cipher: TenantEnvelopeCipher
  ) {}

  async save(state: LinkedInOAuthState): Promise<void> {
    await inTenant(this.pool, state.identity.tenantId, state.identity.subject, async (client) => {
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
    });
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
    // The serialized OAuth token payload is plaintext secret material. Keep its
    // lifetime explicit and wipe the backing buffer even if encryption or the
    // subsequent database write fails.
    const plaintext = Buffer.from(JSON.stringify(tokens), 'utf8');
    let envelope: EncryptedEnvelope;
    try {
      envelope = await this.cipher.encrypt(identity.tenantId, context, plaintext);
    } finally {
      plaintext.fill(0);
    }
    await inTenant(this.pool, identity.tenantId, identity.subject, async (client) => {
      const lockKey = `linkedin-token-write:${identity.tenantId}:${identity.subject}`;
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockKey]);
      const existing = await client.query<{ tenant_id: string }>(
        `SELECT tenant_id FROM linkedin_connections
          WHERE tenant_id = $1 AND subject = $2 FOR UPDATE`,
        [identity.tenantId, identity.subject]
      );
      const values = [
        identity.tenantId,
        identity.subject,
        JSON.stringify(envelope),
        tokens.grantedScopes,
        new Date(tokens.expiresAt).toISOString(),
      ];
      if (!existing.rows[0]) {
        await client.query(
          `INSERT INTO linkedin_connections
            (tenant_id, subject, token_envelope, granted_scopes, token_expires_at, updated_at)
           VALUES ($1, $2, $3::jsonb, $4, $5, now())`,
          values
        );
        return;
      }

      const latest = await client.query<{ revision: number | string }>(
        `SELECT COALESCE(MAX(revision), 1) AS revision
           FROM linkedin_connection_envelope_revisions
          WHERE tenant_id = $1 AND subject = $2`,
        [identity.tenantId, identity.subject]
      );
      if (Number(latest.rows[0]?.revision ?? 1) > 1) {
        const nextRevision = Number(latest.rows[0].revision) + 1;
        await client.query(
          `INSERT INTO linkedin_connection_envelope_revisions
            (tenant_id, subject, revision, token_envelope, rotated_by)
           VALUES ($1, $2, $3, $4::jsonb, $5)`,
          [identity.tenantId, identity.subject, nextRevision, JSON.stringify(envelope), identity.subject]
        );
      } else {
        await client.query(
          `UPDATE linkedin_connections
              SET token_envelope = $3::jsonb,
                  granted_scopes = $4,
                  token_expires_at = $5,
                  updated_at = now()
            WHERE tenant_id = $1 AND subject = $2`,
          values
        );
      }
    });
  }

  async get(identity: LinkedInConnectionIdentity): Promise<LinkedInTokenSet | null> {
    return inTenant(this.pool, identity.tenantId, identity.subject, async (client) => {
      const result = await client.query<ConnectionRow>(
        `SELECT COALESCE(revision.token_envelope, connection.token_envelope) AS token_envelope
           FROM linkedin_connections connection
           LEFT JOIN LATERAL (
             SELECT token_envelope
               FROM linkedin_connection_envelope_revisions
              WHERE tenant_id = connection.tenant_id AND subject = connection.subject
              ORDER BY revision DESC
              LIMIT 1
           ) revision ON TRUE
          WHERE connection.tenant_id = $1 AND connection.subject = $2`,
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

  /**
   * Re-encrypt one subject's token envelope and append a new immutable revision.
   * The base connection row and advisory lock serialize this with OAuth token writes.
   * A crash rolls back the revision, so retrying is safe and naturally idempotent.
   */
  async rotateTokenEnvelope(input: {
    identity: LinkedInConnectionIdentity;
    actorSubject: string;
    targetKeyVersion: string;
    reencrypt: (
      envelope: EncryptedEnvelope,
      tenantId: string,
      context: string
    ) => Promise<EncryptedEnvelope>;
  }): Promise<'not_found' | 'already_current' | 'rotated'> {
    const { identity, actorSubject, targetKeyVersion } = input;
    const context = tokenContext(identity.subject);
    if (
      actorSubject !== identity.subject ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(targetKeyVersion) ||
      typeof input.reencrypt !== 'function'
    ) {
      throw new Error('Invalid LinkedIn token envelope rotation request');
    }

    return inTenant(this.pool, identity.tenantId, identity.subject, async (client) => {
      const lockKey = `linkedin-token-write:${identity.tenantId}:${identity.subject}`;
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockKey]);
      const base = await client.query<ConnectionRow>(
        `SELECT token_envelope FROM linkedin_connections
          WHERE tenant_id = $1 AND subject = $2 FOR UPDATE`,
        [identity.tenantId, identity.subject]
      );
      const row = base.rows[0];
      if (!row) return 'not_found';

      const latest = await client.query<{
        revision: number | string;
        token_envelope: EncryptedEnvelope;
      }>(
        `SELECT revision, token_envelope
           FROM linkedin_connection_envelope_revisions
          WHERE tenant_id = $1 AND subject = $2
          ORDER BY revision DESC
          LIMIT 1`,
        [identity.tenantId, identity.subject]
      );
      const currentEnvelope = latest.rows[0]?.token_envelope ?? row.token_envelope;
      const currentRevision = Number(latest.rows[0]?.revision ?? 1);
      if (currentEnvelope.keyVersion === targetKeyVersion) return 'already_current';

      const replacement = await input.reencrypt(currentEnvelope, identity.tenantId, context);
      if (
        replacement.algorithm !== 'A256GCM' ||
        replacement.tenantId !== identity.tenantId ||
        replacement.context !== context ||
        replacement.keyVersion !== targetKeyVersion ||
        typeof replacement.wrappedKey !== 'string' ||
        !replacement.wrappedKey
      ) {
        throw new Error('LinkedIn token rotation returned an envelope with invalid metadata');
      }

      await client.query(
        `INSERT INTO linkedin_connection_envelope_revisions
          (tenant_id, subject, revision, token_envelope, rotated_by)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [
          identity.tenantId,
          identity.subject,
          currentRevision + 1,
          JSON.stringify(replacement),
          actorSubject,
        ]
      );
      return 'rotated';
    });
  }

  async delete(identity: LinkedInConnectionIdentity): Promise<void> {
    await inTenant(this.pool, identity.tenantId, identity.subject, async (client) => {
      await client.query('DELETE FROM linkedin_connections WHERE tenant_id = $1 AND subject = $2', [
        identity.tenantId,
        identity.subject,
      ]);
      await client.query(
        'DELETE FROM linkedin_oauth_states WHERE tenant_id = $1 AND subject = $2',
        [identity.tenantId, identity.subject]
      );
    });
  }
}
