# Live Interview Reliability Audit

- **Audit date:** 2026-11-15
- **Repository:** `Abhitvg/IAC`
- **Baseline:** `main` at `e050be21ea50e02d9184a3d09d6b44d98342be6b`
- **Work branch:** `reliability/interview-pipeline-hardening`

## Executive assessment

The application already has meaningful reliability controls: request-scoped abort signals, an overall generation deadline, stream inactivity timeout, bounded response sizes, empty-stream non-streaming recovery, limited model fallback for model-not-found responses, rate-limit retry, and transcription cancellation.

It does **not** currently justify a claim of zero errors or 100% answer delivery. The implementation has gaps between transcription, generation, delivery, and persistence. A provider returning HTTP 200 is not sufficient evidence that a useful answer was produced.

The target should be measurable end-to-end delivery: every accepted interview question ends in one explicit terminal state (answered, needs clarification, safely blocked, or failed with a recoverable action); no request silently disappears or remains indefinitely pending.

## Confirmed findings

### R1 — Transcript post-processing deleted meaningful speech (fixed on this branch)

- **Severity:** High
- **File:** `src/services/whisper.ts`

The previous cleanup expression removed every square-bracketed and parenthetical span. That destroys legitimate spoken content such as definitions, trade-offs, clarifications, examples, and uncertainty markers. Example: `CAP theorem (consistency, availability, and partition tolerance)` was reduced to `CAP theorem`.

**Change:** Preserve the transcript end-to-end except for explicit technical-term normalization. Removed the second destructive cleanup in `InterviewEngine`; added regression tests for parenthetical explanations, uncertainty markers, and term normalization.

### R2 — Transient stream failures are not consistently retried

**Severity:** High  
**Files:** `src/services/ai.ts`, `src/services/AnswerGenerationService.ts`

The stream layer has an overall deadline and inactivity timeout. It retries an empty stream once using a non-streaming request and attempts alternate models for recoverable model-not-found responses. The higher-level answer service previously retried rate limits but did not provide a general bounded retry for transient network/provider failures.

A bounded retry is now implemented for transient network failures and selected 408/425/5xx responses **only before any answer token has been emitted**. Retries use the existing jittered backoff helper and honor cancellation. A safe retry policy must distinguish:

- Before the first token: retry transient network errors, 408, 425, and selected 5xx responses with bounded exponential backoff and jitter.
- After partial output: never append a second full answer to the first partial answer. Either recover into a replacement answer with an explicit reset event or preserve the partial answer and mark the request interrupted.
- Never retry invalid credentials, billing failures, user cancellation, policy blocks, or malformed requests.

### R3 — Speech transcription can return an empty transcript as success

**Severity:** High  
**Files:** `electron/services/cloudTranscription.ts`, `src/services/whisper.ts`

The cloud transcription adapter currently maps a missing provider `text` field to an empty string. The renderer returns that value as a normal `TranscriptionResult`. An empty result can therefore move downstream as if transcription succeeded.

**Change:** Reject malformed and empty/whitespace transcripts instead of treating them as successful results. The live interview engine now shows an actionable retry/manual-entry toast and restores the listening pipeline state. Cross-provider fallback remains opt-in because it changes data-sharing and potentially billing.

### R4 — Legacy provider adapters do not share the live request lifecycle

- **Severity:** Medium–High
- **Files:** `src/services/providers/LLMProvider.ts`, `src/services/providers/STTProvider.ts`, `src/services/ai.ts`

Several direct provider adapters issue fetch requests without a request signal or timeout. The live `streamAnswer` path is better controlled, but legacy/non-streaming generation and direct STT adapters do not consistently inherit those protections.

**Required change:** Consolidate provider requests behind shared timeout/cancellation/retry contracts, or clearly isolate and deprecate the legacy path. Do not leave two subtly different reliability implementations.

### R5 — Interview session persistence is multi-write and can partially succeed

- **Severity:** Medium
- **File:** `src/services/session.ts`

`saveSession` writes the full session, questions, and performance into separate files. A failure between writes can leave inconsistent session artifacts while the operation rejects. Loading catches corrupt files and continues, which can hide incomplete history unless surfaced in diagnostics.

