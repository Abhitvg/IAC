# Milestone M5 Demo: ATS Apply Workers, Answer Bank, Proof Capture & Assist Queue

This document demonstrates the completion and verification of **Milestone M5** for CareerOps.

---

## 1. Overview of Capabilities

Milestone M5 implements the autonomous ATS application pipeline adhering strictly to standing consent and code-level Hard Lines:

1. **Answer Bank (`packages/cloud-core/src/apply/answer-bank.ts`)**:
   - Deterministically resolves applicant fields from verified Career Graph facts and Sprint Contract defaults.
   - Computes verified total years of experience from confirmed roles without exaggeration (H3).
   - Resolves work authorization, visa sponsorship, and salary expectations from standing contract.
   - **Zero-Block Policy**: If an unknown or sensitive required question has no contract default, the job is skipped immediately (`skipReason: missing_default_answer`), never blocking on a human.

2. **Playwright Apply Worker Fleet & Egress Security (`packages/cloud-core/src/apply/playwright-worker.ts`)**:
   - **Hard Line H1**: Strictly prohibits and prevents any automated action against LinkedIn. Any egress attempt to `*.linkedin.com` throws a `HardLineH1ViolationError`.
   - **Egress Allowlist**: Enforces traffic only to approved employer ATS domains (`*.greenhouse.io`, `*.lever.co`, `*.ashbyhq.com`, `*.workable.com`, `*.smartrecruiters.com`, `*.myworkdayjobs.com`).
   - Ephemeral profiles with isolated browser contexts.

3. **Bot Detection & Assist Queue Handoff (`packages/cloud-core/src/apply/assist-queue.ts`)**:
   - **Hard Line H2**: Strictly forbids CAPTCHA or bot-detection circumvention.
   - Automatically detects reCAPTCHA, hCaptcha, Cloudflare Turnstile, Arkose FunCaptcha, login/SSO barriers, and MFA prompts.
   - Immediately dispatches an `AssistQueueItem` with prefilled answers for one-click completion by the user in their own browser with genuine user gesture.

4. **Cryptographic Proof Capture (`packages/cloud-core/src/apply/proof-capture.ts`)**:
   - Captures confirmation screenshot reference, confirmation number, and generates a canonical SHA-256 digest (`payloadSha256`) of the exact submitted payload.
   - Satisfies tracker `SubmissionProofSchema` invariant for transitioning to `applied`.

5. **ATS Adapters (`packages/cloud-core/src/apply/adapters/`)**:
   - Dedicated adapters for Greenhouse, Lever, Ashby, Workable, SmartRecruiters, and Workday with payload formatters and field mappers.

6. **Database & API Endpoints**:
   - Migration `0007_assist_queue.sql` with forced tenant Row-Level Security.
   - `POST /v1/apply/submit`: Autonomous apply wave submitter.
   - `GET /v1/assist-queue`: Filtered list of pending/completed assist actions.
   - `POST /v1/assist-queue/:id/open`: Mark opened.
   - `POST /v1/assist-queue/:id/complete`: Complete with execution notes.
   - `POST /v1/assist-queue/:id/dismiss`: Dismiss item.

---

## 2. Verification & Test Suite

Run the M5 test suite:
```bash
npx vitest run tests/m5-*.test.ts
```

Output:
```text
 ✓ tests/m5-playwright-worker.test.ts (7 tests)
 ✓ tests/m5-answer-bank.test.ts (5 tests)
 ✓ tests/m5-assist-queue.test.ts (3 tests)
 ✓ tests/m5-apply-runner.test.ts (7 tests)
 ✓ tests/m5-api-apply.test.ts (3 tests)

 Test Files  5 passed (5)
      Tests  25 passed (25)
```

Run all project milestone tests:
```bash
npx vitest run tests/m*.test.ts
# 110 passed across 20 files
```

Check static types and secret scanning:
```bash
npm run typecheck:cloud
npm run security:source
npm run build:api
```

---

## 3. End-to-End Walkthrough

### Scenario A: Autonomous Submission with Cryptographic Proof
```bash
curl -X POST http://localhost:3000/v1/apply/submit \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-tenant-id: <TENANT_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "job": {
      "sourceId": "gh_123",
      "platform": "greenhouse",
      "company": "Stripe",
      "title": "Senior Infrastructure Engineer",
      "url": "https://boards.greenhouse.io/stripe/jobs/123",
      "externalId": "123"
    },
    "evaluationScore": 4.5
  }'
```
**Response:**
```json
{
  "result": {
    "status": "applied",
    "jobId": "gh_123",
    "company": "Stripe",
    "role": "Senior Infrastructure Engineer",
    "proof": {
      "submissionId": "sub_49ec23f5-...",
      "submittedAt": "2026-11-12T07:45:00.000Z",
      "proofUrl": "https://storage.careerops.local/proofs/proof.png",
      "payloadSha256": "4b76a77f...",
      "confirmationNumber": "CONF-1731397500000"
    }
  }
}
```

### Scenario B: Cloudflare / CAPTCHA Encountered (H2 Assist Queue Handoff)
```bash
curl -X POST http://localhost:3000/v1/apply/submit \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-tenant-id: <TENANT_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "job": {
      "sourceId": "lv_456",
      "platform": "lever",
      "company": "Notion",
      "title": "Staff Engineer",
      "url": "https://jobs.lever.co/notion/456",
      "externalId": "456"
    },
    "mockDriver": {
      "html": "<html><body><div class=\"cf-turnstile\"></div></body></html>"
    }
  }'
```
**Response:**
```json
{
  "result": {
    "status": "assist_required",
    "jobId": "lv_456",
    "company": "Notion",
    "role": "Staff Engineer",
    "assistQueueItem": {
      "id": "e6749962-...",
      "tenantId": "<TENANT_ID>",
      "company": "Notion",
      "role": "Staff Engineer",
      "platform": "lever",
      "targetUrl": "https://jobs.lever.co/notion/456",
      "handOffReason": "captcha_detected",
      "status": "pending",
      "userGestureRequired": true
    },
    "reason": "Encountered bot challenge (captcha_detected); handed off to Assist Queue (H2)"
  }
}
```
User inspects and acts on the queue:
```bash
curl http://localhost:3000/v1/assist-queue?status=pending \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-tenant-id: <TENANT_ID>"
```
