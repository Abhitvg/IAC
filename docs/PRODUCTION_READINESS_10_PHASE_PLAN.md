# IAC / CareerOps — Production Readiness Audit and 10-Phase Delivery Plan

**Audit baseline:** `feat/careerops-aws-production-foundation` at `f8b2b87cddae2903698f9f63e9ba0d195090689d`  
**Audit date:** 2026-11-19  
**Scope:** Repository-wide source inventory (525 tracked files): Electron desktop, React renderer, API, cloud-core packages, CareerOps, interview/audio/AI pipelines, browser extension, PostgreSQL migrations and RLS, Terraform/AWS, CI/CD, tests, scripts and security/architecture documentation.

## 1. Executive assessment

**Assessment: strong engineering baseline; not yet production-certified.**

The repository has meaningful safeguards: TypeScript, Zod validation, Electron context isolation and sandboxing, constrained IPC, OS-backed credential storage, encrypted device-local record primitives, bounded document ingestion, SSRF-aware fetching, authenticated cloud API, tenant context, PostgreSQL RLS tests, encrypted Career Graph API payloads, rate limiting, cross-platform CI, packaged-app smoke tests, Terraform validation, secret scans, and a manual AWS deployment workflow.

At the audit baseline, the recorded CI run passed Ubuntu, macOS and Windows validation, PostgreSQL tenant-isolation tests, and Terraform formatting/validation. A later run on PR #232 head `6c2ca685c974e530f6ce2fdb2393456a796cc067` (run [44482069371](https://github.com/Abhitvg/IAC/actions/runs/44482069371), 2026-11-19) failed the Prettier check on this document across macOS, Ubuntu and Windows. Terraform validation, PostgreSQL tenant-isolation, secret scanning, KMS permission checks and the production dependency audit passed. Lint, TypeScript checks, unit/integration tests, builds and packaged-app smoke tests were skipped after the formatting failure. Therefore, the latest commit has not yet passed full application CI and is not production-certified. Neither CI run proves live AWS health, disaster recovery, workload capacity, external-provider behavior, or operational readiness.

The codebase contains 525 tracked files, including 202 under `src/`, 172 tests, 24 API/migration files, 21 Electron files, 31 documentation files and a nine-file Terraform root. This is a broad source inventory and architecture review, not a claim that every line received a manual security review or that live cloud resources were exercised.

## 2. Confirmed strengths

- **Desktop boundary:** Electron uses context isolation, disabled Node integration, production sandboxing, trusted-origin navigation checks and an explicit preload API. Sensitive provider calls and credential resolution have been moved into the main process in the audited baseline.
- **Credential storage:** API credentials use Electron OS-backed `safeStorage`; Linux rejects the insecure `basic_text` backend. Device-local encrypted record storage wraps a random data key using OS-backed storage and uses authenticated AES-GCM records.
- **Input and file safety:** document import size/archive limits, bounded record sizes, safe file operations, sender checks, DNS-pinned fetch support and SSRF defenses are present.
- **Interview pipeline:** request cancellation, deadlines, bounded streams, empty-stream recovery, transcript preservation fixes and a substantial suite of focused regression tests exist.
- **Cloud foundation:** authenticated API, JWT/JWKS verification, tenant resolution, PostgreSQL repository/migrations, RLS tests, shared rate limiting, audit records and Career Graph encryption are present.
- **Cloud deployment foundation:** Terraform reuses the existing VPC/subnets and provisions the application-facing AWS foundation; CI validates Terraform without AWS credentials. Deployment is a manually dispatched workflow gated to `main`, OIDC and exact-account checks.
- **Governance:** architecture notes explicitly distinguish current implementation from future Temporal, worker, connector and object-storage target capabilities. LinkedIn automation is constrained to an Assist Queue rather than unattended platform actions.

## 3. Material production gaps and risks

### P0 — resolve before production user data or broad rollout

