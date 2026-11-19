# ADR 0001: Isolated operator boundary for tenant envelope rotation

- **Status:** Accepted as the required design; implementation is pending
- **Date:** 2026-11-20
- **Scope:** Career Graph fact envelopes and LinkedIn token envelopes
- **Related:** migrations 0009 and 0010; PostgresCareerGraphRepository.rotateEnvelopeBatch; PostgresLinkedInTokenStore.rotateTokenEnvelope

## Context

Envelope rotation currently exists as tenant-scoped primitives. Career Graph rotation records a per-tenant job and cursor; LinkedIn rotation processes one authenticated tenant/subject connection under its write lock. Both paths use transaction-local tenant and subject settings and append audit events in the same transaction as the new ciphertext revision.

These primitives are not a fleet migration system. The ordinary API database role must not gain cross-tenant enumeration privileges for migration convenience. The tenant-provisioning role is not an acceptable substitute: tenant bootstrap and data-key rotation have different authority, blast radius and audit requirements.

A worker that loops over tenant IDs from a queue, or sets arbitrary tenant GUCs using the normal API credential, would create a confused-deputy boundary. Transaction-local settings are useful RLS context for the normal API path, but caller-supplied GUC values are not proof of operator authorization.

## Decision

Fleet rotation will use a dedicated operator workload and a dedicated database identity. It will not reuse the careerops_runtime login, its careerops_app NOLOGIN permission bundle, the careerops_tenant_provisioner login, a developer credential, or any role with BYPASSRLS.

The operator is a separately deployed maintenance workload, has no public API, and is not callable by ordinary tenant requests. Its database credential is delivered only to that workload, rotated independently, and absent from API/Electron environments.

### Database authority split

The database design must separate three capabilities:

1. **Inventory read:** enumerate only tenant and subject/object identifiers eligible for a specific campaign. Inventory must not expose token envelopes, plaintext, resume content or other tenant payloads.
2. **Tenant-scoped rotation:** read the current envelope and append the next ciphertext revision for one explicitly authorized tenant/object at a time. The worker must not receive broad application-table write access.
3. **Audit/checkpoint:** record operator identity, campaign ID, target key version, tenant/object reference, outcome, timestamps and bounded progress. Audit records are append-only; checkpoints are monotonic and resumable.

Use narrowly scoped grants or reviewed database procedures. Do not grant schema ownership, DDL, broad table access, unrestricted audit mutation, TRUNCATE or BYPASSRLS. Do not add a generic cross-tenant SELECT grant to the API role.

The database must independently distinguish the operator principal from the ordinary API principal. A transaction-local app.user_subject value is application context, not an authenticated database identity. Any operator-only procedure or policy must verify the actual database principal (for example, session_user against a fixed allowlist), not trust a subject string supplied by the caller. Procedure ownership and RLS behavior must be reviewed against deployed PostgreSQL role attributes before implementation.

### Inventory contract

- Inventory entries identify tenant, data class, stable object reference, current key version and eligibility state.
- Subject identifiers should be opaque/pseudonymous in the control plane where possible. Resolve a subject only when its authorized unit of work begins.
- Inventory access is read-only and contains no envelope ciphertext or plaintext.
- Tenant/object membership is revalidated inside the tenant-scoped transaction before decrypt or write.
- Queue messages carry campaign and inventory references, not authority. A queue payload alone never authorizes a tenant or object.
- Missing, stale, revoked, deleted or mismatched entries are skipped with a typed outcome and audit record; they are never guessed or silently reassigned.

### Rotation execution contract

Each unit of work is one tenant plus one object (or a small bounded Career Graph batch). It must:

1. Load the campaign and inventory entry through the operator capability.
2. Start a transaction and establish exact tenant/object scope through the approved operator boundary.
3. Re-read and lock the current row using the same serialization lock as normal writes.
4. Re-read the latest envelope revision; never rotate a stale base envelope if a newer revision exists.
5. Validate algorithm, tenant, context, key version and all encoded field sizes before persistence.
6. Decrypt and re-encrypt through the configured KMS-backed provider. Plaintext DEKs and token payload buffers are zeroized in finally paths.
7. Append the immutable ciphertext revision and audit event atomically. Audit failure rolls back the revision.
8. Advance the checkpoint only after commit. Replaying a committed unit returns an idempotent already-current result.
9. Emit only opaque references, counts and typed outcomes to logs. Never log envelopes, wrapped keys, plaintext DEKs, OAuth tokens, subject values or decrypted token payloads.

