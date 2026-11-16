# CareerOps data-at-rest inventory (feature branch)

Status: initial source-backed inventory for `feat/careerops-aws-production-foundation`.
This is not a claim that all repository persistence has been audited.

## Executive finding

The AWS KMS envelope-encryption foundation is not yet a complete application-wide data-at-rest solution. The cloud API has a KMS-backed LinkedIn token vault, and Career Graph facts are represented as encrypted envelopes. Several desktop-side stores still serialize candidate and job-search/interview content directly into browser `localStorage`. The Electron renderer must not receive AWS credentials or call KMS directly; KMS operations belong behind the authenticated cloud API / trusted backend boundary.

## Confirmed persistence inventory

- **LinkedIn OAuth tokens** — Evidence: `apps/api/migrations/0006_linkedin_oauth.sql`; LinkedIn OAuth runtime and token vault. Data: Access/refresh tokens. Current handling: `token_envelope` JSONB; runtime uses tenant envelope cipher backed by KMS. Priority: Maintain; add rotation/recovery tests.
- **Career Graph facts** — Evidence: `apps/api/migrations/0005_career_graph_facts.sql`; `apps/api/src/career-graph-repository.ts`. Data: User facts and source metadata. Current handling: `value_envelope` required by DB constraint; tenant-bound envelope. Priority: Maintain; validate all writers use cipher.
- **Candidate Vault** — Evidence: `src/store/useCandidateVaultStore.ts`. Data: Name, email, phone, location, employment, compensation, work authorization, profile pitch, links. Current handling: JSON serialized directly to `career_ops_candidate_vault_v2` in `localStorage`; v1 migration copies plaintext to v2. Priority: P0.
- **CareerOps pipeline** — Evidence: `src/store/useCareerOpsStore.ts`. Data: Job descriptions, application notes, salary ranges, application status, generated resume/cover-letter/outreach material and discovery sources. Current handling: JSON serialized directly to `career_ops_pipeline_v2` and `career_ops_discovery_sources_v1` in `localStorage`. Priority: P0.
- **Practice/interview data** — Evidence: `src/store/usePracticeStore.ts`. Data: Session history, candidate answers, behavioral stories, feedback, company plans, weakness plans, explainer attempts. Current handling: Generic `localStorage` JSON persistence under `ai_practice_*_v1` keys. Priority: P0.
- **Core interview workspace** — Evidence: `src/store/useAppStore.ts`. Data: Resume, job description, transcripts, answers, conversation history, workspaces and session history. Current handling: Store includes these state objects; exact persistence adapters and keys still need a complete write-path trace. Priority: P0 pending trace.
- **Sprint Contract** — Evidence: `apps/api/migrations/0001_cloud_foundation.sql`; `apps/api/src/postgres-repository.ts`. Data: Consent contract content and acceptance evidence. Current handling: `contract_json` stored as JSONB, hash/signature and immutable acceptance metadata. Priority: P1 classification review; do not silently change signed evidence.
- **Audit events** — Evidence: `apps/api/migrations/0001_cloud_foundation.sql` and `0002_runtime_role_hardening.sql`. Data: Actor/action/entity metadata. Current handling: Append-only hash-chained records; metadata is not encrypted by the current schema. Priority: P1 minimize metadata; assess sensitive identifiers.

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


## Additional verified renderer write paths

A follow-up trace of `src/store/useAppStore.ts` confirms these are plaintext browser-storage writes, not merely in-memory state:

- `candidate_resume` and `target_job_description` store full document text.
- `interview_workspaces_v1` stores workspace objects including job descriptions.
- `iac_session_history` is used as a local fallback for session history.
- The store also references `interview_transcript` and `conversation_history` during data cleanup; their complete writers and the primary session-history database adapter still need tracing.
- `target_role`, settings and device preferences are also persisted; classify them separately because not all are sensitive.

The Practice store writes serialized active sessions, session history, behavioral stories, feedback records, company preparation plans, weakness plans, explainer attempts and concept cards through generic `localStorage` helpers. Those payloads can contain user answers and resume-derived information, so they must be treated as sensitive until field-level classification proves otherwise.

This makes the desktop persistence migration a first-class blocker, not an optional hardening task. Server-side KMS encryption alone cannot protect plaintext that remains in browser storage on the user's device.


## Additional verified storage paths and security caveats

Further source inspection confirmed:

- `src/services/session.ts` serializes complete interview sessions (questions and answers) to JSON files via `electronAPI.writeFile` in the user-data sessions directory. Loading reads those JSON files back as plaintext. The atomic file-write helper protects integrity against partial writes, not confidentiality.
- `src/services/knowledgeVault/knowledgeVaultService.ts` serializes the candidate knowledge vault to `iac_candidate_knowledge_vault_v2` in browser `localStorage`. The vault includes profile PII, source/evidence snippets, employment, projects and technologies.
- `src/services/practice/security/FeedbackStorageEncryption.ts` derives its default key from a public constant based on the Electron platform (or a fixed browser string) and a hard-coded salt. That is not a secret and does not provide meaningful at-rest confidentiality against an attacker who can read the application bundle and storage. Do not enable this helper with its default key source; replace it with a main-process OS-backed key service or remove it from active use. A caller-supplied passphrase has different properties but still needs explicit lifecycle, entropy, recovery and UX design.
- `electron/services/credentialStore.ts` already uses Electron `safeStorage` for provider API keys and refuses insecure Linux `basic_text` fallback. This is a useful pattern for device-local secrets, but its existing API only handles a narrow allowlist of provider credentials; it is not a general-purpose encrypted document/session store.
- The preload bridge currently exposes generic plaintext `readFile`/`writeFile` IPC operations and does not expose a dedicated encrypted-data API. Any such API must validate a strict logical record identifier and keep key operations in the main process; it must not accept arbitrary caller-selected filesystem paths or expose raw key material to the renderer.

## Refined desktop/local data-at-rest priorities

1. P0: disable/rework the deterministic-default `FeedbackStorageEncryption` helper before treating its output as protected.
2. P0: add a main-process, OS-backed encrypted file-store abstraction with authenticated encryption, versioned envelopes, strict logical namespaces, atomic writes, safe migration and no key export to renderer.
3. P0: migrate interview session JSON files and localStorage stores (Candidate Vault, Knowledge Vault, CareerOps, Practice, workspaces/resume/JD) using read-verify-write-verify-cleanup sequencing. Do not delete plaintext until the encrypted copy is durably verified and a recovery strategy exists.
4. P1: define multi-device sync and cloud backup separately; a device-bound safeStorage key cannot decrypt data on another device and must not be reused as a cloud tenant key.
5. P1: define behavior on Linux without a secure keyring: either require configuration, or require an explicit user-managed passphrase with a documented recovery model. Never silently fall back to a public constant.