1. **Local PII is not uniformly protected.** The repository inventory identifies candidate profile, CareerOps pipeline, practice/session and interview workspace records in renderer `localStorage`. An encrypted-record primitive exists, but the audit must trace every read/write path and complete migration to it. Browser localStorage is not a secure vault.
2. **Cloud sync is incomplete.** Career Graph has typed API create/list/review operations and server-side envelope encryption, but the application-level selection, preview, explicit sync, conflict and recovery UX is not complete. Existing local data must not be silently uploaded or deleted.
3. **Encryption lifecycle is incomplete.** The API currently uses a versioned local master-key ring supplied to the task. A re-encryption primitive exists, but resumable tenant-scoped rotation, recovery drills, key retirement controls and operational runbooks remain. A KMS-backed provider is an option for trusted backend code; do not put AWS credentials or key material in the desktop/browser.
4. **Data lifecycle is not end-to-end.** Retention, export, deletion propagation, backups, workflow payloads, provider tokens, local caches and restore behavior need a verified data map and tested lifecycle.
5. **No production evidence for SLOs or recovery.** CI is not a substitute for deployed load, fault-injection, restore, regional/AZ failure or on-call exercises.
6. **Live AI privacy needs a complete consent and data-flow contract.** Existing documentation states that live microphone audio and candidate context may be sent to selected cloud providers; this needs clear per-provider disclosure, configurable minimization, retention boundaries and auditable user control.

### P1 — required for a dependable production service

7. **Durable job orchestration is not present.** The target architecture describes Temporal and isolated workers, but the repository inventory does not contain a deployed workflow engine/worker service. Local view-triggered discovery is not a durable scheduler.
8. **Cloud domain coverage is partial.** Career Graph and LinkedIn OAuth are not the complete multi-tenant product data model for profiles, applications, interview sessions, evidence, artifacts and sync state.
9. **Infrastructure and deployment hardening need operational validation.** Terraform includes ALB/ECS/RDS/network resources and existing network reuse, but staging/prod state isolation, ACM/domain prerequisites, secret rotation, migration orchestration, rollback, autoscaling and live health checks need a complete release procedure.
10. **Dependency risk remains visible.** The dependency risk register records 25 high findings in development-tool dependencies and zero critical findings at its last review; production-only audit passes. Non-production dependencies still affect CI/developer attack surface and require tracked remediation.
11. **Observability is not yet an operational platform.** Request IDs and health endpoints exist, but production dashboards, traces, SLO alerts, tenant-safe diagnostics, actionable paging and incident playbooks need implementation and verification.
12. **Frontend deployment differs from API deployment.** Amplify builds the Vite web target; AWS API deployment is a separate manual ECS workflow. Release compatibility, API versioning and coordinated rollback need explicit controls.

### P2 — above-expected quality

13. **No independently measured quality envelope for AI outputs.** Unit tests are useful, but model/provider changes require golden datasets, calibration, regression scoring, hallucination/truthfulness checks, bias/locale checks and shadow evaluation.
14. **Connector resilience needs contracts and certification.** ATS/job-source connectors need fixtures, freshness, rate limits, provenance, idempotency, terms/compliance review and connector health scoring.
15. **Accessibility and product acceptance need human verification.** Automated wizard accessibility and responsive smoke tests exist; full keyboard/screen-reader, localization, usability and end-to-end task completion still require human QA.
16. **Operational maturity needs security exercises.** Add threat modeling, independent penetration testing, tabletop exercises, incident simulations, abuse testing and vendor-risk reviews.

## 4. Architecture guardrails

- Keep Electron as the live-interview client; do not expose Electron IPC or renderer stores as a cloud API.
- Resolve tenant membership from verified identity. A client-supplied tenant ID is a selection hint, never proof of authorization. Enforce PostgreSQL RLS and tenant-scoped foreign keys.
- Sensitive cloud records must be envelope-encrypted before persistence and decrypted only after tenant authorization. Bind ciphertext to tenant and purpose/context.
- Keep device-local data protected with OS-backed keys. Never use a hard-coded application key as a security boundary.
- Make migration explicit, user-visible, resumable and verifiable. Do not silently upload, overwrite or delete local data.
- Keep LinkedIn and other external platform side effects behind explicit user-approved Assist Queue actions and current consent checks. No unattended posting, commenting, connection requests, DMs, scraping or session-cookie access.
- Do not claim zero errors or 100% AI correctness. Define measurable error budgets and terminal states instead.
- No production infrastructure apply, deployment, data migration or PR merge is implied by this plan. Each requires its own approval and reviewed change.

## 5. Ten-phase delivery plan

### Phase 1 — Audit closure, product contract and threat model

**Objective:** Convert the current source baseline into an owned, testable production specification.

**Work**

- Complete a write/read inventory for every PII-bearing store, file, cache, export, log, crash report and backup.
- Map trust boundaries: renderer, Electron main, preload/IPC, browser extension, API, PostgreSQL, AWS services, LLM/STT vendors and future workers.
- Produce STRIDE-style threat models and abuse cases for account takeover, tenant escape, prompt injection, malicious job pages, SSRF, data exfiltration, replay, quota abuse and destructive migration.
- Define product scope, supported jurisdictions, user consent, permitted automation, retention and service ownership.
- Establish ADRs for key provider, data residency, sync semantics, workflow engine and deployment topology.

