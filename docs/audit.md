# CareerOps Cloud Transformation — Repository Audit

**Audit date:** 2026-11-11
**Repository:** `Abhitvg/IAC`
**Baseline:** `main` at `6a24b0b44271658c75fff68f798c1a9f8e1e68f4`
**Scope:** CareerOps, candidate data, persistence, Electron IPC, LLM integration, browser extension, CI/security controls, and issue #72.

## Executive assessment

The repository is an Electron + React + TypeScript desktop application. CareerOps is a renderer-side feature built around Zustand stores and browser `localStorage`. The existing codebase does **not** currently contain a cloud API, multi-tenant identity layer, PostgreSQL schema, row-level security policies, durable workflow engine, cloud object storage, or a hosted worker fleet.

The existing CareerOps implementation is a useful product prototype and domain starting point, not a cloud automation backend. Its current discovery is best-effort public HTML scanning initiated while the desktop view is open. It is not a durable scheduler and does not provide unattended ATS submission, mailbox automation, inbound reply handling, or calendar scheduling.

The requested transformation therefore requires a deliberate service boundary and staged migration. Do not retrofit multi-tenancy by exposing renderer stores or Electron IPC to the internet.

## 1. Repository and runtime inventory

- App identity: `ai-interview-assistant`; Electron is the desktop runtime and Vite/React the renderer.
- TypeScript is used throughout. Existing scripts include build, lint, typecheck, Vitest, Playwright, and a secret-check script.
- Runtime dependencies include React, Zustand, Electron Store, WebSocket, Zod, PDF/DOCX parsing and UI libraries.
- The inspected package manifest does not include a cloud API framework, PostgreSQL driver/ORM, workflow engine, cloud object-storage SDK, OAuth provider framework, or distributed tracing SDK.
- CI currently runs the desktop app's test/build matrix on Ubuntu, macOS and Windows. It is not a cloud-service deployment pipeline.
- Main application code and Electron preload are in `electron/main.ts` and `electron/preload.ts`; privileged operations are mediated through IPC.

## 2. CareerOps implementation

Primary files:
- `src/components/careerOps/CareerOpsView.tsx` — large renderer view and workflow UI.
- `src/components/careerOps/CareerDiscoveryPanel.tsx` — career source configuration and discovery UI.
- `src/store/useCareerOpsStore.ts` — Zustand application/source state, discovery, evaluation, tailoring, cover-letter and outreach draft actions.
- `src/store/useCandidateVaultStore.ts` — candidate profile vault.
- `src/services/careerOps/types.ts` — application, evaluation, source and form-answer types.
- `src/services/careerOps/discoveryService.ts` — extracts candidate job links from public HTML.
- `src/services/careerOps/jobScraperService.ts` — fetches and parses job posting pages.
- `src/services/careerOps/careerOpsService.ts` — heuristic/LLM evaluation, resume tailoring, cover letters and outreach drafts.
- `src/services/careerOps/autoFillService.ts` — browser-page autofill helpers.
- `src/services/careerOps/followUpService.ts` — local follow-up timeline logic.
- Tests include `tests/careerOps.test.ts`, `tests/careerOpsAutoFill.test.ts`, `tests/careerOpsDiscovery.test.ts`, and `tests/careerOpsExtensions.test.ts`.

Observed limitations:
1. CareerOps applications, sources and candidate profile are persisted in renderer `localStorage`; state is not tenant-aware or synchronized to a service.
2. Discovery is triggered from the open CareerOps view and checks sources on a local interval. It stops when the app/view is not running. It has no durable schedule, workflow history or distributed concurrency control.
3. Discovery is generic public HTML link extraction, not a set of maintained ATS connectors with per-provider contracts, pagination, rate budgets and fixtures.
4. Heuristic evaluation is a lightweight keyword comparison. A keyword hit is not proof of proficiency. It must never independently authorize an application.
5. AI output and prompt handling are not yet a centralized schema-validated, versioned, tenant-budgeted LLM gateway.
6. Existing auto-fill is a browser helper, not an isolated hosted Playwright worker. It does not provide robust proof artifacts, idempotent submission semantics, per-tenant quotas or durable retries.
7. Current follow-up logic is local date arithmetic; it does not send messages or consume inbox replies.
8. No Sprint Contract, consent ledger, global suppression service, contact graph, activity event stream, adaptive allocator, calibrated forecast service or tenant kill switch exists in the inspected architecture.
9. Demo records are explicitly flagged, but all production analytics and all new server-side queries must continue to exclude demo fixtures.

