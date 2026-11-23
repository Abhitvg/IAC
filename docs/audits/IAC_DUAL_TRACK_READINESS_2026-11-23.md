# IAC Dual-Track Readiness Audit — 2026-11-23

**Repository:** `Abhitvg/IAC`  
**Audit baseline:** `main` at `8cdaac038836650cfa6b9fa0e20d09991bc58bd1`  
**Working branch:** `audit/iac-dual-track-hardening-2026-11-23`  
**Purpose:** Improve IAC as both a credible engineering showcase and a rigorous interview-practice product.

## Scope and evidence boundary

This is a source and GitHub CI review, not a production-readiness certification. Source files, open pull requests, repository documentation, and the latest available workflow results were inspected. No local build, physical microphone test, packaged-app installation, screen-reader session, or manual cross-platform visual acceptance was performed during this audit.

PR #243 (`feat/responsive-shortcuts-transparency`) is separate from this branch. Its latest head `a3ff8cc8fdae393135b851cbaa49ef9612a30430` passed all four jobs in CI run `45116379227` (Ubuntu, Windows, macOS, and PostgreSQL tenant isolation), but PR #243 remains open and unmerged. This audit branch starts from `main`; it does not silently include PR #243.

## Sophos candidate-guide alignment

The uploaded `Sophos Interview Guide.pdf` is a general candidate guide, not a job description. It says a typical interview is 50 minutes, with the last 10 minutes reserved for candidate questions; the number of interviews varies by role and level. It emphasizes authentic, specific examples and asks candidates to explain the situation, their personal role, the actions they took and why, and the outcome, impact, and learning. It also encourages candidates to ask for clarification and treat the interview as a two-way conversation.

The full dress-rehearsal timer is now 50 minutes and has separate technical, system-design, and candidate-Q&A phases. Candidate questions are recorded under their own category, excluded from behavioral scoring and competency coverage, and not scored as interview answers; the Q&A prompt reminds candidates that around 10 minutes are reserved. The application does not yet enforce a separate 10-minute phase countdown, so candidates should still manage that boundary deliberately. The guide does not disclose a technical syllabus, exact role title, or actual interview questions, so the included Java/SWE pack is preparation material based on the user's current study focus—not a representation of Sophos's question bank.

## Product and engineering findings

### P1 — Candidate/practice data at rest

- **Evidence:** Practice sessions, feedback, stories, study plans, candidate vault, CareerOps applications, and some interview history use renderer localStorage or userData JSON paths. README accurately states that normal candidate/practice persistence is not uniformly encrypted.
- **Disposition:** Open. Do not claim comprehensive encryption. PRs #210/#212 add alternative OS-keyring persistence foundations; PR #211 migrates only part of the canonical profile. None closes the full persistence inventory.

### P1 — Live interview data egress

- **Evidence:** README documents raw audio sent to the selected cloud speech provider and candidate context (resume, job description, role, recent conversation) sent to cloud LLM providers. The live path does not provide a per-utterance redaction preview.
- **Disposition:** Open product/privacy work. Keep provider choice and data destination visible before capture; test every cloud-bound path and local endpoint configuration.

### P1 — Physical audio acceptance

- **Evidence:** Automatic transcript routing is intent classification, not speaker diarization. A candidate's question-shaped speech may still be mistaken for interviewer speech.
- **Disposition:** Open manual acceptance gate. Test Hindi/Hinglish, English, interruptions, device changes, permission denial, pause/resume, and headset disconnects on real devices.

### P2 — CareerOps first-launch integrity

- **Evidence:** `loadInitialApplications()` fell back to pre-filled demo applications on a fresh install even though a separate explicit demo-mode action existed. That made sample records appear as real user pipeline entries.
- **Disposition:** Fixed on this branch: fresh state is empty; demo data remains an explicit opt-in. Regression test covers first launch, demo opt-in, and clearing demo data.

### P2 — Custom practice-pack durability

- **Evidence:** `QuestionBank.importCustomPack()` stored imported questions only in a static in-memory array. Imported packs disappeared after an application restart.
- **Disposition:** Fixed on this branch: validated custom questions are persisted, restored at practice-store startup, and included in the existing practice-data wipe. Regression coverage added.

### P2 — Interview-practice relevance

- **Evidence:** The existing practice engine supports coding, conceptual, system-design, behavioral, evidence-based scoring, hints, and adaptive rounds. The user's current preparation benefits from a focused Java/software-engineering rehearsal path; the supplied Sophos guide does not identify a specific job title or technical stack.
- **Disposition:** Added an opt-in Sophos Java/software-engineering practice pack and a one-click loader in Mock Practice Gym. It is original practice material, not a claim about actual Sophos interview questions.

### P2 — Responsive/accessibility acceptance

- **Evidence:** CI contains selected shell overflow and accessibility checks, but these do not prove high-DPI, compact-window, keyboard-only, screen-reader, or native window behavior on physical devices.
- **Disposition:** Open. Keep manual acceptance separate from automated CI claims.

### P2 — Cloud deployment boundary

- **Evidence:** CareerOps cloud code and architecture are present, but open PR #232 describes remaining concrete AWS KMS SDK/runtime wiring and migration work. The cloud demo guide requires distinct runtime and migration credentials and explicit deployment setup.
- **Disposition:** Do not describe AWS production deployment or KMS runtime integration as complete until the deployed composition and real environment are verified. No AWS resources were provisioned by this work.

## Changes in this branch

1. **Clean CareerOps first launch**
   - New installs start with an empty real application pipeline.
   - The existing explicit demo action remains available.
   - Regression test verifies that demo records are loaded only after opt-in and can be cleared.

2. **Durable custom interview packs**
   - Added a dedicated localStorage key for validated custom question entries.
   - Restores saved packs during practice-store initialization.
   - General mock rounds prioritize imported pack questions; an explicitly selected curriculum topic still takes precedence.
   - A failed persistence write rolls back the in-memory import.
   - The existing delete-all-practice-data action removes the saved pack and clears its in-memory entries.

3. **Sophos Java/software-engineering practice pack**
   - Original practice questions covering Java/OOP, collections, DSA, Spring Boot, REST, SQL, concurrency, microservices, AWS/CI-CD, application security, automated testing, troubleshooting, and behavioral ownership.
   - Loaded explicitly from Mock Practice Gym; the user is not forced into a company-specific curriculum.
   - The pack is clearly not represented as official or leaked company interview material.

## Required validation before merge

- Full CI matrix: formatting, lint, TypeScript, unit/integration tests, desktop builds, security scans, packaged smoke checks, and PostgreSQL tenant isolation.
- Verify the new CareerOps first-launch regression test and custom-pack restore/wipe lifecycle.
- Verify imported questions are available to the mock interviewer after restart and are removed by the practice-data wipe.
- Run the Sophos pack through a mock session and check that the scorer evaluates the candidate's own explanation/code rather than treating expected points as a model answer.
- Manually test microphone lifecycle and audio routing on actual devices.
- Manually inspect the app at compact and standard window sizes on macOS, Windows, and Linux.
- Review the full PII persistence inventory and complete the OS-keyring migration before claiming data-at-rest encryption.
- Do not merge to `main` without explicit user approval.

## Non-negotiable boundaries

- No merge to `main` without explicit approval.
- No AWS resource provisioning or deployment in this audit.
- No direct AWS KMS calls from CareerOps application code.
- No unattended LinkedIn actions.
- No fabricated candidate facts, metrics, experience, or interview outcomes.
- No claims that hosted CI substitutes for real-device or manual acceptance.
