# Live Interview Reliability Audit

**Audit date:** 2026-11-15  
**Repository:** `Abhitvg/IAC`  
**Baseline:** `main` at `e050be21ea50e02d9184a3d09d6b44d98342be6b`  
**Work branch:** `reliability/interview-pipeline-hardening`

## Executive assessment

The application already has meaningful reliability controls: request-scoped abort signals, an overall generation deadline, stream inactivity timeout, bounded response sizes, empty-stream non-streaming recovery, limited model fallback for model-not-found responses, rate-limit retry, and transcription cancellation.

It does **not** currently justify a claim of zero errors or 100% answer delivery. The implementation has gaps between transcription, generation, delivery, and persistence. A provider returning HTTP 200 is not sufficient evidence that a useful answer was produced.

The target should be measurable end-to-end delivery: every accepted interview question ends in one explicit terminal state (answered, needs clarification, safely blocked, or failed with a recoverable action); no request silently disappears or remains indefinitely pending.

## Confirmed findings

### R1 — Transcript post-processing deleted meaningful speech (fixed on this branch)

**Severity:** High  
**File:** `src/services/whisper.ts`

The previous cleanup expression removed every square-bracketed and parenthetical span. That destroys legitimate spoken content such as definitions, trade-offs, clarifications, examples, and uncertainty markers. Example: `CAP theorem (consistency, availability, and partition tolerance)` was reduced to `CAP theorem`.

**Change:** Preserve the transcript verbatim except for explicit technical-term normalization. Added regression tests for parenthetical explanations, uncertainty markers, and term normalization.

### R2 — Transient stream failures are not consistently retried

**Severity:** High  
**Files:** `src/services/ai.ts`, `src/services/AnswerGenerationService.ts`

The stream layer has an overall deadline and inactivity timeout. It retries an empty stream once using a non-streaming request and attempts alternate models for recoverable model-not-found responses. The higher-level answer service retries rate limits, but does not provide a general bounded retry for transient network/provider failures.

A safe retry policy must distinguish:
- Before the first token: retry transient network errors, 408, 425, and selected 5xx responses with bounded exponential backoff and jitter.
- After partial output: never append a second full answer to the first partial answer. Either recover into a replacement answer with an explicit reset event or preserve the partial answer and mark the request interrupted.
- Never retry invalid credentials, billing failures, user cancellation, policy blocks, or malformed requests.

### R3 — Speech transcription can return an empty transcript as success

**Severity:** High  
**Files:** `electron/services/cloudTranscription.ts`, `src/services/whisper.ts`

The cloud transcription adapter currently maps a missing provider `text` field to an empty string. The renderer returns that value as a normal `TranscriptionResult`. An empty result can therefore move downstream as if transcription succeeded.

**Required change:** Treat empty/whitespace transcript output as a typed recoverable transcription failure. Preserve the audio/session context so the user can retry, select another explicitly enabled provider, or correct the transcript manually. Do not fabricate a question from silence.

### R4 — Legacy provider adapters do not share the live request lifecycle

**Severity:** Medium–High  
**Files:** `src/services/providers/LLMProvider.ts`, `src/services/providers/STTProvider.ts`, `src/services/ai.ts`

Several direct provider adapters issue fetch requests without a request signal or timeout. The live `streamAnswer` path is better controlled, but legacy/non-streaming generation and direct STT adapters do not consistently inherit those protections.

**Required change:** Consolidate provider requests behind shared timeout/cancellation/retry contracts, or clearly isolate and deprecate the legacy path. Do not leave two subtly different reliability implementations.

### R5 — Interview session persistence is multi-write and can partially succeed

**Severity:** Medium  
**File:** `src/services/session.ts`

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