**Deliverables:** signed-off architecture, threat model, PII/data-flow inventory, service ownership matrix, risk register with owners and due dates.

**Exit gate:** every P0 finding has an owner, implementation issue and testable acceptance criterion; no unresolved critical threat is accepted without explicit risk approval.

### Phase 2 — Local data security and migration foundation

**Objective:** Protect existing desktop data without breaking local-first interview functionality.

**Work**

- Route Candidate Vault, CareerOps, practice/session history, interview workspace and knowledge-vault persistence through the encrypted record store or an equivalent reviewed OS-backed design.
- Trace every persistence path; remove accidental plaintext mirrors, debug dumps and unsafe exports.
- Implement schema-versioned, resumable migrations with dry-run, per-record checksums, counts, failure journal and rollback.
- Require explicit user consent before migration/sync; preserve original data until successful decrypt/read-back verification and user-confirmed cleanup.
- Add encrypted backup/export and restore verification; document key-loss consequences and recovery options.

**Deliverables:** complete persistence map, encrypted-store adapters, migration CLI/UI, migration journal, backup/restore procedure.

**Exit gate:** tests prove no new sensitive plaintext writes; interrupted migration resumes safely; corrupted ciphertext fails closed; restore works on clean machines for macOS, Windows and Linux.

### Phase 3 — Identity, tenant isolation and API hardening

**Objective:** Make the cloud API safe for multi-tenant production traffic.

**Work**

- Harden OIDC/JWKS validation, issuer/audience/algorithm/key-rotation handling, clock skew, token expiry and revocation/session lifecycle.
- Review tenant resolution and every repository query; enforce RLS on every tenant-owned table and tenant-scoped foreign keys.
- Add authorization matrices and negative tests for cross-tenant read/write, object-ID substitution, replay, privilege escalation and missing tenant context.
- Add API versioning, idempotency keys for mutations, schema validation, pagination, request deadlines, payload limits and consistent error contracts.
- Review CORS, proxy trust, rate limits, abuse controls, request logging and health/readiness behavior.
- Add migration locking and safe startup behavior so multiple API replicas cannot race schema changes.

**Deliverables:** API security specification, endpoint matrix, tenant-isolation test suite, versioned OpenAPI/contract artifacts, operational migration command.

**Exit gate:** all endpoint authorization tests pass; tenant-isolation tests run against PostgreSQL in CI; no production route relies only on client-supplied tenant identity.

### Phase 4 — Encryption, secrets and data lifecycle

**Objective:** Deliver verifiable confidentiality and recoverability across cloud and local data.

**Work**

- Select and document the production key provider. Evaluate a trusted-backend KMS envelope provider against the existing local master-key-ring provider; never expose keys to the desktop.
- Implement tenant/context-bound envelope encryption for every sensitive field and object; classify metadata that can remain searchable.
- Build resumable tenant-scoped re-encryption with checkpoints, dry-run, throughput limits, verification, rollback strategy and old-key retention.
- Implement secret rotation for DB credentials, OAuth tokens, signing secrets and encryption keys.
- Implement retention/deletion/export workflows across DB, object store, provider tokens, local data, caches, audit references and backup expiry.
- Ensure logs, metrics, traces and audit events never contain raw resumes, transcripts, prompts, tokens or personal contact details.

**Deliverables:** key-management ADR, provider implementation, rotation worker/runbook, DSAR export/delete workflows, data-retention matrix, recovery drill evidence.

**Exit gate:** tamper/context substitution tests pass; key rotation can be interrupted and resumed; recovery is demonstrated; deletion propagation is verified; no sensitive plaintext is found in cloud storage/logs.

### Phase 5 — Durable CareerOps domain and sync

**Objective:** Turn the local CareerOps prototype into a reliable cloud-backed product without losing offline use.

**Work**

- Complete tenant-scoped APIs and schemas for candidate profile, confirmed career facts, job sources, job postings, evaluations, application tracker, generated documents and user-approved actions.
- Add explicit sync preview, user-selected record scope, conflict resolution, last-sync cursor, retry queue, idempotency and audit history.
- Preserve local interview capability when the cloud is unavailable; define conflict and offline queue semantics.
- Add source provenance, freshness, duplicate detection and confirmed/unconfirmed/derived fact states.
- Keep user review and confirmation as the authority for sensitive claims and external side effects.

