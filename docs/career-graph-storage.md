# CareerOps Career Graph fact storage

## Scope

Migration `0005_career_graph_facts.sql` establishes the tenant-scoped persistence boundary for versioned candidate facts. The domain contract lives in `packages/cloud-core/src/career-graph.ts`.

This includes authenticated API and PostgreSQL persistence workflows. It is not a claim that a cloud KMS adapter is deployed or that fact-driven tailoring is enabled.

## Data model

- A fact is identified by a stable, lowercase `fact_key` and a tenant-local monotonically increasing version.
- Every version is immutable. Corrections create a new row/version; old evidence remains available for audit and conflict resolution.
- Values are stored only as an AES-256-GCM envelope. The schema rejects plaintext-shaped payloads and binds the envelope to the tenant and `career-graph:<fact_key>` context.
- Provenance records a bounded source kind, optional reference, and optional SHA-256 evidence digest. Avoid putting document contents, access tokens, or other secrets in provenance references.
- Confirmation/rejection is a separate append-only review event. A fact without a review is unconfirmed; downstream tailoring must not treat it as verified.
- Both tables enforce forced PostgreSQL RLS and append-only triggers.

## Security and rollout constraints

1. `TenantEnvelopeCipher` implements AES-256-GCM envelope encryption behind the `TenantKeyManagementService` provider boundary. The provider must generate and unwrap data keys with tenant/context binding enforced by the cloud KMS key policy or encryption context. No cloud provider adapter, credentials, or production KMS key is configured in this repository; the hosted API therefore rejects fact creation with `503` until a real envelope verifier is injected. There is no local/static-key fallback.
2. The API derives tenant and actor from verified identity/membership. The create endpoint rejects client-supplied tenant/actor fields. The API routes are `GET/POST /v1/career-graph/facts` and `POST /v1/career-graph/facts/:id/review`.
3. Fact creation and review append a tenant audit event in the same PostgreSQL transaction. Fact version allocation takes the same tenant/fact-key advisory lock as the database trigger before reading `MAX(version)`.
4. The API verifies the submitted envelope against the authenticated tenant and fact context before persistence. The runtime's unconfigured verifier rejects writes with `503`. The cipher validates canonical base64, 12-byte IVs, 16-byte authentication tags, key metadata bounds, and tenant/context associated data before KMS unwrap. It zeroes data-key buffers after use. Reads must return encrypted envelopes unless the caller passes an explicit authorization and KMS-backed decryption boundary.
5. Resume tailoring, default answers, and application forms must use only facts with an explicit `confirmed` review and an accepted Sprint Contract allow-list.
6. Existing databases require the migration runner's explicit reviewed baseline. Migration `0005` is not a manual schema patch.

## Verification

The domain, API, and encryption tests cover envelope-only input, tenant/context binding, stable fact keys, bounded provenance, verified-identity binding, route validation, version-lock ordering, transaction/audit atomicity, contributor-only review, AES-GCM authentication, malformed-envelope rejection, data-key buffer zeroization, and fail-closed API behavior when KMS verification is unavailable. PostgreSQL migration/RLS integration remains a required CI gate before merge.
