# CareerOps Career Graph fact storage

## Scope

Migration `0005_career_graph_facts.sql` establishes the tenant-scoped persistence boundary for versioned candidate facts. The domain contract lives in `packages/cloud-core/src/career-graph.ts`.

This is a storage/domain foundation, not a claim that Career Graph is already exposed as a production API or that a cloud KMS adapter is deployed.

## Data model

- A fact is identified by a stable, lowercase `fact_key` and a tenant-local monotonically increasing version.
- Every version is immutable. Corrections create a new row/version; old evidence remains available for audit and conflict resolution.
- Values are stored only as an AES-256-GCM envelope. The schema rejects plaintext-shaped payloads and binds the envelope to the tenant and `career-graph:<fact_key>` context.
- Provenance records a bounded source kind, optional reference, and optional SHA-256 evidence digest. Avoid putting document contents, access tokens, or other secrets in provenance references.
- Confirmation/rejection is a separate append-only review event. A fact without a review is unconfirmed; downstream tailoring must not treat it as verified.
- Both tables enforce forced PostgreSQL RLS and append-only triggers.

## Security and rollout constraints

1. A real cloud KMS adapter must generate and unwrap data keys before this storage can be used by a hosted service. The existing envelope cipher is an interface-based primitive; test-only key management is not production KMS.
2. The API must derive tenant and actor from verified identity/membership, never from request payload fields.
3. Writes must append a tenant audit event in the same transaction as the fact/review record.
4. Reads must return encrypted envelopes unless the caller passes an explicit authorization and KMS-backed decryption boundary.
5. Resume tailoring, default answers, and application forms must use only facts with an explicit `confirmed` review and an accepted Sprint Contract allow-list.
6. Existing databases require the migration runner's explicit reviewed baseline. Migration `0005` is not a manual schema patch.

## Verification

The domain tests cover envelope-only input, tenant/context binding, stable fact keys, bounded provenance, and contributor-only review. PostgreSQL migration/RLS integration remains a required CI gate before merge.