**Deliverables:** cloud domain contracts, sync engine, conflict UI, local/offline behavior spec, data provenance model.

**Exit gate:** repeated sync is idempotent; offline/online transitions do not lose or duplicate records; user can inspect exactly what will upload; no unconfirmed fact is used for outbound claims.

### Phase 6 — Durable orchestration, connectors and safe automation

**Objective:** Make scheduled work recoverable, bounded and policy-controlled.

**Work**

- Introduce Temporal or a justified equivalent for durable workflows; add isolated workers with least-privilege scoped credentials.
- Implement Discovery, Evaluate/Prepare, Interview Prep, Assist Queue, Inbox Watch and DSAR workflows with activity-level timeouts, retries, idempotency and compensation.
- Create connector contracts and certification harnesses for job sources/ATSs; capture provenance, rate limits, terms, freshness and connector health.
- Recheck Sprint Contract, consent, caps, quiet hours, suppression and kill-switch state immediately before each irreversible action.
- Keep CAPTCHA, MFA, unsupported forms and uncertain states in a human Assist Queue.
- Do not automate LinkedIn posting, commenting, connections, DMs, scraping or session-cookie operations.

**Deliverables:** workflow definitions, worker deployment, connector SDK, connector fixtures, action policy engine, kill-switch and audit trail.

**Exit gate:** worker crash/restart and duplicate-delivery tests pass; no side effect can bypass revoked consent; retries do not duplicate submissions; unsupported cases route to human review.

### Phase 7 — AI quality, truthfulness and interview reliability

**Objective:** Make AI behavior measurable, explainable and recoverable.

**Work**

- Centralize model access behind a versioned LLM/STT gateway with provider routing, budgets, timeouts, cancellation, fallback policy and structured outputs.
- Build golden datasets for coding, system design, behavioral answers, resume facts, job fit and adversarial prompts.
- Evaluate factual grounding, evidence quote validity, unsupported claims, hallucinations, refusal behavior, prompt injection, bias and multilingual performance.
- Separate deterministic measurements from model judgments; show confidence and evidence limitations.
- Define terminal states for each accepted interview question: answered, clarification required, safely blocked or failed with recovery action.
- Add provider canaries and shadow evaluation before model/prompt rollouts; preserve user control over cloud audio/context sharing.

**Deliverables:** model evaluation harness, benchmark reports, prompt/model registry, release thresholds, reliability SLOs and fallback matrix.

**Exit gate:** release candidates meet agreed benchmark thresholds with no critical truthfulness/security regression; every request reaches a visible terminal state; no unsupported “100% accuracy” claim.

### Phase 8 — AWS infrastructure, deployment and release engineering

**Objective:** Operate a secure, repeatable, reversible production deployment.

**Work**

- Complete staging/production Terraform separation, remote state encryption/locking, reviewed plans and drift detection.
- Verify existing VPC/subnets/route tables/S3 endpoint and database isolation; document required ACM/domain inputs before production HTTPS.
- Harden ECS task roles, execution roles, security groups, ALB, RDS, ECR, Secrets Manager, autoscaling, health checks and image provenance.
- Add database migration job ordering, expand/contract schema changes, immutable image digests, SBOM, image scanning and signed provenance.
- Add staged rollout, smoke tests, rollback to last known-good task definition and frontend/API compatibility checks.
- Configure backup retention, point-in-time recovery, cross-AZ resilience and tested restore.
- Keep infrastructure changes behind explicit approval; CI validation alone does not apply Terraform.

**Deliverables:** production/staging deployment runbooks, Terraform plan artifacts, release pipeline, rollback procedure, SBOM/provenance, restore evidence.

**Exit gate:** staging deployment and rollback are demonstrated; production plan reviewed; HTTPS verified; RDS restore tested; deployment is tied to exact immutable artifact and successful CI commit.

### Phase 9 — Observability, performance and resilience

**Objective:** Prove the service meets user-facing availability and latency objectives under realistic failure.

**Work**

- Add structured, redacted logs; distributed traces; metrics for API, DB, workflows, queue age, provider latency/errors, sync, connector freshness and desktop crash rate.
- Define SLOs/SLIs and error budgets, initially targeting 99.9% monthly API availability only if the team can operate the required redundancy.
- Add dashboards, paging thresholds, runbooks, on-call ownership and tenant-safe support diagnostics.
- Run load, soak, burst, connection exhaustion, provider outage, DB failover, worker restart, AZ impairment and network partition tests.
- Test backpressure, bounded queues, retry storms, circuit breakers, graceful degradation and recovery.
- Validate cost per active tenant and set budget alerts/quotas.

