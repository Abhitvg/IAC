# M0 Cloud Foundation — Demo and validation

## Scope

M0 establishes the first cloud trust boundary and security primitives. It does not enable job discovery, ATS submission, email sending, LinkedIn actions, inbox polling or calendar writes.

## Required environment

- `CAREEROPS_JWT_ISSUER`: exact HTTPS issuer value expected in access-token `iss`.
- `CAREEROPS_JWT_AUDIENCE`: API audience expected in access-token `aud`.
- `CAREEROPS_JWKS_URL`: trusted HTTPS JWKS endpoint for that issuer. Redirects are rejected.
- `CAREEROPS_CONSENT_SIGNING_SECRET`: separate high-entropy secret (at least 32 characters); never reuse the identity-provider signing key.
- `CAREEROPS_RATE_LIMIT_HASH_SECRET`: separate high-entropy secret (at least 32 characters) used to HMAC caller keys before they are persisted in shared rate-limit buckets; it must differ from the consent signing secret.
- `CAREEROPS_DATABASE_URL`: PostgreSQL connection URL for the API runtime. Production uses certificate-verified TLS; TLS override query parameters are rejected.
- `CAREEROPS_DB_POOL_MAX`: optional PostgreSQL pool size from 1 to 50 (default 10).
- `CAREEROPS_MIGRATION_DATABASE_URL`: separate schema-owner connection URL used only by the migration release command. Never use this credential for the API runtime.

## Run locally

1. Install the repository dependencies with Node 22.
2. Run `npm run typecheck:cloud`.
3. Run `npm run build:api` to compile the Node API and migration release command into `dist-api/`.
4. Set `CAREEROPS_DATABASE_URL` and the required OIDC/signing secrets, then run `npm run start:api` to start the API process.
5. For a fresh database only, set `CAREEROPS_MIGRATION_DATABASE_URL` to the dedicated migration-role URL and run `npm run migrate:cloud`. The migration command uses the advisory-lock/checksum runner and closes its pool on exit.
6. Run `npm run security:source`.
7. Run `npx vitest run tests/cloud-foundation.test.ts tests/cloud-migrations.test.ts tests/postgres-pool.test.ts`.
8. Run `bash scripts/test-cloud-postgres-rls.sh` against a disposable PostgreSQL 16 database. The script applies the four schema migrations and verifies tenant isolation, bootstrap defaults, rate-limit grants and append-only audit behavior.
9. Ensure the API deployment login is a member of `careerops_app`; it must not own tables or have RLS bypass privileges. The separate tenant-provisioning operator login may be granted membership in `careerops_provisioner` and should be used only for the audited bootstrap script.
10. Probe `GET /health/ready` for database readiness (503 on database failure); `/health/live` remains independent of database availability.

## Transactional migration runner

`apps/api/src/migrations.ts` provides `loadCloudMigrations(directory)` and `runCloudMigrations(pool, migrations)` for a dedicated release/deployment job:

- Migration files are restricted to ordered names such as `0005_add_feature.sql`; non-SQL files are ignored, while SQL symlinks and malformed SQL filenames are rejected.
- A PostgreSQL advisory lock serializes concurrent migration runners.
- Each migration and its SHA-256 ledger entry commit in the same transaction.
- Reapplying an unchanged migration is a no-op; changing the contents of an already-applied migration fails closed.
- The runner strips only the outer `BEGIN`/`COMMIT` wrapper from the existing migration format so the migration and ledger write share one transaction.
- Run migrations with a dedicated schema-owner/migration credential, never with the API's restricted `careerops_app` role. Do not run migrations automatically during API startup.

The API now includes a `pg` pool adapter, a Node process entrypoint and a compiled migration CLI. A deployment platform still needs to supply the database URLs/secrets, run the migration command as a one-off release job, and provision the distinct runtime and migration database roles. The existing SQL integration script applies migrations directly for disposable test databases. For a database that has already had migrations applied outside this ledger, do not point the runner at it: create and verify an explicit baseline as a separate reviewed operation first.

## Privileged tenant bootstrap

After applying the schema migrations, grant the approved operator login membership in `careerops_provisioner`. Set `DATABASE_URL`, `TENANT_ID`, `TENANT_NAME` and the exact authenticated OIDC `OWNER_SUBJECT`, then run `bash scripts/provision-careerops-tenant.sh`. The script creates the tenant, first owner, default-enabled kill switch and initial audit event in one transaction. It does not enable automation. Never grant `careerops_provisioner` to the API service login.

## Demo script

1. Call `GET /health/live`; expect 200 without credentials.
2. Call `GET /v1/me` without a bearer token; expect 401.
3. Call `GET /v1/me` with a valid RS256 OIDC access token; the tenant ID returned must come from server-side membership lookup, not a JWT tenant claim.
4. Call `GET /v1/controls`; expect the tenant's global kill switch to be enabled by default.
5. Attempt a control update with an invalid body; expect 400 and no state change.
6. Exercise the domain policy with the kill switch enabled; any action authorization must fail closed.
7. Encrypt a sample artifact with a KMS-backed key provider; decrypt using the same tenant/context; a different tenant/context or modified ciphertext must fail authentication.
8. Append an audit event and verify the next event references the prior hash.

## Tests

- OIDC RS256/JWKS verification: signature, issuer, audience, expiry, key rotation and malformed token.
- Tenant membership resolution: no membership and ambiguous membership fail closed.
- Sprint Contract validation: schema bounds and outreach consent.
- Kill switch/channel pause/cap enforcement.
- Tamper-evident audit event hashing.
- AES-256-GCM envelope integrity and tenant/context binding.
- HTTP liveness/readiness, auth, server-side tenant resolution, shared rate-limit enforcement, and Sprint Contract accept/read/revoke lifecycle. Only the accepting owner may revoke that acceptance.
- Migration file validation, lexical ordering, advisory lock acquisition, transactional application, checksum persistence and checksum-drift rejection.

## Known gaps (must be closed before production)

- RS256 OIDC/JWKS verification is implemented with HTTPS-pinned issuer/JWKS configuration, bounded key caching, key-rotation refresh and RSA-2048 minimum. The identity provider, issuer/JWKS endpoints, OAuth client, login/callback flow and account provisioning are not configured; this verifier validates access tokens only and is not a public login system.
- The PostgreSQL repository, shared fixed-window rate limiter, concrete `pg` pool adapter, API process entrypoint and separate migration CLI are implemented. The runtime uses bounded pool settings and certificate-verified TLS in production; a hosted login/callback flow, account provisioning, deployment manifests, secrets-manager integration and operator identity verification are still not wired.
- A production KMS implementation, cloud object storage and secrets manager are not selected or wired. Tests use an explicitly test-only fake key provider.
- The shared PostgreSQL rate limiter uses atomic fixed-window upserts and HMAC-hashed caller keys; migration 0004 grants the restricted runtime role only the required bucket-table permissions. Production retention/cleanup cadence and abuse thresholds still need operational tuning.
- The consent HMAC secret must be separate from the JWT signing secret and configured as `CAREEROPS_CONSENT_SIGNING_SECRET`.
- The PostgreSQL repository commits Sprint Contract acceptance/revocation and control changes with their audit events atomically; live hosted database and concurrent-write testing remain required.
- Database roles/grants, immutable consent evidence with one-way revocation, and append-only audit triggers are included in migration 0002. Backup encryption, key rotation, DSAR workflows, production rate-limit retention and abuse thresholds need deployment integration tests.
- Existing desktop plaintext persistence and issue #72 remain unresolved; no automatic cloud import is performed.
