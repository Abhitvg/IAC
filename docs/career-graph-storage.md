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

1. The hosted API requires a configured encryption provider for Career Graph reads and writes. It encrypts submitted values before persistence and decrypts only after verified tenant membership; missing keys fail closed with HTTP 503. The current provider is the versioned local master-key ring, not a KMS GenerateDataKey adapter. Direct KMS integration remains an allowed provider implementation.
2. The API derives tenant and actor from verified identity/membership. The create endpoint rejects client-supplied tenant/actor fields, validates a bounded JSON value, and encrypts it with the expected `career-graph:<fact_key>` context. Reads and review responses decrypt only after tenant authorization. The API routes are `GET/POST /v1/career-graph/facts` and `POST /v1/career-graph/facts/:id/review`.
3. Fact creation and review append a tenant audit event in the same PostgreSQL transaction. Fact version allocation takes the same tenant/fact-key advisory lock as the database trigger before reading `MAX(version)`.
4. Database repositories return encrypted envelopes only to the trusted API process. The public API never returns envelope metadata, wrapped keys, or ciphertext.
5. Resume tailoring, default answers, and application forms must use only facts with an explicit `confirmed` review and an accepted Sprint Contract allow-list.
6. Existing databases require the migration runner's explicit reviewed baseline. Migration `0005` is not a manual schema patch.

## Verification

The domain and API tests cover bounded plaintext input, tenant/context binding, stable fact keys, bounded provenance, verified-identity binding, API-side AES-GCM encryption/decryption, ciphertext-only persistence, envelope omission from responses, fail-closed behavior without a key provider, versioned master-key rotation and re-encryption, route validation, version-lock ordering, transaction/audit atomicity, and contributor-only review. PostgreSQL migration/RLS integration remains a required CI gate before merge.