**Required change:** Make one canonical session record authoritative, write atomically, and treat derived question/performance files as rebuildable indexes or remove the duplicate writes.

### R6 — Reliability is not yet measured end-to-end

**Severity:** High  
**Files:** generation, transcription, session and diagnostic services

The code records some latency and provider diagnostics, but there is no demonstrated unified measurement of:

- audio capture success and duration;
- transcription success, empty-transcript rate, and latency;
- time-to-first-token and time-to-final-answer;
- completed, interrupted, cancelled, timed-out, and failed request counts;
- partial-output recovery rate;
- session-save success and recovery;
- provider/model-specific error rates.

Without these, "zero error" is not testable and regressions can ship undetected.

### R7 — Superseded requests could continue emitting stale tokens

**Severity:** High  
**File:** `src/services/AnswerGenerationService.ts`

The service already compared request sequence numbers at the end of generation, but token and sentence callbacks were forwarded before that final stale-request check. Two overlapping requests could therefore interleave stale output into the live interview UI. The old request also continued through its provider stream even after a newer request had become authoritative.

**Change on this branch:** Suppress token/sentence delivery, completion handling, and error handling when a request is no longer the current sequence. Return an explicit `ABORTED` terminal result for superseded requests. A regression test runs two overlapping generations and verifies that only the latest request emits tokens.

**Additional change on this branch:** A newer generation now aborts the previous request-scoped controller immediately. The abort signal propagates through `streamAnswer` to the Electron IPC cancellation handler and then to the provider fetch. The supersession regression test now asserts that the stale request ID is cancelled at the gateway, in addition to asserting that stale tokens are never delivered.

### R8 — Transcription errors were only diagnostic, not actionable

**Severity:** Medium–High  
**File:** `src/services/InterviewEngine.ts`

The transcription catch path recorded an error and restored the high-level status to listening, but did not show a user-facing recovery message or restore the pipeline stage from `transcribing`. A user could experience a missing answer without knowing whether to repeat the question or type it manually.

**Change on this branch:** Show a distinct message for empty speech versus provider failure, and restore both status and pipeline stage to listening.

### R9 — Screen-answer completion marked failed output as ready

**Severity:** High  
**File:** `src/services/InterviewEngine.ts`

The screen-solver completion handler previously set the session status to `ready` even when factual verification withheld the answer, and did not consistently surface provider failures returned through `onComplete`. The separate `onError` path also omitted a pipeline-stage failure marker.

**Change on this branch:** Handle failed/aborted screen results before normal completion, keep the speakable queue empty, set the correct failed/paused state, record the failure, and show a retry/switch-provider message. Factual blocks now remain explicit failures rather than appearing as ready answers.

### R10 — PostgreSQL tenant-isolation CI depended on runner package installation

**Severity:** Medium  
**Files:** `.github/workflows/ci.yml`, `scripts/test-cloud-postgres-rls.sh`

The main-branch tenant-isolation job failed before running the database assertions because it tried to install `postgresql-client` on the GitHub-hosted runner. The parallel workaround in an open PR removed that install step but did not adapt the shell script, which still invoked `psql` locally.

**Change on this branch:** Run the test against the existing PostgreSQL service container, add a `psql` wrapper using `docker exec -i`, and stream migration SQL from the checked-out workspace into the container. The provisioner subprocess inherits the exported wrapper. The actual RLS assertions still run; they are not skipped.

## Cross-repository review: open security PRs

The open security changes are not yet a single coherent migration:

- **PR #210** introduces `SecurePersistenceStore` and its IPC API, limited to the `candidate-profile` namespace.
- **PR #211** is stacked on #210 (its base is the #210 branch) and migrates the canonical profile to that API. It does not complete the repository-wide PII migration.
- **PR #212** independently introduces `PiiVault`, a second encrypted persistence abstraction with a separate IPC API, namespace model, key file, and AES-GCM envelope format. It is not a consumer migration for all the stores yet.
- **PRs #206–#209** add KMS-envelope validation, LinkedIn Assist Queue policy, Sprint Contract signature validation, and strict JWT base64url validation. Several open PRs carry the same PostgreSQL CI workaround, so the workflow change should be consolidated rather than maintained as repeated parallel edits.
- The workflow-only workaround in #212 removes the runner-side `psql` installation but does not make `scripts/test-cloud-postgres-rls.sh` use `POSTGRES_CONTAINER_ID`; without a client-side wrapper, that change still cannot run the script.