## 3. Persistence and PII inventory

### Renderer `localStorage`

| Owner                    | Observed keys / data                                        | PII or sensitivity                                                                                                                          |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `useAppStore`            | `candidate_resume`, `target_job_description`, `target_role` | CV, employment history, target role, third-party job content                                                                                |
| `useAppStore`            | `interview_workspaces_v1`                                   | Candidate notes, job descriptions, workspace content                                                                                        |
| `useAppStore`            | `iac_session_history`                                       | Interview transcripts, answers, session metadata and potentially captured sensitive material                                                |
| `usePracticeStore`       | `ai_practice_active_session_v1`, `ai_practice_sessions_v1`  | Session history, candidate answers, interview transcripts                                                                                   |
| `usePracticeStore`       | `ai_practice_stories_v1`                                    | Behavioral stories, personal employment events                                                                                              |
| `usePracticeStore`       | `ai_practice_feedback_v1`, `ai_practice_weakness_plan_v1`   | Performance feedback and inferred weaknesses                                                                                                |
| `usePracticeStore`       | topics, plans, explainer attempts, concept cards            | Learning profile and career preparation data                                                                                                |
| `useCareerOpsStore`      | `career_ops_pipeline_v2`, legacy v1                         | Job applications, notes, evaluation reports, form answers, status                                                                           |
| `useCareerOpsStore`      | `career_ops_discovery_sources_v1`                           | Target companies, search URLs, job interests                                                                                                |
| `useCandidateVaultStore` | `career_ops_candidate_vault_v2`, legacy v1                  | Name, email, phone, location, profile URLs, work authorization/sponsorship declarations, salary expectation, notice period and career facts |
| `useAppStore`            | settings and device preference keys                         | Preferences; provider configuration may be sensitive depending on key                                                                       |

### Electron `userData` and filesystem

- `electron/main.ts` defines `recordings/` and `sessions/` under `app.getPath('userData')`.
- Interview session JSON is read/written as ordinary JSON via IPC. The session can contain transcripts, generated answers and metadata.
- Audio recordings are stored under the recordings directory; audio can contain voice, names, employer details and other sensitive conversation.
- Renderer file APIs are restricted to approved paths and `userData`, with size and canonical-path checks. Path restrictions are not encryption.
- Settings are persisted through Electron Store (inspect the exact setting payload and migration path before moving them).
- `CredentialStore` uses Electron `safeStorage` async APIs and refuses Linux `basic_text` / unavailable keyrings for saved API credentials. It supports legacy AES-GCM migration and process environment / `.env.local` fallback. This is a local credential control, not a cloud OAuth token vault.

### Other sensitive data paths

- Screen-capture OCR is processed in Electron; temporary screenshots are written to the OS temp directory and removed on the normal success path. Failure/termination cleanup and retention must be verified.
- The LLM and transcription flows send prompt, candidate context or audio to configured third-party AI providers. Provider, payload scope, retention and user disclosure need explicit product controls.
- The browser extension stores an extension token in Chrome local storage and connects to a loopback WebSocket. It currently forwards user-selected page context; it is not a LinkedIn integration.
- Logs and error paths must be reviewed for transcript, OCR, email, tokens and prompt leakage before cloud telemetry is enabled.

## 4. Electron IPC and security boundary

Relevant files: `electron/main.ts`, `electron/preload.ts`, `electron/ipc/handlers.ts`, `electron/services/security.ts`.

