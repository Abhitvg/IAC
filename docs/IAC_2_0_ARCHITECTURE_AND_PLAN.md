# IAC 2.0 — Architecture Audit, System Map & Phased Implementation Plan

## Executive Summary
This document provides the comprehensive architecture audit, system dependency mapping, duplicate reconciliation analysis, and phased implementation plan for **IAC 2.0** (Personal Intelligence, Cross-Device and Product Excellence Initiative).

Baseline Commit: `ac79427` (with zero factual hallucinations, strict origin checks, and fail-closed grounding gates).

---

## 1. Application Architecture Mapping

### 1.1 Electron Main Process (`electron/main.ts`)
- **Lifecycle & Single Instance**: Enforces single-instance lock in production; handles quit cleanup, background child process termination, and window visibility.
- **Window Management**: Configures `mainWindow` with standard title bar, custom overlay translucency, always-on-top, and screen bounds handling.
- **IPC Handlers**:
  - `net:safe-fetch-pinned`: Pinned SSRF-protected HTTP request handler validated via `isTrustedSender` and `validateSafeFetchPinnedIpc`.
  - `window:set-opacity`, `window:set-always-on-top`, `window:minimize`, `window:close`.
  - `desktop:get-sources`: Desktop capturer screen/window enumerator.
  - `keychain:get-api-key`, `keychain:set-api-key`: OS secure credential storage (`safeStorage`).
  - `ocr:recognize`: Native macOS Vision / Windows OCR through `ocrService.ts`.
  - `pdf:extract-text`: Multi-page PDF text extraction with OCR fallback (`pdfParser.ts`).

### 1.2 Preload & IPC Layer (`electron/preload.ts`, `electron/services/security.ts`)
- Context isolation enabled (`contextIsolation: true`, `nodeIntegration: false`).
- Exposed APIs under `window.electronAPI`:
  - `safeFetchPinned(options)`
  - `getApiKey(provider)`, `setApiKey(provider, key)`
  - `recognizeScreen(bounds, mode)`
  - `extractPdfText(buffer)`
  - Window control APIs (`setWindowOpacity`, `minimize`, `close`, `quitApp`)
  - WebSocket pairing info for browser extension (`getWsInfo`).
- Strict sender verification with exact dev port checking and production bundle path verification.

### 1.3 React Renderer (`src/App.tsx`, `src/screens/`)
- **Navigation Shell**: `AppSidebar` + `AppTopBar` routing to 11 main views:
  1. `overview`: OverviewDashboardScreen
  2. `preparation`: InterviewPreparationScreen
  3. `teleprompter`: Live Interview Teleprompter (with distraction-free full focus mode)
  4. `mock_gym`: MockGymView (Practice Studio)
  5. `career_ops`: CareerOpsView (Job tracker, auto-fill, letter generator)
  6. `projects`: ProjectsScreen (Field-level provenance and project inspection)
  7. `evidence_vault`: EvidenceVaultScreen (Zero-trust verified evidence explorer)
  8. `resume_docs`: ResumeAndDocumentsScreen (Resume & website crawling manager)
  9. `knowledge_base`: KnowledgeBaseScreen (Domain separation: candidate vs tech knowledge)
  10. `history`: InterviewHistoryScreen
  11. `analytics`: AnalyticsScreen
  12. Modals: `OnboardingModal`, `ResumeAndJobModal`, `SettingsPanel`, `SessionsPanel`.

### 1.4 State Stores (`src/store/`)
- `useAppStore.ts`: Primary application state (interview transcript, questions, generated answers, teleprompter queue, AI streaming, live settings, window opacity, focus mode).
- `useCandidateVaultStore.ts`: CareerOps-specific candidate vault (contact info, work auth, tech stack, job targets).
- `useCareerOpsStore.ts`: CareerOps job pipeline, applications, follow-ups.
- `usePracticeStore.ts`: Mock practice studio drills, weakness map, scoring sessions.