### Security findings from the diffs

1. **Do not merge #210 and #212 as two independent storage platforms.** Choose one canonical persistence abstraction, port the migration consumers to it, and document key recovery/rotation. Otherwise the app will have multiple incompatible encrypted storage APIs.
2. **#211 does not finish PII migration.** Candidate vault, knowledge vault, practice stores, feedback, workspace, interview history and recordings still need an owner-by-owner migration and verification.
3. **#211 can downgrade to plaintext when the secure API is absent.** `CanonicalProfileService` treats a missing secure persistence API as success and uses `localStorage`. Browser-only fallback may be a product decision, but Electron must distinguish an actual browser runtime from a broken/missing preload API and fail closed rather than silently downgrade.
4. **Legacy candidate-vault data remains a separate source.** `useCandidateVaultStore` still initializes from its localStorage keys. The canonical profile migration must explicitly migrate/verify/delete those legacy copies rather than assume canonical profile migration covers them.
5. **PR #212 is a primitive, not a completed migration.** Its new vault and IPC methods do not by themselves move existing PII stores into encrypted persistence.

### Recommended merge order

1. Decide the single encrypted persistence architecture and resolve #210/#211/#212 as one migration design.
2. Land the independent M0 security hardening (#206–#209) after consolidating their repeated CI edits and confirming each test suite.
3. Complete each PII owner migration with read-back verification, resumable migration, source deletion only after verification, and explicit browser-vs-Electron behavior.
4. Close issue #72 only after the inventory is fully migrated and verified—not when one profile record is encrypted.

## Existing safeguards verified

- `streamAnswer` uses an overall deadline and an inactivity deadline.
- Cloud LLM response bytes are bounded and SSE errors are propagated.
- Empty streaming responses trigger one non-streaming recovery request.
- Model fallback is bounded and restricted to recoverable model availability failures.
- Answer generation retries rate limits with abort-aware backoff.
- Cloud transcription has a 60-second timeout, bounded response reading, and request cancellation.
- The Electron main process owns cloud credentials and performs transcription requests.
- The renderer has a request-scoped cancellation path for transcription.

## Reliability design and acceptance criteria

1. Every accepted question has a stable request ID and exactly one terminal state.
2. No request can remain pending beyond its deadline; the UI must show a retry or recovery action.
3. Empty transcription is never represented as a successful transcript.
4. Retries are bounded, jittered, cancellation-aware, and safe against duplicate output.
5. Provider failover across vendors is opt-in and disclosed because it changes data-sharing and potentially billing.
6. Partial answers are explicitly labeled partial; they are never presented as complete.
7. A session write is atomic and verifiable before the UI reports it saved.
8. Telemetry contains request metadata and error codes, not transcripts, prompts, audio, credentials, or resume content.
9. CI includes deterministic fault-injection tests for network timeout, stream interruption, malformed SSE, empty transcript, provider 429/5xx, cancellation races, and persistence interruption.
10. Release gates are based on measured service-level indicators, not an absolute promise of zero failures.

## Initial proposed SLOs (to validate against real usage)

- 99.9% of well-formed generation requests reach a terminal state within the configured deadline.
- 99.5% of accepted generation requests produce a non-empty answer or an explicit safe-block result.
- 99.9% of completed sessions persist successfully or are recoverable from a journal.
- p95 time to first token below 2.5 seconds under supported provider/load conditions.
- 100% of injected cancellation tests terminate without leaking active readers/controllers.
- 100% of injected malformed/empty provider responses are surfaced as errors rather than successful answers.

These are engineering targets, not current measured performance. The SLOs should be refined after instrumenting a representative test cohort.