Existing protections observed:
- BrowserWindow uses context isolation and disables Node integration; production sandbox is enabled.
- Navigation and window-open handlers restrict untrusted origins.
- CSP is set through session headers.
- Sensitive IPC handlers use `isTrustedSender`, checking the expected WebContents, main frame and trusted app origin.
- File read/write/delete APIs use canonical path validation, userData boundaries, approved file-dialog paths and size limits.
- Safe network fetch validates and pins resolved addresses to reduce SSRF/DNS rebinding exposure.
- Provider API keys are stored in Electron main via `CredentialStore`, not exposed in the public settings snapshot.
- Cloud LLM and transcription requests have bounded request validation and cancellation controllers.

Risks / migration requirements:
- IPC is a local desktop trust boundary; it is not an authenticated tenant API. Do not expose these IPC methods or local WebSocket endpoints to cloud workers.
- The current extension authenticates to loopback using a token stored in `chrome.storage.local`. This design must not be reused as an internet bearer-token architecture.
- IPC controller maps have request-level cancellation but need bounded concurrency and resource quotas if request volume increases.
- The preload exposes a broad typed surface including filesystem, settings, credentials, transcription and streaming. Preserve the live-interview functionality, but keep cloud account/session calls narrow and schema-validated.
- Electron local files are not covered by database RLS or cloud KMS. Migration must be explicit, resumable and user-visible.

## 5. LLM and AI layer

- CareerOps calls `streamAnswer` through `careerOpsService.ts` and uses a local heuristic fallback.
- The live interview assistant uses `createPracticeLLMCaller.ts`, which obtains provider settings and calls the Electron cloud LLM streaming path.
- Audio transcription uses Electron cloud transcription services and configured providers.
- Existing live audio, Whisper, streaming, AI modes and session history are separate product-critical flows and must remain functional through the migration.
- No evidence in the inspected package/architecture of a shared cloud LLM gateway with tenant budgets, structured output contracts, prompt versioning, PII minimization, evaluation datasets, provider health, or auditable model routing.
- All job posts, email bodies, web pages, profile exports and model-generated text must be treated as untrusted data. They must be passed as delimited data, never interpolated as executable system policy or tool instructions.

## 6. Browser extension

Files: `browser-extension/manifest.json`, `background.js`, `content.js`.

- Manifest V3 extension has `activeTab`, `contextMenus`, `scripting`, loopback host permissions and a content script matching all URLs.
- Background worker opens a loopback WebSocket and sends selected text or page URL to the desktop app after a context-menu action.
- Content script listens for Alt+A and forwards selected text.
- Token is kept in `chrome.storage.local`; it is not a cloud identity mechanism.
- No LinkedIn-specific automation is observed in these files.
- For the new Assist Queue, extension permissions should be reduced to explicit supported flows. It must never scrape LinkedIn, visit profiles automatically, or perform a connection/message action without a direct user gesture. Prefer a queue UI with one explicit click per prepared action.

## 7. Issue #72 — at-rest encryption

