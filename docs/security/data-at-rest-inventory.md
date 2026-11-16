# CareerOps data-at-rest inventory (feature branch)

Status: initial source-backed inventory for `feat/careerops-aws-production-foundation`.
This is not a claim that all repository persistence has been audited.

## Executive finding

The AWS KMS envelope-encryption foundation is not yet a complete application-wide data-at-rest solution. The cloud API has a KMS-backed LinkedIn token vault, and Career Graph facts are represented as encrypted envelopes. Several desktop-side stores still serialize candidate and job-search/interview content directly into browser `localStorage`. The Electron renderer must not receive AWS credentials or call KMS directly; KMS operations belong behind the authenticated cloud API / trusted backend boundary.

## Confirmed persistence inventory

| Area | Evidence in branch | Data class | Current at-rest handling | Priority |
|---|---|---|---|---|
| LinkedIn OAuth tokens | `apps/api/migrations/0006_linkedin_oauth.sql`; LinkedIn OAuth runtime and token vault | Access/refresh tokens | `token_envelope` JSONB; runtime uses tenant envelope cipher backed by KMS | Maintain; add rotation/recovery tests |
| Career Graph facts | `apps/api/migrations/0005_career_graph_facts.sql`; `apps/api/src/career-graph-repository.ts` | User facts and source metadata | `value_envelope` required by DB constraint; tenant-bound envelope | Maintain; validate all writers use cipher |
| Candidate Vault | `src/store/useCandidateVaultStore.ts` | Name, email, phone, location, employment, compensation, work authorization, profile pitch, links | JSON serialized directly to `career_ops_candidate_vault_v2` in `localStorage`; v1 migration copies plaintext to v2 | P0 |
| CareerOps pipeline | `src/store/useCareerOpsStore.ts` | Job descriptions, application notes, salary ranges, application status, generated resume/cover-letter/outreach material and discovery sources | JSON serialized directly to `career_ops_pipeline_v2` and `career_ops_discovery_sources_v1` in `localStorage` | P0 |
| Practice/interview data | `src/store/usePracticeStore.ts` | Session history, candidate answers, behavioral stories, feedback, company plans, weakness plans, explainer attempts | Generic `localStorage` JSON persistence under `ai_practice_*_v1` keys | P0 |
| Core interview workspace | `src/store/useAppStore.ts` | Resume, job description, transcripts, answers, conversation history, workspaces and session history | Store includes these state objects; exact persistence adapters and keys still need a complete write-path trace | P0 pending trace |
| Sprint Contract | `apps/api/migrations/0001_cloud_foundation.sql`; `apps/api/src/postgres-repository.ts` | Consent contract content and acceptance evidence | `contract_json` stored as JSONB, hash/signature and immutable acceptance metadata | P1 classification review; do not silently change signed evidence |
| Audit events | `apps/api/migrations/0001_cloud_foundation.sql` and `0002_runtime_role_hardening.sql` | Actor/action/entity metadata | Append-only hash-chained records; metadata is not encrypted by the current schema | P1 minimize metadata; assess sensitive identifiers |

## Required architecture

1. Keep AWS KMS credentials and permissions exclusively on the backend task role. Never put IAM credentials, KMS key material, or broad AWS permissions in Electron, renderer code, browser storage, or a shipped desktop binary.
2. Use the existing `TenantEnvelopeCipher` abstraction for server-side tenant data encryption. Every envelope must bind tenant ID and a stable, versioned data context.
3. Add authenticated cloud API persistence for candidate profile, job applications, interview sessions/transcripts, stories and practice records. The API must resolve tenant membership from verified identity, enforce PostgreSQL RLS, and encrypt/decrypt at the repository boundary.
4. Keep local-first/offline support only with a separate device-local encryption boundary (for example OS-backed Electron safe storage or an explicitly designed local key hierarchy). Do not pretend browser `localStorage` encryption with a hard-coded application key provides protection.
5. Introduce schema-versioned migrations and dual-read/backfill flows. Existing plaintext rows/local records must remain readable during migration; verify ciphertext before deleting legacy plaintext. Make backfills resumable, idempotent, auditable, and tenant-scoped.
6. Add key-version handling, rewrap/rotation, recovery procedures, retention/deletion behavior, and tests for tenant/context substitution, tampering, partial migration, and rollback.

## Implementation order

- P0: trace all persistence reads/writes in `useAppStore`, Candidate Vault, CareerOps pipeline and Practice store; identify IndexedDB, filesystem, export and backup paths too.
- P0: define cloud API contracts and tenant-scoped PostgreSQL tables for candidate profiles, applications and interview/practice records; encrypt sensitive payload columns before insert and decrypt only after tenant authorization.
- P0: implement migration state/version metadata and an explicit client sync protocol. Do not silently upload user data or delete local copies.
- P1: classify Sprint Contract and audit metadata; preserve immutable consent evidence and avoid placing secrets or full resume/transcript content in audit metadata.
- P1: add KMS rotation, key-policy validation and live AWS integration tests in a non-production account.
- P2: decide the supported offline/device-local encryption and recovery model.

## Release gates

- No plaintext PII, resume, job-description, transcript, answer, token or credential payloads in cloud database rows, logs, telemetry or audit metadata.
- Every encrypted record is authenticated to its tenant and purpose/context.
- Cross-tenant read/write and ciphertext substitution tests pass.
- Legacy migration is resumable and verified before plaintext cleanup.
- No AWS credential or KMS secret is shipped to the desktop client.
- Live KMS GenerateDataKey/Decrypt and key-policy tests pass in the target AWS account.

## Scope caveat

This inventory is based on the source paths listed above and is intentionally conservative. It is not exhaustive until all repository persistence APIs, IndexedDB/filesystem writes, exports, crash reports, logs, caches and backup flows have been traced.