### 1.5 Candidate Knowledge & Ingestion Systems
- **Candidate Intelligence (`src/services/candidateIntelligence.ts`)**:
  - `CandidateKnowledgeBase`: Maintains `ProjectProfile`, `fieldProvenance`, ticket issuance (`CandidateConfirmationWorkflow`), and factual checks.
  - Re-instantiated from `resumeText` in multiple screens.
- **Knowledge Vault (`src/services/knowledgeVault/`)**:
  - `KnowledgeVaultService`: Persistent JSON store (`iac_candidate_knowledge_vault_v2`), entities (`CandidateProfile`, `ProjectRecord`, `ExperienceRecord`, `TechnologyRecord`, `EvidenceRecord`), provenance classification (`EvidenceClassification`).
- **Ingestion (`src/services/ingestion/`)**:
  - `pdfExtractor.ts`, `docxExtractor.ts`, `textExtractor.ts`.
  - `resumeStructuredExtractor.ts`: Regex & section extraction into structured claims.
- **Website Crawler (`src/services/website/`)**:
  - `websiteCrawler.ts`, `websiteSourceService.ts`, `safeConnectionFetcher.ts`: Pinned crawling with robots.txt check, byte limits, and rate limits.
- **Evidence Verification (`src/services/evidenceInspection.ts`, `electron/services/evidenceVerificationService.ts`)**:
  - Real GitHub API inspection via `GitHubRepositoryProvider` (commit SHA, tree hash, file content verification).

---

## 2. Duplicate & Fragmented Systems Analysis

| Domain | Existing Implementations | Problem / Gap | Solution in IAC 2.0 |
| :--- | :--- | :--- | :--- |
| **Candidate Profile** | 1. `useCandidateVaultStore.ts` (`CandidateVaultProfile`)<br>2. `knowledgeVault/types.ts` (`CandidateProfile`)<br>3. `candidateIntelligence.ts` (`CandidateProfile` / `CandidateIdentity`) | Fragmented data stores; editing personal info in CareerOps does not update KnowledgeBase or EvidenceVault. | Unify into **CanonicalCandidateProfile** in Phase 2, maintaining backward-compatible store bindings. |
| **Project Tracking** | 1. `candidateIntelligence.ts` (`ProjectProfile`)<br>2. `knowledgeVault/types.ts` (`ProjectRecord`) | `CandidateKnowledgeBase` stores projects in memory while `KnowledgeVaultService` persists to localStorage; changes in one can drift from the other. | Canonicalize project records with synchronized two-way bridges. |
| **Onboarding** | `OnboardingModal.tsx` | Currently only covers LLM API provider setup and simulated mic test; zero candidate onboarding or profile extraction. | Build **Complete Multi-Step Candidate Profile Wizard** (Sections A-I) with resume import and review. |
| **Settings** | `SettingsPanel.tsx` | General AI model & audio settings; lacks GitHub repository management and Website crawling intelligence settings. | Introduce dedicated **GitHub Integration** & **Website Intelligence** tabs with full editability. |
| **Cross-Device Detection** | Ad-hoc checks (`window.electronAPI ? ... : ...`) | No structured capability service; brittle on browser or mobile viewport. | Build **DeviceCapabilityService** with capability matrix and responsive layouts. |

---

## 3. Feature Implementation Status Matrix

| Feature | Status | Notes |
| :--- | :--- | :--- |
| **Screen Task Classification** | Implemented | Context-aware classifier (`CODING_PROBLEM`, `JOB_APPLICATION_FORM`, `SYSTEM_DESIGN`, etc.) |
| **Application Form Assistance** | Implemented | Hardened against hallucinations; respects `CANDIDATE_CONFIRMED` vs `VALIDATED`. |
| **Candidate Speaking Gate** | Implemented | Fail-closed quarantine prevents ungrounded answers from entering the teleprompter queue. |
| **Candidate Onboarding Wizard** | Missing | Current modal only handles API keys; full wizard (Sections A-I) needed. |
| **Canonical Candidate Model** | Partial | `KnowledgeVaultService` has schema v2, but lacks full fact provenance metadata & edit history. |
| **Editable GitHub Integration** | Partial | Read-only backend in `evidenceInspection.ts`; lacks interactive UI for repos, branches, and exclusion. |
| **Editable Website Intelligence**| Partial | Crawler works via seed URLs; lacks allowed-domains UI, scheduled refresh, and claim editor. |
| **Multi-Profile Support** | Missing | Single profile supported; need scoped profiles for general career vs specific applications. |
| **Device Capability Service** | Missing | Need detection of platform features (screen capture, OCR, audio, transparency, shortcuts). |
| **Feedback Centre & Analytics** | Partial | Local analytics exists; needs user feedback survey and privacy-preserving aggregate metrics. |