For Career Graph, preserve tenant audit-lock then rotation-lock ordering and monotonic cursor semantics. For LinkedIn, preserve the shared token-write/rotation advisory lock and row lock. A future coordinator must define and test one global lock-order policy before adding cross-domain transactions; do not hold a tenant-wide lock while waiting on KMS network calls.

### Boundedness and resumability

- Require an immutable campaign ID and explicit target key version.
- Enforce configurable maximum tenants, objects per tenant, total objects, batch size, wall-clock duration, KMS request rate and retry budget.
- Use keyset pagination over stable inventory ordering; do not use unbounded offsets.
- Persist per-object outcomes and a monotonic checkpoint. Restarts resume from committed checkpoints.
- Use exponential backoff with jitter for transient KMS/database errors and a dead-letter state for exhausted retries.
- Do not automatically retry authorization, integrity, context-mismatch, malformed-envelope or audit-chain failures.
- Support dry-run inventory and eligibility reporting that performs no decrypt and no writes.
- Provide an operator stop switch. Stop accepting new units immediately; let an in-flight transaction commit or roll back safely.

### Key lifecycle and KMS

- KMS key ARN/version mapping is explicit and versioned for the campaign lifetime. A single configured CMK must not be assumed to unwrap envelopes from arbitrary historical CMKs.
- The operator receives only KMS actions required for the rotation flow, scoped to approved key ARNs and exact encryption-context constraints.
- KMS policies must not grant key administration to the worker.
- Key disablement/deletion schedules, destination-key readiness, decryptability sampling and rollback/restore procedures are preflight gates.
- Do not delete or disable a source key while any retained envelope, backup, export or recovery artifact may depend on it.
- KMS failures fail closed. Production has no fallback to local master keys.

## Rejected alternatives

- **Reuse the API database role:** expands every API process authority and makes a tenant-scoped runtime identity capable of fleet enumeration.
- **Reuse the tenant-provisioning role:** bootstrap privilege is broader than rotation needs and creates an avoidable privilege-escalation path.
- **Trust tenant IDs or subjects in queue payloads:** queue data is not an authorization boundary.
- **Use only transaction-local tenant/user GUCs as operator authentication:** a caller with database access can set those values; they do not authenticate the database principal.
- **Grant the worker BYPASSRLS:** bypasses the primary tenant isolation control and is unnecessary for a properly designed inventory/procedure boundary.
- **Run one giant cross-tenant transaction:** increases lock duration, retry cost, failure blast radius and recovery complexity.

## Required implementation sequence

1. Approve the operator threat model, database principal, secret-delivery path and campaign authorization process.
2. Inspect actual database roles, memberships, ownership, grants, default privileges, RLS policies and trigger execution identities in the target PostgreSQL environment.
3. Add a dedicated operator principal with no BYPASSRLS, no DDL, no object ownership and only reviewed inventory/procedure grants. Put role creation/grants in a reviewed migration or controlled DBA procedure, never API startup.
4. Add a minimal inventory schema and campaign/checkpoint schema with explicit revocation and append-only audit controls.
5. Implement operator-only procedures or narrowly scoped repository methods that authenticate session_user, validate campaign scope, establish tenant context and process one bounded unit.
6. Add real PostgreSQL role integration tests proving the API role cannot enumerate tenants, the operator cannot read unrelated payload tables, forged GUCs do not bypass authorization, cross-tenant references fail, and audit/revision/checkpoint writes are atomic.
7. Add KMS integration tests for old-key decrypt/new-key encrypt, context mismatch, disabled key, throttling, timeout, shutdown race and plaintext zeroization.
8. Run dry-run inventory, sample decryptability verification and a small canary campaign before broad rollout.
9. Require explicit operator approval for production execution and source-key retirement.

## Acceptance criteria

This ADR is not implemented until all are true:

- API, provisioning and operator database identities are distinct and their grants are tested.
- No runtime identity has BYPASSRLS for this workflow.
- Cross-tenant inventory exposes identifiers only and is separately authorized.
- The database authenticates the operator principal independently of caller-supplied GUC values.
- Every rotation is tenant/object scoped, bounded, resumable, idempotent and auditable.
- Revision, audit and checkpoint atomicity is proven by PostgreSQL integration tests.
- KMS key mappings, encryption contexts and source-key retention are explicit.
- Dry-run and canary procedures exist with stop/rollback guidance.
- No production rotation runs as part of implementing this ADR.

## Current implementation status

The repository has tenant-scoped rotation primitives and append-only revision tables. It does not yet have the dedicated operator identity, fleet inventory, campaign coordinator, operator-only database procedures or PostgreSQL role integration tests described here. Migration 0010 and the existing rotation code have not been applied or exercised against live PostgreSQL. Production API startup remains fail-closed until KMS is wired into runtime composition.