**Deliverables:** SLO catalogue, dashboards, alerts, capacity model, chaos test suite, incident response playbooks, cost model.

**Exit gate:** SLOs are met in staging load/soak tests; no unbounded queue or retry amplification; incidents are detectable and diagnosable without leaking user data.

### Phase 10 — Independent assurance, controlled launch and continuous improvement

**Objective:** Launch with evidence, not assumptions, and sustain quality as the system evolves.

**Work**

- Conduct independent penetration test and targeted review of Electron IPC, API auth/RLS, encryption, file import, SSRF, extension channel and workflow workers.
- Complete privacy review, vendor DPAs/retention review, terms/compliance review for each connector and user-facing data processing disclosures.
- Perform accessibility, keyboard, screen-reader, responsive, localization and full task-based acceptance testing across supported platforms.
- Run incident, breach, key-loss, restore, deletion and provider-outage tabletop exercises.
- Launch through internal alpha, limited beta, staged cohort rollout and general availability with feature flags and rollback thresholds.
- Establish release governance, vulnerability SLAs, dependency upgrade cadence, quarterly access reviews and continuous benchmark/regression evaluation.

**Deliverables:** security assessment, privacy sign-off, UAT report, operational readiness review, launch checklist, support process, post-launch improvement backlog.

**Exit gate:** no unresolved critical/high security findings without formal risk acceptance; operational drills pass; support/on-call and rollback owners are named; launch metrics and stop conditions are agreed.

## 6. Cross-phase release gates

A phase is not complete because code was merged. It is complete only when the evidence below is attached to the release record:

- Automated unit, integration, contract, migration, security and end-to-end tests.
- Cross-platform desktop packaging and launch validation.
- Tenant isolation and authorization negative tests.
- Dependency and container scans, secret scans, SBOM and artifact provenance.
- Load/soak/failure evidence appropriate to the phase.
- Updated data-flow, threat model, runbook and rollback documentation.
- Explicit product/security owner acceptance for residual risks.

## 7. Suggested sequencing and priority

| Priority            | Phases | Why                                                                               |
| ------------------- | ------ | --------------------------------------------------------------------------------- |
| Critical foundation | 1–4    | Close data, identity, encryption and lifecycle risks before broad production use. |
| Product completion  | 5–7    | Make cloud sync, workflows and AI behavior dependable and auditable.              |
| Operationalization  | 8–9    | Deploy safely and prove reliability/capacity with real environments.              |
| Launch assurance    | 10     | Independent verification, controlled rollout and continuous governance.           |

A realistic sequence is to run Phase 1 first, then overlap Phase 2–4 only where their interfaces are agreed. Phases 5–7 depend on the tenant, encryption and contract foundations. Phase 8 can build staging infrastructure in parallel after network and identity inputs are verified. Phase 9 requires a deployed staging system. Phase 10 is the final launch gate, not a paperwork exercise.

## 8. What “above expected” should mean

The differentiator is not adding more AI features or claiming perfect automation. It is making the system trustworthy under failure:

- **Data safety:** user-controlled migration, verified restore, deletion proof and key recovery.
- **Truthfulness:** provenance-backed claims, evidence-linked evaluation and explicit uncertainty.
- **Autonomy with boundaries:** durable workflows that re-check consent and stop safely.
- **Resilience:** graceful degradation, idempotency, no silent task loss and tested recovery.
- **Transparency:** user-visible sync, external data-sharing controls, audit history and understandable failure states.
- **Engineering evidence:** repeatable benchmarks, threat models, SBOM/provenance, SLOs and independent security review.

## 9. Immediate next actions

1. Create a finding-by-finding remediation backlog from the P0/P1 items above with owners and acceptance tests.
2. Close the local persistence inventory and decide the device-local encryption/migration contract.
3. Finish the manual Career Graph sync UI and explicit user-controlled sync semantics.
4. Select the cloud key provider and implement resumable rotation/recovery before relying on encrypted cloud data at scale.
5. Define staging acceptance criteria and run the first deployed end-to-end test before any production release.

**Status:** This document is an audit and delivery plan. It does not certify production readiness and does not authorize AWS provisioning/deployment, production data migration, or PR merge.