---

## 4. Phased Implementation Roadmap

### Phase 1: Complete Candidate Profile Wizard
- **Goal**: Polished multi-step onboarding wizard covering Sections A through I.
- **Scope**:
  - Multi-step form: Personal Identity (A), Education (B), Career (C), Skills (D), Experience (E), Projects (F), Achievements (G), Preferences (H), Employment Declarations (I).
  - Explicit confirmation for all sensitive declarations (work auth, sponsorship, clearance).
  - Autosave, resume later, skip optional sections, progress bar, validation.
  - Resume parser import, project info import, inline editing, fact deletion, export profile, clear data.
  - Non-blocking: Can be dismissed/resumed at any time.

### Phase 2: Canonical Personalization & Evidence Model
- **Goal**: One unified candidate knowledge and evidence model.
- **Scope**:
  - Every fact holds: `id`, `value`, `category`, `source`, `sourceUrlOrFile`, `status` (`EvidenceClassification`), `confidence`, `candidateConfirmed`, `createdAt`, `lastVerifiedAt`, `isExpired`, `editHistory`.
  - Invariants: GitHub repo code != personal authorship; resume text != production experience; description != deployment/impact.
  - Synchronize `KnowledgeVaultService`, `CandidateKnowledgeBase`, and store subscribers.

### Phase 3: Editable GitHub Integration
- **Goal**: Full GitHub connection settings and repository management.
- **Scope**:
  - Connect/disconnect, username, profile URL, add/remove repo URLs, branch selection, directory filtering, on-demand re-scan.
  - Review extracted summaries, edit details, confirm personal contributions, exclude repos.
  - Secure token storage via OS keychain, strict URL validation, SSRF guards, rate-limiting handlers.

### Phase 4: Editable Website & Portfolio Intelligence
- **Goal**: Manage portfolio and web presence sources safely.
- **Scope**:
  - Add/remove portfolio URLs, configure allowed domains, crawl depth, path inclusion/exclusion, robots.txt compliance.
  - Manual & scheduled refresh, crawl progress, review and approve extracted claims, mark unsupported claims.

### Phase 5: Multiple Personal Profiles
- **Goal**: Profile scoping for General Career, Specific Applications, Interviews, Academic, Freelance.
- **Scope**:
  - Scoped resume version, job description, company details, candidate notes, relevant evidence.
  - Cache invalidation upon profile switch to prevent data leakage between employers.

### Phase 6: Cross-Platform & Device Capabilities
- **Goal**: Capability-aware architecture for macOS, Windows, Linux, browser, and mobile/tablet web.
- **Scope**:
  - `DeviceCapabilityService` detecting screen capture, OCR, window positioning, always-on-top, audio, clipboard.
  - UI modes: Full workspace, Compact overlay, Privacy mode, Focus mode, Accessibility mode, Mobile mode.

### Phase 7: Product Design System & Accessibility
- **Goal**: Coherent visual polish, dark/light themes, keyboard shortcuts, touch-friendly UI.

### Phase 8: Feedback Centre & Product Telemetry
- **Goal**: In-app feedback submission, bug reports with consent-based logs, privacy-preserving metrics dashboard.

### Phase 9: Reliability & Security Hardening
- **Goal**: End-to-end review of IPC boundaries, secret redaction, crash recovery, and data isolation.

### Phase 10: Compatibility Matrix & Comprehensive Testing
- **Goal**: Vitest test coverage across all new engines, Playwright multi-viewport testing, accessibility audits.

### Phase 11: Documentation & Release Gate
- **Goal**: Complete architectural docs, user guide, migration guide, and release sign-off.
