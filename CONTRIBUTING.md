# Contributing to AI Interview Assistant (IAC)

Thank you for your interest in contributing to **AI Interview Assistant (IAC)**! This document provides guidelines, architectural principles, and the development workflow required to maintain a secure, trustworthy, and high-quality codebase.

---

## 1. Product Direction & Non-Negotiable Rules

**IAC is exclusively an interview practice gym and delivery coaching application.**

- **Practice Gym Only:** The product simulates realistic technical, system design, and behavioral interviews (with timers, realistic pauses, and follow-up probes) to help candidates build genuine skill and composure.
- **Strictly No Live Copilot or Proctor Evasion:** IAC must **never** be designed to hide from, deceive, or bypass an interviewer, proctor, or screen-sharing software. It must not generate or inject answers on a candidate's behalf during real live interviews or assessments.
- **Evidence-Based Scoring:** Rubrics and scores must be grounded in verbatim quotes from what the candidate actually spoke or coded. Unverifiable quotes are capped and discarded.
- **Zero Fabrication:** The application must never invent background details about the user. All context must originate strictly from the user's uploaded resume, configured story bank, or live practice transcript.

---

## 2. Technology Stack

- **Desktop Framework:** Electron 33 (sandboxed in production, contextIsolation enabled)
- **Frontend:** React 18 + TypeScript 5
- **Build & Bundling:** Vite 6 + `vite-plugin-electron`
- **State Management:** Zustand 5
- **Testing:** Vitest 5 (unit & calibration) + Playwright (end-to-end)
- **Local Persistence:** Electron `safeStorage` (keychain) & isolated `userData`

---

## 3. Development Setup

### Prerequisites

- Node.js `20.x` or later
- npm `10.x` or later
- macOS, Linux (Ubuntu 24.04), or Windows 10/11

### Initializing the Workspace

```bash
git clone https://github.com/Abhitvg/IAC.git
cd IAC
npm ci
```

### Running Locally

```bash
# Start renderer Vite server + Electron app in development mode
npm run electron:dev

# Or run renderer only in browser preview
npm run dev
```

---

## 4. Quality & Verification Gates

Before submitting pull requests or committing code, all 5 automated verification gates must pass without error:

```bash
# 1. Check code formatting
npm run format:check

# 2. Lint source code
npm run lint

# 3. Static type check across renderer and electron processes
npm run typecheck

# 4. Run comprehensive test suite (unit, integration, calibration, security)
npm test

# 5. Build production bundle & check zero secrets leakage
npm run build
npm run security:check
```

---

## 5. Architectural Conventions

1. **Commit Messages:** Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat(...)`: New capability or user-facing feature
   - `fix(...)`: Bug fix or calibration correction
   - `test(...)`: Adding or updating test suites
   - `refactor(...)`: Internal refactoring without feature change
   - `chore(...)`: Maintenance, dependency updates, or documentation
2. **Dependency Discipline:** Do not add dependencies without a one-line justification in the commit message. Prefer maintained, modern packages over deprecated libraries.
3. **Security Invariants:**
   - Provider API keys must stay in the main process and be encrypted via OS keychain `safeStorage`.
   - File system access is restricted to `userData` and dialog-approved files with symlink canonicalization (`getCanonicalPath`).
   - Renderer executes under a strict Content-Security-Policy (CSP) with `skipHtml={true}` on Markdown rendering.
4. **Calibration Suite:** Any changes to prompts (`src/services/practice/prompts/`) or scoring logic (`LLMScorer.ts`, `EvidenceValidator.ts`) must pass the regression calibration harness in `tests/calibration/calibration.test.ts`.

---

## 6. Reporting Security Vulnerabilities

Please review our [SECURITY.md](file:///Users/abhisheksingh/Documents/ai-interview-assistant/SECURITY.md) for full vulnerability disclosure procedures.