Issue [#72](https://github.com/Abhitvg/IAC/issues/72) is **open** and labelled P1. Its body confirms that candidate profiles, resumes, JDs, CareerOps applications, practice feedback, stories, study progress, workspaces and session history are stored in renderer localStorage and JSON files without uniform encryption at rest.

It also correctly identifies `FeedbackStorageEncryption` as optional and unsafe to treat as meaningful protection: its default key source is deterministic/application-scoped, its salt is fixed, and it is not wired into normal persistence. The helper is not a remediation.

Issue #72's acceptance criteria require a single persistence/encryption boundary, OS-backed key storage, versioned authenticated encryption with context binding, safe plaintext migration, tamper-fail-closed behavior, rotation, backup/export recovery, explicit coverage of audio/temp/cache scope and packaged tests. These remain relevant to the Electron migration path even though cloud persistence becomes primary.

**Decision:** Do not close #72 based on this audit or on the cloud design. Create a separate, tested desktop migration/remediation plan. Cloud KMS encryption does not retroactively encrypt existing local data.

## 8. Security and compliance gaps against the target

| Target control                    | Current evidence                       | Gap                                                      |
| --------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| Tenant isolation / PostgreSQL RLS | None found                             | No cloud tenant model or DB                              |
| Auth / OAuth                      | No cloud auth service found            | No identity/session lifecycle                            |
| Per-tenant envelope encryption    | None found                             | No KMS-backed tenant DEKs                                |
| Immutable audit log               | No cloud audit subsystem found         | No append-only activity evidence                         |
| Consent and Sprint Contract       | No persistent consent ledger found     | No signed scopes, revocation or versioning               |
| Kill switch / channel pause       | Local UI state only                    | No server-enforced channel gates                         |
| Durable workflow / scheduler      | Local interval while UI open           | No durable retries, timers or idempotency                |
| ATS apply worker                  | Renderer/browser autofill helpers      | No isolated worker fleet or proof store                  |
| Gmail / Outlook / Calendar        | None found in inspected tree           | No verified connectors/scopes                            |
| Contact enrichment                | None found                             | No licensed provider contract                            |
| Suppression / compliance          | None found                             | No consent, opt-out, jurisdiction or suppression service |
| Truthfulness gate                 | No Career Graph-backed hard gate found | No claim-level evidence validation/blocking              |
| Prompt-injection defense          | No unified policy boundary found       | Needs explicit isolation and adversarial suite           |
| Forecast calibration              | No measured funnel service found       | No calibrated ranges or confidence intervals             |
| Observability / cost budget       | Desktop logs and CI                    | No tenant-aware traces, quotas or alerting               |

## 9. Migration risks and sequencing

1. Build the cloud tenant/auth/audit/consent/encryption boundary before importing personal data.
2. Add a versioned export/import package for existing CareerOps, candidate vault and interview/practice history. Preserve source IDs and timestamps; never infer missing facts.
3. Make cloud sync opt-in and idempotent. Report imported, skipped, conflicted and failed records. Keep the original local copy until the user confirms successful import and recovery.
4. Keep live interview audio and Whisper traffic on the Electron client initially. Cloud sync of transcripts/session history must be a separate, explicit data-sharing choice.
5. Keep all connector credentials in a server-side secrets manager with least-privilege OAuth scopes and refresh/revocation handling. Never accept LinkedIn passwords or cookies.
6. Do not launch unattended application/outreach channels until caps, suppression, consent, truthfulness, audit and kill-switch gates are implemented and tested.

## 10. Assumptions and open decisions

- The cloud service will be a new set of TypeScript applications/packages in this repository; Electron remains the desktop interview client.
- PostgreSQL is the system of record. Tenant identity comes from verified server-side auth claims, never a client-supplied tenant ID.
- Temporal is selected for durable 72–96-hour workflows, timers, retries and activity history. Operational complexity is accepted.
- Cloud KMS + envelope encryption is required for tenant data; OAuth tokens use a dedicated secrets manager, not application tables in plaintext.
- Playwright runs in isolated ephemeral containers and only for supported employer ATS application flows. No LinkedIn browser automation.
- Gmail restricted scopes require Google OAuth verification/security assessment before broad rollout. Microsoft Graph and IMAP are separate connector options with explicit consent.
- Public job sources may be incomplete or unstable. JavaScript-heavy, login-protected, CAPTCHA-gated or unsupported pages route to Assist Queue/manual import.
- Jurisdiction, sender identity, lawful basis/consent, recipient timezone and mailbox provider health are required before outreach. Default is no send when compliance state is unknown.
- Forecasts start with declared population priors and must display source, sample size, confidence and calibration notes. No outcome promise is allowed.
- No cloud provider, deployment region, KMS vendor, secrets manager, billing provider or legal entity has yet been selected. These are deployment decisions, not facts inferred from this repo.
