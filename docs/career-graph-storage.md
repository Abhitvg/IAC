# CareerOps Career Graph fact storage

## Scope

Migration `0005_career_graph_facts.sql` establishes the tenant-scoped persistence boundary for versioned candidate facts. The domain contract lives in `packages/cloud-core/src/career-graph.ts`.

This includes authenticated API and PostgreSQL persistence workflows. It is not a claim that a cloud KMS adapter is deployed or that fact-driven tailoring is enabled.

## Data model

- A fact is identified by a stable, lowercase `fact_key` and a tenant-local monotonically increasing version.
- Every version is immutable. Corrections create a new row/version; old evidence remains available for audit and conflict resolution.
- The client submits a bounded JSON fact value over the authenticated HTTPS API. The trusted API encrypts it with a per-record AES-256-GCM data key before calling the repository; PostgreSQL stores only the envelope. API responses omit the envelope and return the decrypted value only after tenant membership has been verified.
- Provenance records a bounded source kind, optional reference, and optional SHA-256 evidence digest. Avoid putting document contents, access tokens, or other secrets in provenance references.
- Confirmation/rejection is a separate append-only review event. A fact without a review is unconfirmed; downstream tailoring must not treat it as verified.
- Both tables enforce forced PostgreSQL RLS and append-only triggers.

## Security and rollout constraints

1. The hosted API requires a configured encryption provider for Career Graph reads and writes. It encrypts submitted values before persistence and decrypts only after verified tenant membership; missing keys fail closed with HTTP 503. The current provider is the versioned local master-key ring, not a KMS GenerateDataKey adapter. Direct KMS integration is prohibited in all CareerOps application processes.
2. The API derives tenant and actor from verified identity/membership. The create endpoint rejects client-supplied tenant/actor fields, validates a bounded JSON value, and encrypts it with the expected `career-graph:<fact_key>` context. Reads and review responses decrypt only after tenant authorization. The API routes are `GET/POST /v1/career-graph/facts` and `POST /v1/career-graph/facts/:id/review`.
3. Fact creation and review append a tenant audit event in the same PostgreSQL transaction. Fact version allocation takes the same tenant/fact-key advisory lock as the database trigger before reading `MAX(version)`.
4. Database repositories return encrypted envelopes only to the trusted API process. The public API never returns envelope metadata, wrapped keys, or ciphertext.
5. Resume tailoring, default answers, and application forms must use only facts with an explicit `confirmed` review and an accepted Sprint Contract allow-list.
6. Existing databases require the migration runner's explicit reviewed baseline. Migration `0005` is not a manual schema patch.

## Verification

The domain and API tests cover bounded plaintext input, tenant/context binding, stable fact keys, bounded provenance, verified-identity binding, API-side AES-GCM encryption/decryption, ciphertext-only persistence, envelope omission from responses, fail-closed behavior without a key provider, versioned master-key rotation and re-encryption, route validation, version-lock ordering, transaction/audit atomicity, and contributor-only review. PostgreSQL migration/RLS integration remains a required CI gate before merge.

## Envelope key rotation

Migration `0009_career_graph_envelope_revisions.sql` adds append-only ciphertext revisions and tenant-scoped rotation-job state. The original fact row, source evidence, version, and review remain immutable. Reads resolve the newest envelope revision while preserving the original fact identity.

The repository rotation primitive processes at most 100 facts per transaction. It serializes all rotation workers per tenant, locks candidate fact rows, validates replacement envelopes, appends new revisions, advances the persisted job cursor, and appends a hash-chained audit event in the same transaction. Database triggers enforce immutable job identity, monotonic cursor/count progress, an active matching job for every revision, and complete tenant coverage before a job can finish. A failed decrypt, encrypt, insert, or audit write rolls back the entire page and leaves the cursor unchanged. Repeating a completed job is a no-op.

Operational requirements before enabling rotation:
- Run migration 0009 before invoking the rotation repository method.
- Supply a trusted backend key provider that can unwrap every retained prior key version and encrypt with the target current version. The worker only selects source versions present in the supplied key ring; an unknown or unsupported envelope version prevents the database from marking the rotation complete. Do not expose key material to the renderer or browser.
- Invoke rotation using the same stable service subject that created the job; tenant RLS binds the job and envelope revisions to that subject.
- This worker rotates **Career Graph fact envelopes only**. The API also uses the same master-key provider for LinkedIn OAuth token envelopes in `linkedin_connections.token_envelope`; those rows are not rewritten by this worker. Do not retire an old key version merely because the Career Graph job completed. First inventory every encrypted store that shares the key ring, including LinkedIn token envelopes, and keep each referenced old version until those rows are independently rewrapped or deleted/reconnected. A dedicated LinkedIn token rotation path and verification are still required.
- Before starting a rotation, deploy the target current key version to every API task and wait until all old-version API tasks have drained. New Career Graph writes must use the target version throughout the scan; otherwise a late write with a lower UUID than the persisted cursor can be missed by the cursor scan and cause completion to fail closed. Do not run rotation during a rolling deployment that still has old-key writers.
- Run small batches first, monitor audit events and key-provider failures, and verify all envelopes decrypt under the new key before retiring old key versions.
- Run the controlled worker with `npm run build:api` followed by `npm run rotate:career-graph-keys` in a dedicated, short-lived production maintenance task. Supply `CAREEROPS_ROTATION_DATABASE_URL` (TLS-verified production PostgreSQL URL), `CAREEROPS_ROTATION_TENANT_ID`, `CAREEROPS_ENVELOPE_MASTER_KEYS`, and `CAREEROPS_ENVELOPE_CURRENT_KEY_VERSION`. The worker uses the fixed audit actor `system:careerops-key-rotation`; grant this execution path only to an operator-approved maintenance task, never to the public API or renderer. Optional `CAREEROPS_ROTATION_BATCH_SIZE` defaults to 50 and is bounded to 1–100.
- The command is manually invoked and is not automatically scheduled. Restrict task invocation and secret access through the deployment platform's IAM controls, verify the job's completion/audit records, and retain old key versions until independent decryption verification and backup-recovery checks pass.
