# M0 Cloud Foundation — Demo and validation

## Scope

M0 adds the first cloud trust boundary and security primitives. It does not enable job discovery, ATS submission, email sending, LinkedIn actions, inbox polling or calendar writes.

## Required environment

- `CAREEROPS_JWT_ISSUER`: exact HTTPS issuer value expected in access-token `iss`.
- `CAREEROPS_JWT_AUDIENCE`: API audience expected in access-token `aud`.
- `CAREEROPS_JWKS_URL`: trusted HTTPS JWKS endpoint for that issuer. Redirects are rejected.
- `CAREEROPS_CONSENT_SIGNING_SECRET`: separate high-entropy secret (at least 32 characters); never reuse the identity-provider signing key.

## Run locally

1. Install the repository dependencies with Node 22.
2. Run `npm run typecheck:cloud`.
3. Run `npm run security:source`.
4. Run `npx vitest run tests/cloud-foundation.test.ts`.
5. Run `bash scripts/test-cloud-postgres-rls.sh` against a disposable PostgreSQL 16 database. The script applies all three migrations using the supplied database credentials and runs the isolation/immutability assertions.
6. Ensure the API deployment login is a member of `careerops_app`; it must not own tables or have RLS bypass privileges. The separate tenant-provisioning operator login may be granted membership in `careerops_provisioner` and should be used only for the audited bootstrap script.
7. Start the API in a harness that injects `PostgresCloudApiRepository`, a shared rate limiter, verified identity configuration and KMS adapter. The server intentionally has no insecure in-memory production fallback.

## Privileged tenant bootstrap\n\nAfter applying both migrations, grant the approved operator login membership in `careerops_provisioner`. Set `DATABASE_URL`, `TENANT_ID`, `TENANT_NAME` and the exact authenticated OIDC `OWNER_SUBJECT`, then run `bash scripts/provision-careerops-tenant.sh`. The script creates the tenant, first owner, default-paused controls and initial audit event in one transaction. It does not enable automation. Never grant `careerops_provisioner` to the API service login.\n\n## Demo script

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
- HTTP health, auth, server-side tenant resolution, and Sprint Contract accept/read/revoke lifecycle.

## Known gaps (must be closed before production)

- RS256 OIDC/JWKS verification is implemented with HTTPS-pinned issuer/JWKS configuration, bounded key caching, key-rotation refresh and RSA-2048 minimum. The identity provider, issuer/JWKS endpoints, OAuth client, login/callback flow and account provisioning are not configured; this verifier validates access tokens only and is not a public login system.
- The PostgreSQL repository adapter is implemented against a pg-compatible pool interface. A privileged, explicit tenant bootstrap script and narrowly granted BYPASSRLS provisioning role are included; operator identity verification, pg driver, runtime composition root and hosted account provisioning are still not wired. Multi-tenant memberships and explicit `x-tenant-id` selection are supported by the domain boundary and RLS schema. The API is not deployable until these are supplied.
- A production KMS implementation, cloud object storage and secrets manager are not selected or wired. Tests use an explicitly test-only fake key provider.
- The API requires an injected shared rate-limiter implementation (for example Redis); the interface and fail-closed enforcement are present, but no process-local fallback is provided.
- The consent HMAC secret must be separate from the JWT signing secret and configured as `CAREEROPS_CONSENT_SIGNING_SECRET`.
- The PostgreSQL repository commits Sprint Contract acceptance/revocation and control changes with their audit events atomically; live hosted database and concurrent-write testing remain required.
- Database roles/grants, immutable consent evidence with one-way revocation, and append-only audit triggers are included in migration 0002. Backup encryption, key rotation, DSAR workflows, distributed rate-limiter deployment and abuse controls need deployment integration tests.
- Existing desktop plaintext persistence and issue #72 remain unresolved; no automatic cloud import is performed.
