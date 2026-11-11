# M0 Cloud Foundation — Demo and validation

## Scope

M0 adds the first cloud trust boundary and security primitives. It does not enable job discovery, ATS submission, email sending, LinkedIn actions, inbox polling or calendar writes.

## Run locally

1. Install the repository dependencies with Node 22.
2. Run `npm run typecheck:cloud`.
3. Run `npx vitest run tests/cloud-foundation.test.ts`.
4. Start the API in a harness that injects a production `CloudApiRepository`, verified identity configuration and KMS adapter. The server intentionally has no insecure in-memory production fallback.
5. Apply `apps/api/migrations/0001_cloud_foundation.sql` using a dedicated migration role. The runtime role must not own the tables or have RLS bypass privileges.

## Demo script

1. Call `GET /health/live`; expect 200 without credentials.
2. Call `GET /v1/me` without a bearer token; expect 401.
3. Call `GET /v1/me` with a correctly signed token; the tenant ID returned must come from server-side membership lookup, not a JWT tenant claim.
4. Call `GET /v1/controls`; expect the tenant's global kill switch to be enabled by default.
5. Attempt a control update with an invalid body; expect 400 and no state change.
6. Exercise the domain policy with the kill switch enabled; any action authorization must fail closed.
7. Encrypt a sample artifact with a KMS-backed key provider; decrypt using the same tenant/context; a different tenant/context or modified ciphertext must fail authentication.
8. Append an audit event and verify the next event references the prior hash.

## Tests

- Signed JWT verification: signature, issuer, audience, expiry and malformed token.
- Tenant membership resolution: no membership and ambiguous membership fail closed.
- Sprint Contract validation: schema bounds and outreach consent.
- Kill switch/channel pause/cap enforcement.
- Tamper-evident audit event hashing.
- AES-256-GCM envelope integrity and tenant/context binding.
- HTTP health, auth and server-side tenant resolution.

## Known gaps (must be closed before production)

- Identity-provider OIDC/JWKS integration and user/tenant provisioning are not configured; the current token verifier is an injectable HS256 trust adapter for the initial boundary, not a public login system.
- A concrete PostgreSQL pool adapter and runtime composition root are still required; RLS migration and repository contracts are included, but the API cannot be deployed with a memory repository.
- A production KMS implementation, cloud object storage and secrets manager are not selected or wired. Tests use an explicitly test-only fake key provider.
- Audit append and kill-switch state changes must be committed atomically by the production repository implementation.
- Database roles, grants, backup encryption, key rotation, DSAR workflows, rate limiting and abuse controls need deployment integration tests.
- Existing desktop plaintext persistence and issue #72 remain unresolved; no automatic cloud import is performed.
