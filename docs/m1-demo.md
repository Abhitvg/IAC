# M1 Career Graph & Sprint Contract Onboarding — Demo and Validation

## Scope

Milestone 1 builds on the M0 cloud foundation and establishes the candidate fact ingestion pipeline and standing-consent onboarding workflow (target duration ≤10 minutes).

It fulfills the following requirements:

- **Canonical Fact Schemas**: Work experience, education, skills, technical projects, certifications, and profile headline/summary/work-auth.
- **Multi-Source Ingestion & Extraction**:
  - Resume parser extracting work history, dates, bullets, skills, education, and projects with evidence hashes.
  - LinkedIn Data Export parser supporting RFC-4180 CSV imports (`Positions.csv`, `Education.csv`, `Skills.csv`, `Certifications.csv`, `Profile.csv`).
  - GitHub profile and repository importer ingesting technical projects, star/fork metrics, and programming languages as verified skills.
- **Untrusted Input Sanitization & Prompt Injection Defense (H5)**:
  - Defangs prompt-injection markers (`<|im_start|>`, `[INST]`, `SYSTEM:`, `ignore previous instructions`, control characters, null bytes).
- **Fact Confirmation & Deduplication**:
  - Deduplicates candidate facts across multiple sources by stable fact keys (`factKey`), selecting highest-confidence entries.
  - Prepares KMS-backed AES-256-GCM encrypted envelopes (`valueEnvelope`) bound to the tenant and `career-graph:<fact_key>` context.
- **Standing Consent & Sprint Contract Signing**:
  - Builds the complete Sprint Contract draft: roles, seniority, locations, remote preference, salary floor, work authorization, blocklist, enabled channels, daily caps, screening questions, and allowed facts.
  - Enforces **Hard Line H3**: Only facts with confirmed review may be included in `allowedFactIds` or referenced in screening question answers.
  - Enforces **Hard Line H4**: Email outreach channel requires explicit outreach consent.
  - Produces immutable, HMAC-SHA256 signed `ConsentRecord`.
- **Authenticated Cloud API Routes**:
  - `POST /v1/career-graph/extract/resume`: Ingests raw resume text and returns candidate facts.
  - `POST /v1/career-graph/extract/linkedin`: Ingests LinkedIn export CSVs and returns candidate facts.
  - `POST /v1/career-graph/extract/github`: Ingests GitHub profile and repositories and returns candidate facts.
  - `POST /v1/career-graph/facts`: Persists encrypted candidate facts with RLS and advisory locks.
  - `POST /v1/career-graph/facts/:id/review`: Records contributor confirmation or rejection.
  - `POST /v1/sprint-contract`: Signs and activates the tenant's Sprint Contract.

---

## Run Locally

1. Verify TypeScript types:
   ```bash
   npm run typecheck:cloud
   ```
2. Run M1 test suites:
   ```bash
   npx vitest run tests/m1-career-graph-importers.test.ts tests/m1-sprint-contract-onboarding.test.ts tests/m1-api-routes.test.ts tests/career-graph-api.test.ts tests/career-graph.test.ts
   ```
3. Verify source secret hygiene:
   ```bash
   npm run security:source
   ```

---

## Demo Script

### 1. Ingest Resume Text

Call `POST /v1/career-graph/extract/resume` with an authenticated bearer token:

```json
{
  "text": "Jane Doe\nStaff Engineer\nEXPERIENCE\nAcme - Staff SWE\nJan 2022 - Present\n- Built high throughput systems\nSKILLS\nTypeScript, Go, Kubernetes",
  "filename": "jane_doe_resume.txt"
}
```

**Expected**: Returns `200 OK` with candidate facts for profile headline, experience at Acme, and skills.

### 2. Ingest LinkedIn Export CSVs

Call `POST /v1/career-graph/extract/linkedin`:

```json
{
  "positionsCsv": "\"Company Name\",\"Title\",\"Description\",\"Location\",\"Started On\",\"Finished On\"\n\"FinTech\",\"Principal Architect\",\"Built ledger\",\"NY\",\"2021\",\"\"",
  "skillsCsv": "\"Name\"\n\"PostgreSQL\"\n\"Distributed Systems\""
}
```

**Expected**: Returns `200 OK` with candidate facts marked `source.kind: 'import'` and `source.reference: 'linkedin:Positions.csv'`.

### 3. Ingest GitHub Technical Work

Call `POST /v1/career-graph/extract/github`:

```json
{
  "user": { "login": "janedoe", "name": "Jane Doe" },
  "repositories": [
    {
      "name": "raft-kv",
      "description": "Raft distributed store",
      "html_url": "https://github.com/janedoe/raft-kv",
      "language": "Go",
      "stargazers_count": 120,
      "forks_count": 15
    }
  ]
}
```

**Expected**: Returns `200 OK` with project fact `project.janedoe-raft-kv` (metrics: "120 stars, 15 forks") and verified language skill `skill.go`.

### 4. Confirm Facts & Enforce Truthfulness (H3)

1. Candidate facts are reviewed via `POST /v1/career-graph/facts/:factId/review` with `{ "decision": "confirmed" }`.
2. Attempt to sign a Sprint Contract referencing an unconfirmed fact in `allowedFactIds` or screening question grounding.
   **Expected**: Rejection with `Truthfulness violation (H3)`.

### 5. Sign Sprint Contract (Standing Consent)

Submit the verified draft to `POST /v1/sprint-contract`.
**Expected**: Returns `201 Created` with contract ID, revision number, immutable contract hash, and timestamp.

---

## Next Milestone

- **M2**: Application Tracker, State Machine, Dashboard, Real-time Activity Feed (WebSocket/SSE), and Undo/Withdraw workflows.
